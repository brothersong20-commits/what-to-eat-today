// 위험 작업 확인 모달 — Promise<boolean> 반환. lib/modal.js openModal 재사용.
// 확인=resolve(true), 취소/배경/ESC/hashchange=resolve(false).
import { openModal } from '../lib/modal.js';
import { escapeHtml } from '../lib/escape.js';

export function openConfirm({ title, message, confirmLabel = '삭제', cancelLabel = '취소', destructive = true } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const settle = (v) => { if (!decided) { decided = true; resolve(v); } };
    const html = `
      <div class="confirm-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h3 class="confirm-modal-title" id="confirm-modal-title">${escapeHtml(title || '확인')}</h3>
        <p class="confirm-modal-message">${escapeHtml(message || '')}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn confirm-modal-ok${destructive ? ' is-destructive' : ''}">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    const { close } = openModal({
      overlayClass: 'confirm-modal-overlay',
      html,
      onClose: () => settle(false),
      afterOpen: (overlay) => {
        const ok = overlay.querySelector('.confirm-modal-ok');
        ok?.focus();
        ok?.addEventListener('click', () => { settle(true); close(); });
      }
    });
  });
}
