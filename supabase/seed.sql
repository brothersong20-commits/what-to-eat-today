-- what-to-eat-today · seed data
-- schema.sql 실행 후 검증용 더미 데이터.
-- 멱등 — 이미 같은 ID가 있으면 INSERT를 건너뜀.

-- 1. 식당 5개
insert into public.restaurants (id, name, category, address, walking_minutes, capacity, menus_text, note, active) values
  ('R001', '청담옥',     '한식', '강남구 테헤란로 123',  5, '룸 4~12인 / 단체 30명', '한우갈비살(45000)/평양냉면(12000)/육회(28000)',         '주차 가능, 흡연실 있음', true),
  ('R002', '스시조',     '일식', '강남구 역삼동 456',    8, '단체석 가능 / 룸 1개',  '런치오마카세(60000)/디너오마카세(120000)',              '예약 필수',              true),
  ('R003', '딘타이펑',   '중식', '강남구 강남대로 789',  6, '단체 20명 가능',        '샤오롱바오(13000)/볶음밥(11000)/마파두부(16000)',       '대기 길음',              true),
  ('R004', '에이오씨',   '양식', '강남구 도산대로 12',  10, '룸 8인 / 홀 단체 가능', '파스타런치(22000)/스테이크(48000)/하우스와인(9000)',    '분위기 좋음',            true),
  ('R005', '교대이층집', '고기', '서초구 서초대로 33',  12, '단체 40명 / 룸 다수',   '한우꽃등심(58000)/된장찌개(8000)/공기밥(2000)',         '회식 단골',              true)
on conflict (id) do nothing;

-- 2. 진행중 폴 — 5개 식당 모두 후보, 마감 5일 뒤
insert into public.polls (
  id, title, meal_type, event_date, event_time, deadline, status, description, restaurant_ids
) values (
  'PSEED-ACTIVE',
  '5월 부서 저녁회식',
  '저녁',
  ((now() at time zone 'Asia/Seoul')::date + 6),
  '18:30',
  ((now() at time zone 'Asia/Seoul') + interval '5 days')::timestamptz,
  'active',
  '5월 정기 회식입니다. 참석 부탁드려요.',
  ARRAY['R001','R002','R003','R004','R005']
)
on conflict (id) do nothing;

-- 3. 진행중 폴에 더미 투표 5개 (참석 3 / 보류 1 / 불참 1)
insert into public.votes (poll_id, voter_name, attendance, choice_1_id, choice_2_id) values
  ('PSEED-ACTIVE', '김민준', '참석',   'R001', 'R003'),
  ('PSEED-ACTIVE', '이서연', '참석',   'R001', 'R002'),
  ('PSEED-ACTIVE', '박지호', '참석',   'R003', 'R005'),
  ('PSEED-ACTIVE', '최수아', '보류',   null,   null),
  ('PSEED-ACTIVE', '정현우', '불참석', null,   null)
on conflict (poll_id, voter_name) do nothing;

-- 4. 마감된 폴 (closed 상태 + 결과 화면 검증)
insert into public.polls (
  id, title, meal_type, event_date, event_time, deadline, status, description, restaurant_ids
) values (
  'PSEED-CLOSED',
  '4월 환영회',
  '저녁',
  ((now() at time zone 'Asia/Seoul')::date - 10),
  '19:00',
  ((now() at time zone 'Asia/Seoul') - interval '11 days')::timestamptz,
  'closed',
  '신규 입사자 환영회입니다.',
  ARRAY['R001','R002','R004']
)
on conflict (id) do nothing;

insert into public.votes (poll_id, voter_name, attendance, choice_1_id, choice_2_id) values
  ('PSEED-CLOSED', '김민준', '참석', 'R002', 'R004'),
  ('PSEED-CLOSED', '이서연', '참석', 'R002', 'R001'),
  ('PSEED-CLOSED', '박지호', '참석', 'R004', 'R002'),
  ('PSEED-CLOSED', '최수아', '참석', 'R001', 'R002')
on conflict (poll_id, voter_name) do nothing;
