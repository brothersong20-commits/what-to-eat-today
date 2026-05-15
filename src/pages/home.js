import { loadRestaurants, loadPolls } from '../lib/supabase.js';
import { isPastDeadline, formatClock, withinGracePeriod, formatEventDateTime } from '../lib/time.js';
import { restaurantCardHtml } from '../components/restaurant-card.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderHome(app) {
  app.innerHTML = `
    <header class="site-header site-header--home">
      <a href="#/admin" class="site-admin-link">관리자</a>
      <div class="site-header-center">
        <h1 class="site-title">오늘뭐먹지?</h1>
        <p class="site-subtitle">회식 메뉴, 함께 정해요</p>
        <span class="site-version">v${__APP_VERSION__}</span>
      </div>
    </header>

    <section class="card stack-3" id="active-polls-section" hidden style="margin-bottom: var(--space-3);">
      <div>
        <h2>투표 중인 회식</h2>
        <p class="text-soft fs-small">진행 중인 회식 투표에 참여해보세요.</p>
      </div>
      <div id="active-polls-list" class="poll-list"></div>
    </section>

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
  const pollsSection = app.querySelector('#active-polls-section');
  const pollsListEl = app.querySelector('#active-polls-list');

  loadPolls()
    .then((polls) => {
      const active = polls
        .filter((p) => p.status === 'active'
          && (!isPastDeadline(p.deadline) || withinGracePeriod(p.deadline, 3)))
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
      if (active.length === 0) return;
      pollsSection.hidden = false;
      pollsListEl.innerHTML = active.map(renderPollItem).join('');

      function tickPollCountdowns() {
        pollsListEl.querySelectorAll('.poll-item').forEach((card) => {
          const deadline = card.dataset.deadline;
          const clockEl = card.querySelector('.poll-item-deadline-clock');
          if (!clockEl) return;
          clockEl.textContent = formatClock(deadline);
          card.classList.toggle('is-expired', isPastDeadline(deadline));
        });
      }
      tickPollCountdowns();
      const handle = setInterval(tickPollCountdowns, 1000);
      window.addEventListener('hashchange', () => clearInterval(handle), { once: true });
    })
    .catch(() => {
      /* 활성 폴 로드 실패는 silent. 식당 목록은 별도로 진행. */
    });

  let restaurants = [];
  try {
    restaurants = await loadRestaurants();
  } catch (err) {
    listEl.innerHTML = `<div class="state state-error"><p>${err.message}</p></div>`;
    return;
  }

  if (restaurants.length === 0) {
    listEl.innerHTML = `<div class="state"><p>등록된 식당이 없습니다.</p></div>`;
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

function renderPollItem(p) {
  const eventStr = formatEventDateTime(p.eventDate, p.eventTime);
  const expired = isPastDeadline(p.deadline);
  return `
    <a class="poll-item ${expired ? 'is-expired' : ''}"
       href="#/vote/${encodeURIComponent(p.id)}"
       data-deadline="${escapeHtml(p.deadline || '')}">
      <div class="poll-item-title">${escapeHtml(p.title)}</div>
      <div class="poll-item-meta">
        ${p.mealType ? `<span>🍽 ${escapeHtml(p.mealType)}</span>` : ''}
        ${eventStr ? `<span>📅 ${escapeHtml(eventStr)}</span>` : ''}
      </div>
      <div class="poll-item-deadline">
        <span class="poll-item-deadline-label">⏰ 마감까지</span>
        <span class="poll-item-deadline-clock">${escapeHtml(formatClock(p.deadline))}</span>
      </div>
    </a>
  `;
}
