-- what-to-eat-today · Supabase schema
-- Supabase SQL Editor에서 이 파일 전체를 붙여넣고 한 번에 실행.
-- 이미 한 번 실행한 적이 있으면 멱등하게 다시 실행 가능 (drop이 아니라 create or replace).

-- ─────────────────────────────────────────────────────────
-- 0. ADMIN_KEY 보관 — private schema의 설정 테이블
--    Supabase 호스팅에서 ALTER DATABASE 권한이 없어 GUC 대신 테이블 사용.
--    private schema는 anon/authenticated에 GRANT를 주지 않아 클라이언트가 직접 SELECT 불가.
--    RPC가 security definer로 우회해서 읽는다.
--    값을 바꾸려면:
--      update private.app_config set value = '새 값' where key = 'admin_key';
-- ─────────────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

insert into private.app_config (key, value) values ('admin_key', 'test123')
on conflict (key) do update set value = excluded.value;

-- ─────────────────────────────────────────────────────────
-- 1. 테이블
-- ─────────────────────────────────────────────────────────
create table if not exists public.restaurants (
  id              text primary key,
  name            text not null,
  category        text,
  address         text,
  naver_url       text,
  walking_minutes int,
  capacity        text,
  menus_text      text,
  note            text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- 이미 존재하던 테이블에 새 컬럼 멱등 추가
alter table public.restaurants add column if not exists naver_url text;
alter table public.restaurants add column if not exists capacity_room int;
alter table public.restaurants add column if not exists capacity_hall int;

create table if not exists public.polls (
  id                     text primary key,
  title                  text not null,
  meal_type              text,
  event_date             date,
  event_time             time,
  deadline               timestamptz not null,
  status                 text not null default 'active' check (status in ('active', 'closed')),
  description            text not null default '',
  restaurant_ids         text[] not null default '{}',
  removed_restaurant_ids text[] not null default '{}',
  created_at             timestamptz not null default now()
);

create table if not exists public.votes (
  poll_id     text not null references public.polls(id) on delete cascade,
  voter_name  text not null,
  attendance  text not null check (attendance in ('참석', '불참석', '보류')),
  choice_1_id text,
  choice_2_id text,
  voted_at    timestamptz not null default now(),
  primary key (poll_id, voter_name)
);

create index if not exists votes_poll_id_idx on public.votes (poll_id);
create index if not exists polls_status_deadline_idx on public.polls (status, deadline);

-- ─────────────────────────────────────────────────────────
-- 2. RPC: submit_vote
--    (poll_id, voter_name)로 upsert. 마감/상태 서버 검증.
-- ─────────────────────────────────────────────────────────
create or replace function public.submit_vote(
  p_poll_id     text,
  p_voter_name  text,
  p_attendance  text,
  p_choice_1_id text default null,
  p_choice_2_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_deadline timestamptz;
  v_existed  boolean;
begin
  if p_poll_id is null or btrim(p_poll_id) = ''
     or p_voter_name is null or btrim(p_voter_name) = ''
     or p_attendance is null or btrim(p_attendance) = '' then
    raise exception 'missing_required_fields';
  end if;
  if p_attendance not in ('참석', '불참석', '보류') then
    raise exception 'invalid_attendance';
  end if;

  select status, deadline into v_status, v_deadline
    from public.polls where id = p_poll_id;
  if not found then
    raise exception 'poll_not_found';
  end if;
  if v_status = 'closed' then
    raise exception 'poll_closed';
  end if;
  if now() > v_deadline then
    raise exception 'deadline_passed';
  end if;

  select exists (
    select 1 from public.votes where poll_id = p_poll_id and voter_name = p_voter_name
  ) into v_existed;

  insert into public.votes (poll_id, voter_name, attendance, choice_1_id, choice_2_id, voted_at)
  values (
    p_poll_id,
    p_voter_name,
    p_attendance,
    case when p_attendance = '참석' then p_choice_1_id else null end,
    case when p_attendance = '참석' then p_choice_2_id else null end,
    now()
  )
  on conflict (poll_id, voter_name) do update
  set attendance  = excluded.attendance,
      choice_1_id = excluded.choice_1_id,
      choice_2_id = excluded.choice_2_id,
      voted_at    = excluded.voted_at;

  return v_existed;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- 3. RPC: create_poll
--    ADMIN_KEY 검증 → poll id 충돌 회피 → INSERT.
-- ─────────────────────────────────────────────────────────
create or replace function public.create_poll(
  p_admin_key      text,
  p_title          text,
  p_meal_type      text,
  p_event_date     date,
  p_event_time     time,
  p_deadline       timestamptz,
  p_description    text,
  p_restaurant_ids text[]
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
  v_id       text;
  v_base     text := 'P' || to_char((now() at time zone 'Asia/Seoul')::date, 'YYYYMMDD');
  v_n        int := 2;
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if p_title is null or btrim(p_title) = ''
     or p_meal_type is null or btrim(p_meal_type) = ''
     or p_event_date is null
     or p_event_time is null
     or p_deadline is null
     or coalesce(array_length(p_restaurant_ids, 1), 0) < 2 then
    raise exception 'missing_required_fields';
  end if;

  v_id := v_base;
  while exists (select 1 from public.polls where id = v_id) loop
    if v_n > 99 then raise exception 'id_collision_exhausted'; end if;
    v_id := v_base || '-' || v_n::text;
    v_n := v_n + 1;
  end loop;

  insert into public.polls (
    id, title, meal_type, event_date, event_time, deadline,
    status, description, restaurant_ids, removed_restaurant_ids
  ) values (
    v_id,
    btrim(p_title),
    btrim(p_meal_type),
    p_event_date,
    p_event_time,
    p_deadline,
    'active',
    coalesce(p_description, ''),
    p_restaurant_ids,
    '{}'
  );

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- 4. RPC: update_poll
--    부분 업데이트. NULL인 필드는 변경 안 함.
--    `p_clear_description`을 true로 보내면 description을 ''로 명시 클리어.
--    restaurant_ids 변경 시 빠진 ID를 removed_restaurant_ids에 누적.
-- ─────────────────────────────────────────────────────────
create or replace function public.update_poll(
  p_admin_key          text,
  p_poll_id            text,
  p_title              text default null,
  p_meal_type          text default null,
  p_event_date         date default null,
  p_event_time         time default null,
  p_deadline           timestamptz default null,
  p_description        text default null,
  p_clear_description  boolean default false,
  p_status             text default null,
  p_restaurant_ids     text[] default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
  v_old_ids  text[];
  v_removed  text[];
  v_new_removed text[];
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if p_poll_id is null or btrim(p_poll_id) = '' then
    raise exception 'missing_required_fields';
  end if;
  if not exists (select 1 from public.polls where id = p_poll_id) then
    raise exception 'poll_not_found';
  end if;
  if p_status is not null and p_status not in ('active', 'closed') then
    raise exception 'invalid_status';
  end if;

  if p_restaurant_ids is not null then
    if coalesce(array_length(p_restaurant_ids, 1), 0) < 2 then
      raise exception 'too_few_restaurants';
    end if;

    select restaurant_ids, removed_restaurant_ids into v_old_ids, v_removed
      from public.polls where id = p_poll_id;

    -- 빠진 ID = (old - new) ∪ existing removed
    -- 다시 추가된 ID는 removed에서 제외
    select coalesce(array_agg(distinct x), '{}'::text[]) into v_new_removed
      from (
        select unnest(coalesce(v_removed, '{}')) as x
        union
        select unnest(coalesce(v_old_ids, '{}')) as x
      ) u
      where x is not null and x <> '' and x <> all(p_restaurant_ids);
  end if;

  update public.polls
  set title       = coalesce(p_title, title),
      meal_type   = coalesce(p_meal_type, meal_type),
      event_date  = coalesce(p_event_date, event_date),
      event_time  = coalesce(p_event_time, event_time),
      deadline    = coalesce(p_deadline, deadline),
      description = case
                      when p_clear_description then ''
                      when p_description is not null then p_description
                      else description
                    end,
      status      = coalesce(p_status, status),
      restaurant_ids = coalesce(p_restaurant_ids, restaurant_ids),
      removed_restaurant_ids = case
                                 when p_restaurant_ids is not null then v_new_removed
                                 else removed_restaurant_ids
                               end
  where id = p_poll_id;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- 4.5. RPC: 식당 CRUD (관리자 전용)
--   create_restaurant     — 신규 행 INSERT. id 충돌 시 'id_already_exists'.
--   update_restaurant     — 부분 업데이트. NULL은 변경 안 함.
--   delete_restaurant     — hard delete. 폴의 restaurant_ids에 남아있을 수 있어 클라이언트가 unknown id로 처리.
--   set_restaurant_active — soft toggle (active true/false).
-- ─────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select 'drop function if exists public.create_restaurant('
           || pg_get_function_identity_arguments(p.oid) || ') cascade;' as cmd
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_restaurant'
  loop execute r.cmd; end loop;
end $$;
create or replace function public.create_restaurant(
  p_admin_key       text,
  p_id              text,
  p_name            text,
  p_category        text default null,
  p_address         text default null,
  p_naver_url       text default null,
  p_walking_minutes int default null,
  p_capacity_room   int default null,
  p_capacity_hall   int default null,
  p_menus_text      text default null,
  p_note            text default null,
  p_active          boolean default true
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if p_id is null or btrim(p_id) = '' or p_name is null or btrim(p_name) = '' then
    raise exception 'missing_required_fields';
  end if;
  if exists (select 1 from public.restaurants where id = p_id) then
    raise exception 'id_already_exists';
  end if;

  insert into public.restaurants (
    id, name, category, address, naver_url, walking_minutes, capacity_room, capacity_hall, menus_text, note, active
  ) values (
    btrim(p_id), btrim(p_name),
    nullif(btrim(coalesce(p_category, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_naver_url, '')), ''),
    p_walking_minutes,
    p_capacity_room,
    p_capacity_hall,
    nullif(btrim(coalesce(p_menus_text, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_active, true)
  );

  return p_id;
end;
$$;

do $$
declare r record;
begin
  for r in
    select 'drop function if exists public.update_restaurant('
           || pg_get_function_identity_arguments(p.oid) || ') cascade;' as cmd
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_restaurant'
  loop execute r.cmd; end loop;
end $$;
create or replace function public.update_restaurant(
  p_admin_key            text,
  p_id                   text,
  p_name                 text default null,
  p_category             text default null,
  p_address              text default null,
  p_naver_url            text default null,
  p_walking_minutes      int default null,
  p_capacity_room        int default null,
  p_capacity_hall        int default null,
  p_menus_text           text default null,
  p_note                 text default null,
  p_active               boolean default null,
  p_clear_naver_url      boolean default false,
  p_clear_capacity_room  boolean default false,
  p_clear_capacity_hall  boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if not exists (select 1 from public.restaurants where id = p_id) then
    raise exception 'restaurant_not_found';
  end if;

  update public.restaurants
  set name            = coalesce(nullif(btrim(p_name), ''),     name),
      category        = coalesce(nullif(btrim(p_category), ''), category),
      address         = coalesce(nullif(btrim(p_address), ''),  address),
      naver_url       = case
                          when p_clear_naver_url then null
                          when p_naver_url is not null and btrim(p_naver_url) <> '' then btrim(p_naver_url)
                          else naver_url
                        end,
      walking_minutes = coalesce(p_walking_minutes, walking_minutes),
      capacity_room   = case
                          when p_clear_capacity_room then null
                          when p_capacity_room is not null then p_capacity_room
                          else capacity_room
                        end,
      capacity_hall   = case
                          when p_clear_capacity_hall then null
                          when p_capacity_hall is not null then p_capacity_hall
                          else capacity_hall
                        end,
      menus_text      = coalesce(nullif(btrim(p_menus_text), ''), menus_text),
      note            = coalesce(nullif(btrim(p_note), ''),       note),
      active          = coalesce(p_active, active)
  where id = p_id;
end;
$$;

create or replace function public.delete_restaurant(
  p_admin_key text,
  p_id        text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if not exists (select 1 from public.restaurants where id = p_id) then
    raise exception 'restaurant_not_found';
  end if;
  delete from public.restaurants where id = p_id;
end;
$$;

create or replace function public.set_restaurant_active(
  p_admin_key text,
  p_id        text,
  p_active    boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from private.app_config where key = 'admin_key';
  if v_expected is null or v_expected = '' or v_expected <> coalesce(p_admin_key, '') then
    raise exception 'unauthorized';
  end if;
  if not exists (select 1 from public.restaurants where id = p_id) then
    raise exception 'restaurant_not_found';
  end if;
  update public.restaurants set active = coalesce(p_active, true) where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- 5. RLS — 읽기는 누구나, 쓰기는 RPC만 (RPC는 security definer라 우회)
-- ─────────────────────────────────────────────────────────
alter table public.restaurants enable row level security;
alter table public.polls       enable row level security;
alter table public.votes       enable row level security;

drop policy if exists restaurants_read on public.restaurants;
drop policy if exists polls_read       on public.polls;
drop policy if exists votes_read       on public.votes;

create policy restaurants_read on public.restaurants for select using (true);
create policy polls_read       on public.polls       for select using (true);
create policy votes_read       on public.votes       for select using (true);
-- INSERT/UPDATE/DELETE 정책은 일부러 없음 → 익명 클라이언트는 직접 변경 불가.
-- 데이터 변경은 위의 RPC(security definer)로만 가능.

-- ─────────────────────────────────────────────────────────
-- 6. Realtime — votes 테이블의 변경을 클라이언트가 구독 가능
-- ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────
-- 7. RPC 호출 권한 — anon, authenticated에 EXECUTE 부여
-- ─────────────────────────────────────────────────────────
grant execute on function public.submit_vote(text, text, text, text, text)                     to anon, authenticated;
grant execute on function public.create_poll(text, text, text, date, time, timestamptz, text, text[])          to anon, authenticated;
grant execute on function public.update_poll(text, text, text, text, date, time, timestamptz, text, boolean, text, text[]) to anon, authenticated;
grant execute on function public.create_restaurant(text, text, text, text, text, text, int, int, int, text, text, boolean)     to anon, authenticated;
grant execute on function public.update_restaurant(text, text, text, text, text, text, int, int, int, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.delete_restaurant(text, text)                                 to anon, authenticated;
grant execute on function public.set_restaurant_active(text, text, boolean)                    to anon, authenticated;
