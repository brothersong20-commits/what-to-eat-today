// 좋아요 토글의 익명 브라우저 식별자. 인증이 없으므로 보안 경계가 아니라
// "같은 브라우저는 한 항목에 한 번만 좋아요" UX 게이트 용도다(voter.js와 동일 성격).
// localStorage try/catch 래퍼 패턴은 voter.js를 따른다.

const STORAGE_KEY = 'wte_client_id';

let memoId = null; // localStorage 불가 환경 폴백 (세션 내 일관)

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getClientId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    if (!memoId) memoId = newId();
    return memoId;
  }
}
