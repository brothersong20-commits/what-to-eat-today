/**
 * 간단한 해시 기반 라우터.
 * Routes 예: { '/': renderHome, '/vote/:id': renderVote, '/result/:id': renderResult }
 */

const routes = [];

// 페이지 정리(cleanup) 레지스트리 — 타이머·Realtime 구독·리스너를 여기 등록하면
// 다음 라우트로 이동(dispatch)할 때 일괄 회수된다. 페이지마다 hashchange{once}를
// 흩뿌리던 방식을 대체해, 같은 경로 재진입 등 hashchange 가 안 뜨는 경우까지 정리한다.
const leaveCallbacks = new Set();
export function onRouteLeave(fn) {
  if (typeof fn === 'function') leaveCallbacks.add(fn);
}
function runLeaveCallbacks() {
  const fns = [...leaveCallbacks];
  leaveCallbacks.clear();
  for (const fn of fns) {
    try { fn(); } catch { /* 한 콜백 실패가 나머지를 막지 않도록 무시 */ }
  }
}

export function defineRoute(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:([\w]+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$'
  );
  routes.push({ regex, keys, handler });
}

export function start(notFoundHandler) {
  function dispatch() {
    // 이전 페이지가 등록한 정리 작업을 먼저 회수한 뒤 새 라우트를 그린다.
    runLeaveCallbacks();
    const path = currentPath();
    for (const route of routes) {
      const m = path.match(route.regex);
      if (m) {
        const params = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        route.handler(params);
        return;
      }
    }
    notFoundHandler?.();
  }

  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function currentPath() {
  const hash = window.location.hash || '#/';
  return hash.replace(/^#/, '') || '/';
}

export function navigate(path) {
  window.location.hash = path.startsWith('#') ? path : '#' + path;
}
