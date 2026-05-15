import { categorySlug } from '../lib/config.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function filterBarHtml({ categories, selectedCategory, query }) {
  const chips = ['전체', ...categories]
    .map((c) => {
      const value = c === '전체' ? '' : c;
      const active = (selectedCategory || '') === value;
      const slugClass = value ? ` chip--${categorySlug(value)}` : '';
      return `<button type="button" class="chip${slugClass} ${active ? 'is-active' : ''}" data-category="${escapeHtml(value)}">${escapeHtml(c)}</button>`;
    })
    .join('');

  return `
    <div class="filter-bar stack-3">
      <div class="search-field">
        <input
          type="search"
          class="input"
          id="filter-query"
          placeholder="식당명 검색"
          autocomplete="off"
          value="${escapeHtml(query || '')}"
        />
      </div>
      <div class="chip-row" id="filter-chips" role="group" aria-label="카테고리 필터">
        ${chips}
      </div>
    </div>
  `;
}

/**
 * 필터바 이벤트 바인딩.
 * onChange({ category, query }) 콜백 호출.
 */
export function bindFilterBar(root, state, onChange) {
  const queryInput = root.querySelector('#filter-query');
  const chipsRoot = root.querySelector('#filter-chips');

  queryInput?.addEventListener('input', (e) => {
    state.query = e.target.value;
    onChange({ ...state });
  });

  chipsRoot?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-category]');
    if (!btn) return;
    state.category = btn.dataset.category || '';
    chipsRoot.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    onChange({ ...state });
  });
}

export function applyFilter(restaurants, { category, query }) {
  const q = (query || '').trim().toLowerCase();
  return restaurants.filter((r) => {
    if (category && r.category !== category) return false;
    if (q && !r.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
