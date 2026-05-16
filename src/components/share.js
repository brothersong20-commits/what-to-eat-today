/**
 * 투표 공유 컴포넌트.
 *
 * buildShareUrl(pollId)              — 절대 공유 URL(#/vote/:id) 조립
 * shareControlsHtml()               — "링크 복사" / "QR 코드" 버튼 마크업
 * bindShareControls(rootEl, opts)   — 위 버튼에 복사/QR 모달 핸들러 바인딩
 * openQrModal({ url, title })       — body 에 QR 모달 표시(ESC·바깥클릭·X 닫기)
 *
 * 클립보드 폴백 패턴과 토스트 피드백은 기존 admin 동작을 일반화한 것.
 */

import qrcode from 'qrcode-generator';
import { showToast } from '../lib/toast.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function buildShareUrl(pollId) {
  return `${location.href.split('#')[0]}#/vote/${pollId}`;
}

export function shareControlsHtml() {
  return `
    <div class="row-2 share-controls" data-share-controls>
      <button type="button" class="btn btn-outline" data-share-copy>링크 복사</button>
      <button type="button" class="btn btn-outline" data-share-qr>QR 코드</button>
    </div>
  `;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

export function openQrModal({ url, title }) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });

  const overlay = document.createElement('div');
  overlay.className = 'qr-modal-overlay';
  overlay.innerHTML = `
    <div class="qr-modal-card stack-3" role="dialog" aria-modal="true" aria-label="투표 공유 QR 코드">
      <button type="button" class="qr-modal-close" data-qr-close aria-label="닫기">✕</button>
      <h3 class="qr-modal-title">${escapeHtml(title || '투표 공유')}</h3>
      <p class="text-soft fs-small">QR을 스캔하면 이 투표로 바로 이동합니다.</p>
      <div class="qr-modal-svg">${svg}</div>
      <p class="qr-modal-url">${escapeHtml(url)}</p>
    </div>
  `;

  const prevFocus = document.activeElement;

  function close() {
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('hashchange', close);
    overlay.classList.remove('is-visible');
    overlay.addEventListener(
      'transitionend',
      () => overlay.remove(),
      { once: true }
    );
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
  overlay.querySelector('[data-qr-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', close);

  document.body.appendChild(overlay);
  overlay.querySelector('[data-qr-close]').focus();
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

export function bindShareControls(rootEl, { pollId, title } = {}) {
  if (!rootEl) return;
  const container = rootEl.querySelector('[data-share-controls]');
  if (!container) return;

  const url = buildShareUrl(pollId);

  const copyBtn = container.querySelector('[data-share-copy]');
  const qrBtn = container.querySelector('[data-share-qr]');

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(url);
      if (ok) showToast('투표 링크가 복사되었어요');
      else showToast('복사에 실패했어요. 직접 복사해주세요', { error: true });
    });
  }

  if (qrBtn) {
    qrBtn.addEventListener('click', () => openQrModal({ url, title }));
  }
}
