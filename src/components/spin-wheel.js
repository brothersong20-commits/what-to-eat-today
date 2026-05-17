/**
 * 회전 돌림판(spin-wheel) 컴포넌트.
 *
 * spinWheelButtonHtml()                          — 투표 폼에 넣을 트리거 버튼 마크업
 * bindSpinWheel(rootEl, { restaurants, onPick }) — 버튼 → 모달 오픈 바인딩
 *   onPick(restaurantId, rank): 당첨 식당을 rank(1|2)순위로 적용하는 콜백.
 *   적용 성공 시 true, (1·2순위 충돌 등) 거부 시 false 를 반환해야 한다.
 *   true 인 경우에만 모달을 닫는다.
 *
 * 모달 수명주기·접근성 패턴은 share.js openQrModal 을 그대로 따른다.
 * 닫기 경로마다 wheel.remove() 를 호출해 내부 rAF 루프 누수를 막는다.
 */

import { Wheel } from 'spin-wheel';
import { categorySlug } from '../lib/config.js';
import { escapeHtml } from '../lib/escape.js';
import { openModal } from '../lib/modal.js';
import { categoryBadgeHtml } from './category-badge.js';

// 카테고리 slug → tokens.css 전경색(흰 글자와 대비 충분).
const CAT_FG = {
  han: '#8a4b35', jung: '#a83a2b', il: '#3a5080', yang: '#8a6a22',
  bun: '#9c4768', hoe: '#2e6e68', gogi: '#7c3f38', etc: '#586054'
};
// 카테고리 미지정 식당은 인접 조각이 같은 색이 되지 않도록 순환 팔레트로 폴백.
const FALLBACK_PALETTE = [
  '#006241', '#8a4b35', '#3a5080', '#a83a2b',
  '#2e6e68', '#9c4768', '#8a6a22', '#7c3f38'
];

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

function prefersReducedMotion() {
  return !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function spinWheelButtonHtml() {
  return `
    <div class="spin-wheel-trigger-row" data-spin-wheel-trigger>
      <button type="button" class="btn btn-outline btn-block spin-wheel-btn"
              data-spin-wheel-open>
        🎡 고르기 어렵다면, 돌려주세요!
      </button>
    </div>
  `;
}

function buildItems(restaurants) {
  return restaurants.map((r, i) => {
    const slug = categorySlug(r.category);
    const bg = (r.category && CAT_FG[slug])
      ? CAT_FG[slug]
      : FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
    const name = r.name || '';
    const label = name.length > 14 ? name.slice(0, 13) + '…' : name;
    return { label, backgroundColor: bg, labelColor: '#ffffff', value: r.id };
  });
}

function openSpinModal({ restaurants, onPick }) {
  let wheel = null;
  let spinning = false;

  function destroyWheel() {
    if (wheel) {
      try { wheel.remove(); } catch { /* noop */ }
      wheel = null;
    }
  }

  const { overlay, close } = openModal({
    overlayClass: 'spin-modal-overlay',
    html: `
      <div class="spin-modal-card stack-3" role="dialog" aria-modal="true"
           aria-label="식당 돌림판">
        <button type="button" class="spin-modal-close" data-modal-close
                aria-label="닫기">✕</button>
        <h3 class="spin-modal-title">돌림판</h3>
        <p class="text-soft fs-small">버튼을 누르면 후보 ${restaurants.length}곳 중 한 곳이 무작위로 선택돼요.</p>
        <div class="spin-wheel-stage">
          <div class="spin-wheel-pointer" aria-hidden="true"></div>
          <div class="spin-wheel-canvas-wrap" data-spin-mount></div>
        </div>
        <div class="spin-wheel-result" data-spin-result hidden></div>
        <div class="row-2 spin-wheel-actions">
          <button type="button" class="btn btn-primary" data-spin-go>돌리기</button>
        </div>
      </div>
    `,
    canClose: () => !spinning,
    onClose: destroyWheel,
    // 오버레이가 DOM 에 붙고 is-visible 된 뒤 Wheel 생성 → 컨테이너 박스 메트릭 확정.
    afterOpen: () => {
      wheel = new Wheel(mount, {
        items: buildItems(restaurants),
        isInteractive: false,
        radius: 0.92,
        borderColor: '#1e3932',
        borderWidth: 3,
        lineColor: '#ffffff',
        lineWidth: 1,
        itemLabelColors: ['#ffffff'],
        itemLabelFont: "'Inter', sans-serif",
        itemLabelFontSizeMax: 18,
        itemLabelRadius: 0.86,
        itemLabelRadiusMax: 0.2,
        itemLabelAlign: 'right',
        pointerAngle: 0,
        rotationSpeedMax: 700,
        onRest: (e) => {
          spinning = false;
          goBtn.disabled = false;
          goBtn.textContent = '돌리기';
          const winner = restaurants[e.currentIndex];
          if (winner) showResult(winner);
        }
      });
    }
  });

  const mount = overlay.querySelector('[data-spin-mount]');
  const goBtn = overlay.querySelector('[data-spin-go]');
  const resultEl = overlay.querySelector('[data-spin-result]');

  function showResult(r) {
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <p class="spin-wheel-result-label">추천 식당</p>
      <p class="spin-wheel-result-name">
        ${escapeHtml(r.name)}
        ${categoryBadgeHtml(r.category)}
      </p>
      <div class="row-2 spin-wheel-result-actions">
        <button type="button" class="btn btn-primary" data-spin-apply="1">1순위로 넣기</button>
        <button type="button" class="btn btn-primary" data-spin-apply="2">2순위로 넣기</button>
        <button type="button" class="btn btn-outline" data-spin-again>다시 돌리기</button>
      </div>
    `;
    resultEl.querySelectorAll('[data-spin-apply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rank = Number(btn.dataset.spinApply);
        if (onPick(r.id, rank)) close();
      });
    });
    resultEl.querySelector('[data-spin-again]').addEventListener('click', () => {
      resultEl.hidden = true;
      resultEl.innerHTML = '';
      doSpin();
    });
  }

  function doSpin() {
    if (spinning || !wheel) return;
    spinning = true;
    goBtn.disabled = true;
    goBtn.textContent = '돌리는 중...';
    const winnerIndex = Math.floor(Math.random() * restaurants.length);
    if (prefersReducedMotion()) {
      wheel.spinToItem(winnerIndex, 400, true, 1, 1, easeOutQuart);
    } else {
      wheel.spinToItem(winnerIndex, 4000, true, 5, 1, easeOutQuart);
    }
  }

  goBtn.addEventListener('click', doSpin);
}

export function bindSpinWheel(rootEl, { restaurants, onPick } = {}) {
  if (!rootEl) return;
  const trigger = rootEl.querySelector('[data-spin-wheel-trigger]');
  if (!trigger) return;
  const openBtn = trigger.querySelector('[data-spin-wheel-open]');
  if (!openBtn) return;

  // 후보가 2곳 미만이면 돌림판이 의미 없으므로 트리거를 숨긴다.
  if (!restaurants || restaurants.length < 2) {
    trigger.style.display = 'none';
    return;
  }

  openBtn.addEventListener('click', () => {
    openSpinModal({ restaurants, onPick });
  });
}
