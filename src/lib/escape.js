// HTML 텍스트 노드/속성 삽입용 이스케이프. 템플릿 문자열에 사용자/DB 값을 끼울 때 사용.
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
