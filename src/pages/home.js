import { loadRestaurants, loadCafes, loadPolls, loadVotes } from '../lib/supabase.js';
import { ATTENDANCE, categorySlug } from '../lib/config.js';
import {
  isPastDeadline,
  clockParts,
  withinDeadlineDay,
  formatEventDateTime
} from '../lib/time.js';
import { restaurantCardHtml } from '../components/restaurant-card.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';
import { flipClockHtml, updateFlipClock } from '../components/flip-clock.js';
import { shuffle } from '../lib/shuffle.js';

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
      <div class="browse-tabs" role="tablist">
        <button type="button" class="browse-tab is-active" data-pane="restaurants" role="tab">식당 둘러보기</button>
        <button type="button" class="browse-tab" data-pane="cafes" role="tab">카페 둘러보기</button>
      </div>

      <div id="browse-pane-restaurants" class="browse-pane stack-4" role="tabpanel">
        <p class="text-soft fs-small">회식 후보 식당 목록입니다. 투표 링크는 주최자가 따로 공유해요.</p>

        <div id="filter-bar-mount"></div>

        <div id="restaurant-summary" class="text-soft fs-small"></div>

        <div id="restaurant-list" class="restaurant-grid">
          <div class="state"><p>식당을 불러오는 중...</p></div>
        </div>
      </div>

      <div id="browse-pane-cafes" class="browse-pane stack-4" role="tabpanel" hidden>
        <p class="text-soft fs-small">점심 식사 후 들르기 좋은 카페 목록입니다.</p>

        <div id="cafe-filter-bar-mount"></div>

        <div id="cafe-summary" class="text-soft fs-small"></div>

        <div id="cafe-list" class="restaurant-grid">
          <div class="state"><p>카페를 불러오는 중...</p></div>
        </div>
      </div>
    </section>
  `;

  const pollsSection = app.querySelector('#active-polls-section');
  const pollsListEl = app.querySelector('#active-polls-list');

  // 둘러보기 탭 전환 — 식당/카페 데이터 로드 성공 여부와 무관하게 즉시 동작
  const browseTabs = [...app.querySelectorAll('.browse-tab')];
  const browsePanes = {
    restaurants: app.querySelector('#browse-pane-restaurants'),
    cafes: app.querySelector('#browse-pane-cafes')
  };
  browseTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.pane;
      browseTabs.forEach((b) => b.classList.toggle('is-active', b === btn));
      for (const [key, el] of Object.entries(browsePanes)) el.hidden = key !== target;
    });
  });

  const restaurantsPromise = loadRestaurants();
  const cafesPromise = loadCafes();

  loadPolls()
    .then(async (polls) => {
      const active = polls
        .filter((p) => p.status === 'active'
          && (!isPastDeadline(p.deadline) || withinDeadlineDay(p.deadline)))
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
      if (active.length === 0) return;

      let restaurantsById = new Map();
      try {
        const rs = await restaurantsPromise;
        restaurantsById = new Map(rs.map((r) => [r.id, r]));
      } catch {
        /* 식당 로드 실패 시 후보 칩만 생략, 폴 카드는 그대로 렌더 */
      }

      const statsById = {};
      await Promise.all(active.map(async (p) => {
        try {
          statsById[p.id] = countAttendance(await loadVotes(p.id));
        } catch {
          statsById[p.id] = null;
        }
      }));

      pollsSection.hidden = false;
      pollsListEl.innerHTML = active
        .map((p) => renderPollItem(p, statsById[p.id], restaurantsById))
        .join('');

      function tickPollCountdowns() {
        pollsListEl.querySelectorAll('.poll-item').forEach((card) => {
          const deadline = card.dataset.deadline;
          const expired = isPastDeadline(deadline);
          if (expired && !withinDeadlineDay(deadline)) {
            card.remove();
            return;
          }
          card.classList.toggle('is-expired', expired);
          if (expired) {
            const pollId = card.dataset.pollId || '';
            card.setAttribute('href', `#/result/${encodeURIComponent(pollId)}`);
            const cta = card.querySelector('.poll-item-cta');
            if (cta) cta.textContent = '결과 보기';
          }
          const clockEl = card.querySelector('[data-deadline-clock]');
          if (!clockEl) return;
          updateFlipClock(clockEl, clockParts(deadline));
        });
        if (!pollsListEl.querySelector('.poll-item')) pollsSection.hidden = true;
      }
      tickPollCountdowns();
      const handle = setInterval(tickPollCountdowns, 1000);
      window.addEventListener('hashchange', () => clearInterval(handle), { once: true });
    })
    .catch(() => {
      /* 활성 폴 로드 실패는 silent. 식당 목록은 별도로 진행. */
    });

  // 카페 섹션은 식당 로드 성공/실패와 무관하게 독립 렌더 (식당 블록의 early return에 막히지 않도록).
  (async () => {
    const cafeFilterState = { category: '', area: '', query: '' };
    const cafeFilterMount = app.querySelector('#cafe-filter-bar-mount');
    const cafeListEl = app.querySelector('#cafe-list');
    const cafeSummaryEl = app.querySelector('#cafe-summary');

    let cafes = [];
    try {
      cafes = await cafesPromise;
    } catch (err) {
      cafeListEl.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    if (cafes.length === 0) {
      cafeFilterMount.innerHTML = '';
      cafeListEl.innerHTML = `<div class="state"><p>등록된 카페가 없습니다.</p></div>`;
      return;
    }

    const cafeCategories = [...new Set(cafes.map((c) => c.category).filter(Boolean))];
    const cafeAreas = [...new Set(cafes.map((c) => c.area).filter(Boolean))];
    cafeFilterMount.innerHTML = filterBarHtml({
      categories: cafeCategories,
      areas: cafeAreas,
      selectedCategory: cafeFilterState.category,
      selectedArea: cafeFilterState.area,
      query: cafeFilterState.query,
      searchPlaceholder: '카페명 검색'
    });

    function renderCafes() {
      const filtered = applyFilter(cafes, cafeFilterState);
      cafeSummaryEl.textContent = `총 ${filtered.length}개 카페`;
      if (filtered.length === 0) {
        cafeListEl.innerHTML = `<div class="state"><p>조건에 맞는 카페가 없습니다.</p></div>`;
        return;
      }
      cafeListEl.innerHTML = filtered.map((c) => restaurantCardHtml(c, { mode: 'view' })).join('');
    }

    cafes = shuffle(cafes);
    bindFilterBar(cafeFilterMount, cafeFilterState, renderCafes);
    renderCafes();
  })();

  // 식당 섹션도 카페와 동일하게 독립 렌더 — early return이 renderHome 전체를 중단하지 않도록.
  (async () => {
    const filterState = { category: '', area: '', query: '', groupDining: false };
    const filterMount = app.querySelector('#filter-bar-mount');
    const listEl = app.querySelector('#restaurant-list');
    const summaryEl = app.querySelector('#restaurant-summary');

    let restaurants = [];
    try {
      restaurants = await restaurantsPromise;
    } catch (err) {
      listEl.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    if (restaurants.length === 0) {
      filterMount.innerHTML = '';
      listEl.innerHTML = `<div class="state"><p>등록된 식당이 없습니다.</p></div>`;
      return;
    }

    const categories = [...new Set(restaurants.map((r) => r.category).filter(Boolean))];
    const areas = [...new Set(restaurants.map((r) => r.area).filter(Boolean))];
    filterMount.innerHTML = filterBarHtml({
      categories,
      areas,
      selectedCategory: filterState.category,
      selectedArea: filterState.area,
      query: filterState.query,
      groupDining: true
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

    restaurants = shuffle(restaurants);
    bindFilterBar(filterMount, filterState, render);
    render();
  })();
}

function countAttendance(votes) {
  const c = { total: votes.length, yes: 0, no: 0 };
  for (const v of votes) {
    if (v.attendance === ATTENDANCE.YES) c.yes += 1;
    else if (v.attendance === ATTENDANCE.NO) c.no += 1;
  }
  return c;
}

function renderPollItem(p, stats, restaurantsById) {
  const eventStr = formatEventDateTime(p.eventDate, p.eventTime);
  const expired = isPastDeadline(p.deadline);
  const statsHtml = stats
    ? `<div class="poll-item-substats">참석 ${stats.yes} · 불참 ${stats.no} (총 ${stats.total})</div>`
    : '';

  const candidates = (p.restaurantIds || [])
    .map((id) => restaurantsById && restaurantsById.get(id))
    .filter(Boolean);
  const asideHtml = candidates.length
    ? `<div class="poll-item-aside">
        <div class="poll-item-aside-title">후보 식당 ${candidates.length}곳</div>
        <ul class="poll-cand-list">
          ${candidates
            .map(
              (r) =>
                `<li class="poll-cand">
                  ${
                    r.category
                      ? `<span class="rc-badge rc-badge--${categorySlug(r.category)}">${escapeHtml(r.category)}</span>`
                      : ''
                  }
                  <span class="poll-cand-name">${escapeHtml(r.name)}</span>
                </li>`
            )
            .join('')}
        </ul>
      </div>`
    : '';

  const href = expired
    ? `#/result/${encodeURIComponent(p.id)}`
    : `#/vote/${encodeURIComponent(p.id)}`;
  const ctaText = expired ? '결과 보기' : '투표하러 가기';

  return `
    <a class="poll-item poll-item--countdown ${expired ? 'is-expired' : ''}"
       href="${href}"
       data-poll-id="${escapeHtml(p.id)}"
       data-deadline="${escapeHtml(p.deadline || '')}">
      <div class="poll-item-main">
        <div class="poll-item-title">${escapeHtml(p.title)}</div>
        <div class="poll-item-meta">
          ${p.mealType ? `<span class="poll-item-meal">${escapeHtml(p.mealType)}</span>` : ''}
          ${eventStr ? `<span class="poll-item-date">${escapeHtml(eventStr)}</span>` : ''}
        </div>
        ${statsHtml}
        ${flipClockHtml({ parts: clockParts(p.deadline), size: 'md', label: '마감까지' })}
        <span class="poll-item-cta">${ctaText}</span>
      </div>
      ${asideHtml}
    </a>
  `;
}
