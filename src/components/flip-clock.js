/**
 * split-flap "Flip Clock" 컴포넌트.
 *
 * flipClockHtml(opts)        — 정적 스캐폴드 문자열(초기값 정확 렌더)
 * updateFlipClock(root, p)   — clockParts() 결과로 변경된 자릿수만 flip
 *
 * 표시는 숫자/한글 캡션(일·시간·분·초) 뿐이라 escape 불필요.
 */

import { urgencyFromParts } from '../lib/time.js';

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function digitCell(pos, ch) {
  return `<span class="flip-digit" data-pos="${pos}" data-val="${ch}">
        <span class="flip-digit__top">${ch}</span>
        <span class="flip-digit__bottom">${ch}</span>
        <span class="flip-digit__fold flip-digit__fold--front">${ch}</span>
        <span class="flip-digit__fold flip-digit__fold--back">${ch}</span>
      </span>`;
}

export function flipClockHtml({ parts, size = 'lg', label = '⏰ 마감까지' } = {}) {
  const p = parts || { expired: true, days: 0, h: 0, m: 0, s: 0 };
  const days = Math.min(99, p.days || 0);
  const d = pad2(days);
  const h = pad2(p.h);
  const m = pad2(p.m);
  const s = pad2(p.s);
  const urg = urgencyFromParts(p);
  return `
    <div class="flip-clock flip-clock--${size}${urg ? ` flip-clock--${urg}` : ''}${p.expired ? ' is-expired' : ''}" data-deadline-clock>
      <span class="flip-clock__label">${label}</span>
      <div class="flip-clock__groups">
        <span class="flip-group flip-group--days" data-group="days"${days > 0 ? '' : ' hidden'}>
          <span class="flip-group__digits">
            ${digitCell('d10', d[0])}
            ${digitCell('d1', d[1])}
          </span>
          <span class="flip-group__cap">일</span>
        </span>
        <span class="flip-group flip-group--hours">
          <span class="flip-group__digits">
            ${digitCell('h10', h[0])}
            ${digitCell('h1', h[1])}
          </span>
          <span class="flip-group__cap">시간</span>
        </span>
        <span class="flip-group flip-group--mins">
          <span class="flip-group__digits">
            ${digitCell('m10', m[0])}
            ${digitCell('m1', m[1])}
          </span>
          <span class="flip-group__cap">분</span>
        </span>
        <span class="flip-group flip-group--secs">
          <span class="flip-group__digits">
            ${digitCell('s10', s[0])}
            ${digitCell('s1', s[1])}
          </span>
          <span class="flip-group__cap">초</span>
        </span>
      </div>
      <span class="flip-clock__expired">마감되었습니다</span>
    </div>
  `;
}

function setFaces(el, ch) {
  el.querySelector('.flip-digit__top').textContent = ch;
  el.querySelector('.flip-digit__bottom').textContent = ch;
  el.querySelector('.flip-digit__fold--front').textContent = ch;
  el.querySelector('.flip-digit__fold--back').textContent = ch;
  el.dataset.val = ch;
}

function flipDigit(el, next) {
  const prev = el.dataset.val;
  if (REDUCED) {
    setFaces(el, next);
    return;
  }

  const top = el.querySelector('.flip-digit__top');
  const bottom = el.querySelector('.flip-digit__bottom');
  const front = el.querySelector('.flip-digit__fold--front');
  const back = el.querySelector('.flip-digit__fold--back');

  front.textContent = prev; // 이전값 상단이 앞으로 접혀 내려감
  top.textContent = next; // 새 상단은 뒤에서 미리 노출
  bottom.textContent = prev; // 하단은 back 이 착지할 때까지 이전값 유지
  back.textContent = next; // 새 하단이 펼쳐짐

  el.classList.remove('is-flipping');
  void el.offsetWidth; // reflow → 미완 애니메이션 강제 재시작
  el.classList.add('is-flipping');

  // back(가장 늦게 끝남)의 animationend 에서만 정적 면 확정.
  back.addEventListener(
    'animationend',
    () => {
      setFaces(el, next);
      el.classList.remove('is-flipping');
    },
    { once: true }
  );
}

export function updateFlipClock(rootEl, parts) {
  if (!rootEl || !parts) return;

  const level = urgencyFromParts(parts);
  rootEl.classList.toggle('flip-clock--warn', level === 'warn');
  rootEl.classList.toggle('flip-clock--danger', level === 'danger');

  if (parts.expired) {
    rootEl.classList.add('is-expired');
    return;
  }
  rootEl.classList.remove('is-expired');

  const days = Math.min(99, parts.days || 0);
  const daysGroup = rootEl.querySelector('[data-group="days"]');
  if (daysGroup) {
    if (days > 0) daysGroup.removeAttribute('hidden');
    else daysGroup.setAttribute('hidden', '');
  }

  const d = pad2(days);
  const h = pad2(parts.h);
  const m = pad2(parts.m);
  const s = pad2(parts.s);
  const target = {
    d10: d[0], d1: d[1],
    h10: h[0], h1: h[1],
    m10: m[0], m1: m[1],
    s10: s[0], s1: s[1]
  };

  for (const pos in target) {
    const el = rootEl.querySelector(`.flip-digit[data-pos="${pos}"]`);
    if (!el) continue;
    if (el.dataset.val === target[pos]) continue;
    flipDigit(el, target[pos]);
  }
}
