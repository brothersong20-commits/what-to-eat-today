let timer = null;

export function showToast(message, { error = false, duration = 2400 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.toggle('is-error', !!error);
  el.classList.add('is-visible');

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, duration);
}
