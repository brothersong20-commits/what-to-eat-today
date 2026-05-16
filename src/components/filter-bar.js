import { categorySlug } from '../lib/config.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function filterBarHtml({ categories, areas = [], selectedCategory, selectedArea, query }) {
  const categoryChips = ['전체', ...categories]
    .map((c) => {
      const value = c === '전체' ? '' : c;
      const active = (selectedCategory || '') === value;
      const slugClass = value ? ` chip--${categorySlug(value)}` : '';
      return `<button type="button" class="chip${slugClass} ${active ? 'is-active' : ''}" data-category="${escapeHtml(value)}">${escapeHtml(c)}</button>`;
    })
    .join('');

  const areaChips = areas.length
    ? ['전체', ...areas]
        .map((a) => {
          const value = a === '전체' ? '' : a;
          const active = (selectedArea || '') === value;
          const areaClass = value ? ' chip--area' : '';
          return `<button type="button" class="chip${areaClass} ${active ? 'is-active' : ''}" data-area="${escapeHtml(value)}">${escapeHtml(a)}</button>`;
        })
        .join('')
    : '';

  const areaRow = areaChips
    ? `<div class="chip-row" id="filter-areas" role="group" aria-label="지역 필터">
        ${areaChips}
      </div>`
    : '';

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
        ${categoryChips}
      </div>
      ${areaRow}
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
  const areasRoot = root.querySelector('#filter-areas');

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

  areasRoot?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-area]');
    if (!btn) return;
    state.area = btn.dataset.area || '';
    areasRoot.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    onChange({ ...state });
  });
}

export function applyFilter(restaurants, { category, area, query }) {
  const q = (query || '').trim().toLowerCase();
  return restaurants.filter((r) => {
    if (category && r.category !== category) return false;
    if (area && r.area !== area) return false;
    if (q && !r.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
