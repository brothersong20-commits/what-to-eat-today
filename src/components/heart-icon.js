// 좋아요 하트 아이콘 (인라인 SVG). verified-seal.js와 동일한 인라인 SVG 패턴.
// 채움/외곽선은 CSS(.rc-like / .rc-like.is-liked)에서 fill·stroke로 토글한다.
// 단일 path라 외곽선·채움 양쪽 모두 깔끔 (lucide heart).
export function heartSvg() {
  return (
    `<svg class="rc-heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>` +
    `</svg>`
  );
}
