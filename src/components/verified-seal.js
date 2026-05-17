const SEAL_LOBES = 14;
const SEAL_RIM_R = 15;
const SEAL_LOBE_R = 4.6;

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sealLobes() {
  let circles = '';
  for (let i = 0; i < SEAL_LOBES; i++) {
    const a = (i / SEAL_LOBES) * Math.PI * 2;
    const cx = (20 + SEAL_RIM_R * Math.cos(a)).toFixed(2);
    const cy = (20 + SEAL_RIM_R * Math.sin(a)).toFixed(2);
    circles += `<circle cx="${cx}" cy="${cy}" r="${SEAL_LOBE_R}"/>`;
  }
  return circles;
}

/**
 * 단체 회식 인증 씰 (트위터/인스타 인증 마크 스타일).
 * 스캘럽드 원(중심 원 + 림 원 14개) + 흰 체크, 블루 그라데이션은 토큰 참조.
 */
export function verifiedSealHtml({ size = '1.8rem', title = '단체회식 가능 (10인 이상)', decorative = false } = {}) {
  const t = escapeAttr(title);
  const a11y = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${t}" title="${t}"`;
  return (
    `<span class="rc-verified" ${a11y} style="width:${size};height:${size}">` +
    `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<defs><linearGradient id="wte-verified-grad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" style="stop-color:var(--verified-seal-from)"/>` +
    `<stop offset="1" style="stop-color:var(--verified-seal-to)"/>` +
    `</linearGradient></defs>` +
    `<g fill="url(#wte-verified-grad)"><circle cx="20" cy="20" r="15"/>${sealLobes()}</g>` +
    `<path d="M12.8 20.4 l4.6 4.6 L27.4 13.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg></span>`
  );
}
