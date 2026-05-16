// 투표 완료 여부를 브라우저 단위로 기록한다. 인증이 없으므로 보안 경계가 아니라
// "이미 투표한 사람만 진행 중 현황을 본다"는 UX 게이트 용도다.
// votes 테이블은 anon SELECT가 이미 허용돼 있어 이 기록은 노출 통제가 아니다.

const STORAGE_KEY = 'wte_votes';

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

export function markVoted(pollId, { name, attendance }) {
  if (!pollId) return;
  const map = readMap();
  map[pollId] = { name, attendance, at: Date.now() };
  writeMap(map);
}

export function getVotedRecord(pollId) {
  if (!pollId) return null;
  const rec = readMap()[pollId];
  if (!rec || !rec.name) return null;
  return rec;
}

export function hasVoted(pollId) {
  return !!getVotedRecord(pollId);
}
