// HTML 텍스트 노드/속성 삽입용 이스케이프. 템플릿 문자열에 사용자/DB 값을 끼울 때 사용.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// href/src 용 URL 스킴 화이트리스트. http/https 만 통과시키고 javascript: 같은
// 위험 스킴은 빈 문자열로 차단(저장형 XSS 방지). 반환값도 속성에 넣을 땐 escapeHtml 로 감쌀 것.
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
