import { escapeHtml, safeUrl } from '../lib/escape.js';

/**
 * 홈 히어로 배경용 무한 사진 marquee (장식 텍스처).
 *
 * 끊김 없는 루프 전제: 한 행(.marquee-track)은 동일한 .marquee-group 2벌로 구성되고
 * CSS 가 translateX(0 → -50%) 로 정확히 한 group 폭만큼 흐른다. 각 아이템은 고정 폭이라
 * 이미지 로드/실패와 무관하게 트랙 폭이 변하지 않는다(점프 방지). 실패 이미지는 제거하지
 * 않고 자리(box)를 유지한 채 숨긴다.
 *
 * 장식 요소이므로 wrapper 는 aria-hidden, 이미지 alt 는 빈 값, pointer-events 는 CSS 에서 차단.
 */

// 한 group 이 와이드 화면 폭을 넘기도록 보장하는 최소 아이템 수(부족하면 순환 반복으로 채움).
const MIN_PER_ROW = 8;
// 배경 장식이라 모든 고유 이미지를 쓸 필요는 없다 — DOM/디코딩 비용을 줄이려 고유 URL 상한.
const MAX_UNIQUE = 16;

function itemHtml(url) {
  return `<img class="marquee-item" src="${escapeHtml(url)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" />`;
}

// urls 를 순환 반복해 최소 개수 이상으로 채운다(원본이 충분하면 그대로).
function fill(urls, min) {
  if (!urls.length) return [];
  const target = Math.max(min, urls.length);
  const out = [];
  for (let i = 0; out.length < target; i += 1) out.push(urls[i % urls.length]);
  return out;
}

function rowHtml(urls, variant) {
  const group = `<div class="marquee-group">${urls.map(itemHtml).join('')}</div>`;
  // 동일 group 2벌 — 두 번째는 보조 사본(중복 콘텐츠 안내).
  return `
    <div class="marquee-row marquee-row--${variant}">
      <div class="marquee-track">
        ${group}
        ${group.replace('<div class="marquee-group">', '<div class="marquee-group" aria-hidden="true">')}
      </div>
    </div>`;
}

/**
 * @param {string[]} images 후보 이미지 URL 배열(중복·빈값·비http 는 내부에서 정리)
 * @returns {string} marquee HTML. 유효 이미지가 없으면 빈 문자열.
 */
export function photoMarqueeHtml(images) {
  const urls = [...new Set((images || []).map(safeUrl).filter(Boolean))].slice(0, MAX_UNIQUE);
  if (!urls.length) return '';

  const row1 = fill(urls, MIN_PER_ROW);
  // 2행은 시각적 차이를 위해 순서를 절반 회전.
  const half = Math.floor(urls.length / 2);
  const row2 = fill([...urls.slice(half), ...urls.slice(0, half)], MIN_PER_ROW);

  return `
    <div class="photo-marquee" aria-hidden="true">
      ${rowHtml(row1, 1)}
      ${rowHtml(row2, 2)}
    </div>`;
}
