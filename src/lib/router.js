/**
 * 간단한 해시 기반 라우터.
 * Routes 예: { '/': renderHome, '/vote/:id': renderVote, '/result/:id': renderResult }
 */

const routes = [];

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
