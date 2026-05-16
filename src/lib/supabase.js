import { createClient } from '@supabase/supabase-js';
import { parseMenusText } from './menus.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('환경변수 누락: VITE_SUPABASE_URL 또는 VITE_SUPABASE_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// ─────────────────────────────────────────────────────────
// 읽기
// ─────────────────────────────────────────────────────────
export async function loadRestaurants({ includeInactive = false } = {}) {
  let query = supabase.from('restaurants').select('*').order('id');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw new Error(`식당 로딩 실패: ${error.message}`);
  return (data || []).map(mapRestaurant);
}

function mapRestaurant(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category || '',
    area: r.area || '',
    address: r.address || '',
    naverUrl: r.naver_url || '',
    imageUrl: r.image_url || '',
    walkingMinutes: r.walking_minutes,
    capacityRoom: r.capacity_room ?? null,
    capacityHall: r.capacity_hall ?? null,
    menusText: r.menus_text || '',
    menus: parseMenusText(r.menus_text),
    note: r.note || '',
    businessHours: r.business_hours || '',
    active: !!r.active,
    isGroupDining: !!r.is_group_dining
  };
}

export async function loadCafes({ includeInactive = false } = {}) {
  let query = supabase.from('cafes').select('*').order('id');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw new Error(`카페 로딩 실패: ${error.message}`);
  return (data || []).map(mapCafe);
}

function mapCafe(c) {
  return {
    id: c.id,
    name: c.name,
    category: c.category || '',
    area: c.area || '',
    address: c.address || '',
    naverUrl: c.naver_url || '',
    imageUrl: c.image_url || '',
    walkingMinutes: c.walking_minutes,
    menusText: c.menus_text || '',
    menus: parseMenusText(c.menus_text),
    note: c.note || '',
    businessHours: c.business_hours || '',
    active: !!c.active
  };
}

export async function loadPolls() {
  const { data, error } = await supabase.from('polls').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(`투표 로딩 실패: ${error.message}`);
  return (data || []).map(mapPoll);
}

export async function loadPoll(pollId) {
  const { data, error } = await supabase.from('polls').select('*').eq('id', pollId).maybeSingle();
  if (error) throw new Error(`투표 로딩 실패: ${error.message}`);
  return data ? mapPoll(data) : null;
}

export async function loadVotes(pollId) {
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('poll_id', pollId)
    .order('voted_at', { ascending: true });
  if (error) throw new Error(`투표 결과 로딩 실패: ${error.message}`);
  return (data || []).map((v) => ({
    pollId: v.poll_id,
    voterName: v.voter_name,
    attendance: v.attendance,
    choice1Id: v.choice_1_id || '',
    choice2Id: v.choice_2_id || '',
    votedAt: v.voted_at || ''
  }));
}

function mapPoll(r) {
  return {
    id: r.id,
    title: r.title,
    mealType: r.meal_type || '',
    eventDate: r.event_date || '',
    eventTime: (r.event_time || '').slice(0, 5),
    deadline: toLocalDeadline(r.deadline),
    status: r.status || 'active',
    description: r.description || '',
    createdAt: r.created_at || '',
    restaurantIds: Array.isArray(r.restaurant_ids) ? r.restaurant_ids : [],
    removedRestaurantIds: Array.isArray(r.removed_restaurant_ids) ? r.removed_restaurant_ids : []
  };
}

// timestamptz(ISO) → "YYYY-MM-DD HH:mm" (로컬 KST). time.js의 parseDeadline은 두 포맷 모두 받음.
function toLocalDeadline(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// 클라이언트 폼 입력(YYYY-MM-DD HH:mm) → ISO. RPC가 timestamptz를 받음.
function toIsoDeadline(text) {
  if (!text) return null;
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ─────────────────────────────────────────────────────────
// 쓰기 (RPC)
// ─────────────────────────────────────────────────────────
export async function submitVote({ pollId, voterName, attendance, choice1Id, choice2Id }) {
  const { data, error } = await supabase.rpc('submit_vote', {
    p_poll_id: pollId,
    p_voter_name: voterName,
    p_attendance: attendance,
    p_choice_1_id: choice1Id || null,
    p_choice_2_id: choice2Id || null
  });
  if (error) throwTranslated(error);
  return { ok: true, updated: !!data };
}

export async function createPoll({ adminKey, title, mealType, eventDate, eventTime, deadline, description, restaurantIds }) {
  const { data, error } = await supabase.rpc('create_poll', {
    p_admin_key: adminKey || '',
    p_title: title,
    p_meal_type: mealType,
    p_event_date: eventDate,
    p_event_time: eventTime,
    p_deadline: toIsoDeadline(deadline),
    p_description: description || '',
    p_restaurant_ids: Array.isArray(restaurantIds) ? restaurantIds : []
  });
  if (error) throwTranslated(error);
  return { ok: true, pollId: data };
}

export async function updatePoll({ adminKey, pollId, patch }) {
  const params = {
    p_admin_key: adminKey || '',
    p_poll_id: pollId,
    p_title: null,
    p_meal_type: null,
    p_event_date: null,
    p_event_time: null,
    p_deadline: null,
    p_description: null,
    p_clear_description: false,
    p_status: null,
    p_restaurant_ids: null
  };
  const p = patch || {};
  if (p.title !== undefined) params.p_title = p.title;
  if (p.mealType !== undefined) params.p_meal_type = p.mealType;
  if (p.eventDate !== undefined) params.p_event_date = p.eventDate || null;
  if (p.eventTime !== undefined) params.p_event_time = p.eventTime || null;
  if (p.deadline !== undefined) params.p_deadline = toIsoDeadline(p.deadline);
  if (p.description !== undefined) {
    if (p.description === '') params.p_clear_description = true;
    else params.p_description = p.description;
  }
  if (p.status !== undefined) params.p_status = p.status;
  if (p.restaurantIds !== undefined) {
    params.p_restaurant_ids = Array.isArray(p.restaurantIds) ? p.restaurantIds : [];
  }

  const { error } = await supabase.rpc('update_poll', params);
  if (error) throwTranslated(error);
  return { ok: true, pollId };
}

// ─────────────────────────────────────────────────────────
// 식당 CRUD (관리자)
// ─────────────────────────────────────────────────────────
export async function createRestaurant({ adminKey, id, name, category, area, address, naverUrl, imageUrl, walkingMinutes, capacityRoom, capacityHall, menusText, note, businessHours, active, isGroupDining }) {
  const { data, error } = await supabase.rpc('create_restaurant', {
    p_admin_key: adminKey || '',
    p_id: id,
    p_name: name,
    p_category: category || null,
    p_area: area || null,
    p_address: address || null,
    p_naver_url: naverUrl || null,
    p_image_url: imageUrl || null,
    p_walking_minutes: walkingMinutes ?? null,
    p_capacity_room: capacityRoom ?? null,
    p_capacity_hall: capacityHall ?? null,
    p_menus_text: menusText || null,
    p_note: note || null,
    p_business_hours: businessHours || null,
    p_active: active !== false,
    p_is_group_dining: !!isGroupDining
  });
  if (error) throwTranslated(error);
  return { ok: true, id: data };
}

export async function updateRestaurant({ adminKey, id, patch }) {
  const params = {
    p_admin_key: adminKey || '',
    p_id: id,
    p_name: null,
    p_category: null,
    p_area: null,
    p_address: null,
    p_naver_url: null,
    p_image_url: null,
    p_walking_minutes: null,
    p_capacity_room: null,
    p_capacity_hall: null,
    p_menus_text: null,
    p_note: null,
    p_business_hours: null,
    p_active: null,
    p_clear_naver_url: false,
    p_clear_image_url: false,
    p_clear_capacity_room: false,
    p_clear_capacity_hall: false,
    p_is_group_dining: null
  };
  const p = patch || {};
  if (p.name !== undefined) params.p_name = p.name;
  if (p.category !== undefined) params.p_category = p.category;
  if (p.area !== undefined) params.p_area = p.area;
  if (p.address !== undefined) params.p_address = p.address;
  if (p.naverUrl !== undefined) {
    if (p.naverUrl === '') params.p_clear_naver_url = true;
    else params.p_naver_url = p.naverUrl;
  }
  if (p.imageUrl !== undefined) {
    if (p.imageUrl === '') params.p_clear_image_url = true;
    else params.p_image_url = p.imageUrl;
  }
  if (p.walkingMinutes !== undefined) params.p_walking_minutes = p.walkingMinutes;
  if (p.capacityRoom !== undefined) {
    if (p.capacityRoom == null) params.p_clear_capacity_room = true;
    else params.p_capacity_room = p.capacityRoom;
  }
  if (p.capacityHall !== undefined) {
    if (p.capacityHall == null) params.p_clear_capacity_hall = true;
    else params.p_capacity_hall = p.capacityHall;
  }
  if (p.menusText !== undefined) params.p_menus_text = p.menusText;
  if (p.note !== undefined) params.p_note = p.note;
  if (p.businessHours !== undefined) params.p_business_hours = p.businessHours;
  if (p.active !== undefined) params.p_active = p.active;
  if (p.isGroupDining !== undefined) params.p_is_group_dining = p.isGroupDining;

  const { error } = await supabase.rpc('update_restaurant', params);
  if (error) throwTranslated(error);
  return { ok: true, id };
}

export async function deleteRestaurant({ adminKey, id }) {
  const { error } = await supabase.rpc('delete_restaurant', {
    p_admin_key: adminKey || '',
    p_id: id
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

export async function deletePoll({ adminKey, pollId }) {
  const { error } = await supabase.rpc('delete_poll', {
    p_admin_key: adminKey || '',
    p_poll_id: pollId
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

export async function setRestaurantActive({ adminKey, id, active }) {
  const { error } = await supabase.rpc('set_restaurant_active', {
    p_admin_key: adminKey || '',
    p_id: id,
    p_active: !!active
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// 카페 CRUD (관리자) — 식당 함수 미러, capacity_* 제외
// ─────────────────────────────────────────────────────────
export async function createCafe({ adminKey, id, name, category, area, address, naverUrl, imageUrl, walkingMinutes, menusText, note, businessHours, active }) {
  const { data, error } = await supabase.rpc('create_cafe', {
    p_admin_key: adminKey || '',
    p_id: id,
    p_name: name,
    p_category: category || null,
    p_area: area || null,
    p_address: address || null,
    p_naver_url: naverUrl || null,
    p_image_url: imageUrl || null,
    p_walking_minutes: walkingMinutes ?? null,
    p_menus_text: menusText || null,
    p_note: note || null,
    p_business_hours: businessHours || null,
    p_active: active !== false
  });
  if (error) throwTranslated(error);
  return { ok: true, id: data };
}

export async function updateCafe({ adminKey, id, patch }) {
  const params = {
    p_admin_key: adminKey || '',
    p_id: id,
    p_name: null,
    p_category: null,
    p_area: null,
    p_address: null,
    p_naver_url: null,
    p_image_url: null,
    p_walking_minutes: null,
    p_menus_text: null,
    p_note: null,
    p_business_hours: null,
    p_active: null,
    p_clear_naver_url: false,
    p_clear_image_url: false
  };
  const p = patch || {};
  if (p.name !== undefined) params.p_name = p.name;
  if (p.category !== undefined) params.p_category = p.category;
  if (p.area !== undefined) params.p_area = p.area;
  if (p.address !== undefined) params.p_address = p.address;
  if (p.naverUrl !== undefined) {
    if (p.naverUrl === '') params.p_clear_naver_url = true;
    else params.p_naver_url = p.naverUrl;
  }
  if (p.imageUrl !== undefined) {
    if (p.imageUrl === '') params.p_clear_image_url = true;
    else params.p_image_url = p.imageUrl;
  }
  if (p.walkingMinutes !== undefined) params.p_walking_minutes = p.walkingMinutes;
  if (p.menusText !== undefined) params.p_menus_text = p.menusText;
  if (p.note !== undefined) params.p_note = p.note;
  if (p.businessHours !== undefined) params.p_business_hours = p.businessHours;
  if (p.active !== undefined) params.p_active = p.active;

  const { error } = await supabase.rpc('update_cafe', params);
  if (error) throwTranslated(error);
  return { ok: true, id };
}

export async function deleteCafe({ adminKey, id }) {
  const { error } = await supabase.rpc('delete_cafe', {
    p_admin_key: adminKey || '',
    p_id: id
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

export async function setCafeActive({ adminKey, id, active }) {
  const { error } = await supabase.rpc('set_cafe_active', {
    p_admin_key: adminKey || '',
    p_id: id,
    p_active: !!active
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// 분류 옵션 (카테고리·지역) — 관리자 CRUD
// ─────────────────────────────────────────────────────────
export async function loadOptions() {
  const { data, error } = await supabase
    .from('app_options')
    .select('kind, value, sort_order')
    .order('kind')
    .order('sort_order');
  if (error) throw new Error(`분류 옵션 로딩 실패: ${error.message}`);
  const categories = [];
  const areas = [];
  const cafeCategories = [];
  for (const row of data || []) {
    if (row.kind === 'category') categories.push(row.value);
    else if (row.kind === 'area') areas.push(row.value);
    else if (row.kind === 'cafe_category') cafeCategories.push(row.value);
  }
  return { categories, areas, cafeCategories };
}

export async function createOption({ adminKey, kind, value }) {
  const { data, error } = await supabase.rpc('create_option', {
    p_admin_key: adminKey || '',
    p_kind: kind,
    p_value: value
  });
  if (error) throwTranslated(error);
  return { ok: true, value: data };
}

export async function updateOption({ adminKey, kind, oldValue, newValue }) {
  const { error } = await supabase.rpc('update_option', {
    p_admin_key: adminKey || '',
    p_kind: kind,
    p_old_value: oldValue,
    p_new_value: newValue
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

export async function deleteOption({ adminKey, kind, value }) {
  const { error } = await supabase.rpc('delete_option', {
    p_admin_key: adminKey || '',
    p_kind: kind,
    p_value: value
  });
  if (error) throwTranslated(error);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// Realtime — votes 테이블 변경 구독
// 반환된 channel은 호출 측에서 supabase.removeChannel(channel)로 정리.
// ─────────────────────────────────────────────────────────
export function subscribeVotes(pollId, onChange) {
  const channel = supabase
    .channel(`votes-${pollId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'votes', filter: `poll_id=eq.${pollId}` },
      (payload) => onChange?.(payload)
    )
    .subscribe();
  return channel;
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ─────────────────────────────────────────────────────────
// 에러 코드 → 사용자 한국어 메시지
// RPC가 raise exception 'code' 형태로 던지면 PostgrestError.message에 code가 들어옴.
// ─────────────────────────────────────────────────────────
function throwTranslated(err) {
  const raw = (err.message || '').trim();
  // schema cache miss: 새 RPC를 DB에 아직 안 만든 경우
  if (/could not find the function/i.test(raw) || /schema cache/i.test(raw)) {
    const e = new Error('Supabase에 필요한 함수가 없습니다. schema.sql을 SQL Editor에서 다시 실행해주세요.');
    e.code = 'function_missing';
    throw e;
  }
  // Postgres 메시지 형태: "code" (cleanest), 또는 "...: code"
  const code = raw.replace(/^.*?:\s*/, '').trim();
  const e = new Error(translateError(code));
  e.code = code;
  throw e;
}

function translateError(code) {
  switch (code) {
    case 'missing_required_fields': return '필수 항목이 입력되지 않았습니다.';
    case 'invalid_attendance':      return '참석 여부 값이 올바르지 않습니다.';
    case 'poll_not_found':          return '존재하지 않는 투표입니다.';
    case 'poll_closed':             return '이미 마감된 투표입니다.';
    case 'deadline_passed':         return '투표 마감 시각이 지났습니다.';
    case 'unauthorized':            return '관리자 키가 올바르지 않습니다.';
    case 'invalid_deadline':        return '마감 시각이 올바르지 않습니다.';
    case 'invalid_status':          return '투표 상태 값이 올바르지 않습니다.';
    case 'too_few_restaurants':     return '식당은 2개 이상 선택해야 합니다.';
    case 'id_collision_exhausted':  return '같은 날짜에 너무 많은 투표가 생성되었습니다. 잠시 후 다시 시도해주세요.';
    case 'id_already_exists':       return '같은 ID의 식당이 이미 있습니다.';
    case 'restaurant_not_found':    return '존재하지 않는 식당입니다.';
    case 'cafe_not_found':          return '존재하지 않는 카페입니다.';
    case 'option_already_exists':   return '같은 분류 항목이 이미 있습니다.';
    case 'option_not_found':        return '존재하지 않는 분류 항목입니다.';
    case 'invalid_kind':            return '분류 종류 값이 올바르지 않습니다.';
    default:                        return code || '알 수 없는 오류가 발생했습니다.';
  }
}
