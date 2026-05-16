import { loadRestaurants, loadPolls, loadVotes } from '../lib/supabase.js';
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

  const filterState = { category: '', area: '', query: '' };
  const filterMount = app.querySelector('#filter-bar-mount');
  const listEl = app.querySelector('#restaurant-list');
  const summaryEl = app.querySelector('#restaurant-summary');
  const pollsSection = app.querySelector('#active-polls-section');
  const pollsListEl = app.querySelector('#active-polls-list');

  const restaurantsPromise = loadRestaurants();

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

  let restaurants = [];
  try {
    restaurants = await restaurantsPromise;
  } catch (err) {
    listEl.innerHTML = `<div class="state state-error"><p>${err.message}</p></div>`;
    return;
  }

  if (restaurants.length === 0) {
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
