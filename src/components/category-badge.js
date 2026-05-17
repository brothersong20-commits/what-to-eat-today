import { categorySlug } from '../lib/config.js';
import { escapeHtml } from '../lib/escape.js';

// rc-badge pill. 빈 값이면 빈 문자열(기존 r.category && ... 패턴과 동일 결과).
export function categoryBadgeHtml(category) {
  if (!category) return '';
  return `<span class="rc-badge rc-badge--${categorySlug(category)}">${escapeHtml(category)}</span>`;
}

export function areaBadgeHtml(area) {
  if (!area) return '';
  return `<span class="rc-badge rc-badge--area">${escapeHtml(area)}</span>`;
}
