// 오버레이 모달 수명주기·접근성 단일 구현.
// share.js openQrModal / spin-wheel.js openSpinModal 의 공통 패턴을 통합한 것.
// html 안에 닫기 트리거로 [data-modal-close] 요소를 하나 둘 것.
//
// canClose: () => boolean  — false면 닫기 차단(돌림판 회전 중 등)
// onClose:  () => void     — close 진행 중(DOM 제거 전) 1회 실행(휠 정리 등)
// afterOpen:(overlay)=>void — DOM 부착+is-visible 직후 rAF 안에서 실행(박스 메트릭 확정 후)
export function openModal({ overlayClass, html, canClose, onClose, afterOpen } = {}) {
  const overlay = document.createElement('div');
  overlay.className = overlayClass;
  overlay.innerHTML = html;

  const prevFocus = document.activeElement;
  let closed = false;

  function close() {
    if (closed) return;
    if (canClose && !canClose()) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('hashchange', close);
    if (onClose) onClose();
    overlay.classList.remove('is-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    // transition 미발생(reduced-motion 등) 대비 안전망
    setTimeout(() => overlay.isConnected && overlay.remove(), 400);
    if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  const closeBtn = overlay.querySelector('[data-modal-close]');
  if (closeBtn) closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', close);

  document.body.appendChild(overlay);
  if (closeBtn) closeBtn.focus();
  requestAnimationFrame(() => {
    overlay.classList.add('is-visible');
    if (afterOpen) afterOpen(overlay);
  });

  return { overlay, close };
}
