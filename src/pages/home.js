import { loadRestaurants } from '../lib/sheets.js';
import { restaurantCardHtml } from '../components/restaurant-card.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';

export async function renderHome(app) {
  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1 class="site-title">오늘뭐먹지?</h1>
        <p class="site-subtitle">회식 메뉴, 함께 정해요</p>
      </div>
    </header>

    <section class="card stack-4">
      <div>
        <h2>식당 둘러보기</h2>
        <p class="text-soft fs-small">회식 후보 식당 목록입니다. 투표 링크는 주최자가 따로 공유해요.</p>
      </div>

      <div id="filter-bar-mount"></div>

      <div id="restaurant-summary" class="text-soft fs-small"></div>

      <div id="restaurant-list" class="restaurant-grid">
        <div class="state"><p>식당을 불러오는 중...</p></div>
      </div>
    </section>
  `;

  const filterState = { category: '', query: '' };
  const filterMount = app.querySelector('#filter-bar-mount');
  const listEl = app.querySelector('#restaurant-list');
  const summaryEl = app.querySelector('#restaurant-summary');

  let restaurants = [];
  try {
    restaurants = await loadRestaurants();
  } catch (err) {
    listEl.innerHTML = `<div class="state state-error"><p>${err.message}</p></div>`;
    return;
  }

  if (restaurants.length === 0) {
    listEl.innerHTML = `<div class="state"><p>등록된 식당이 없습니다. 시트에 식당을 추가해주세요.</p></div>`;
    return;
  }

  const categories = [...new Set(restaurants.map((r) => r.category).filter(Boolean))];
  filterMount.innerHTML = filterBarHtml({
    categories,
    selectedCategory: filterState.category,
    query: filterState.query
  });

  function render() {
    const filtered = applyFilter(restaurants, filterState);
    summaryEl.textContent = `총 ${filtered.length}개 식당`;
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="state"><p>조건에 맞는 식당이 없습니다.</p></div>`;
      return;
    }
    listEl.innerHTML = filtered.map((r) => restaurantCardHtml(r, { mode: 'view' })).join('');
  }

  bindFilterBar(filterMount, filterState, render);
  render();
}
