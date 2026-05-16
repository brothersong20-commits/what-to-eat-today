import { loadPoll, loadRestaurants, loadVotes } from '../lib/supabase.js';
import { tally } from '../lib/tally.js';
import { isPastDeadline, formatRemaining, formatEventDateTime } from '../lib/time.js';
import { ATTENDANCE } from '../lib/config.js';
import { navigate } from '../lib/router.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderResult(app, { id: pollId }) {
  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1 class="site-title">오늘뭐먹지?</h1>
      </div>
      <nav class="site-nav">
        <a href="#/">식당 보기</a>
      </nav>
    </header>
    <div id="result-root">
      <div class="state"><p>결과를 불러오는 중...</p></div>
    </div>
  `;

  const root = app.querySelector('#result-root');

  let poll, restaurants, votes;
  try {
    [poll, restaurants] = await Promise.all([loadPoll(pollId), loadRestaurants()]);
  } catch (err) {
    root.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!poll) {
    root.innerHTML = `<div class="state state-error"><p>존재하지 않는 투표입니다.</p></div>`;
    return;
  }

  const closed = poll.status === 'closed' || isPastDeadline(poll.deadline);

  // 마감 전: 카운트다운 안내만
  if (!closed) {
    root.innerHTML = `
      <section class="vote-header">
        <h2>${escapeHtml(poll.title)}</h2>
        <div class="vote-meta">
          <span>📅 ${escapeHtml(formatEventDateTime(poll.eventDate, poll.eventTime))}</span>
        </div>
        <div class="vote-countdown" id="countdown">마감까지: 계산 중...</div>
      </section>
      <section class="card stack-3" style="margin-top: var(--space-3); text-align: center;">
        <div style="font-size: 4rem;">🗳️</div>
        <h3>아직 진행 중인 투표예요</h3>
        <p class="text-soft">결과는 마감 시각 이후에 공개됩니다.</p>
        <div class="row-2" style="justify-content: center;">
          <button class="btn btn-primary" id="go-vote">투표하러 가기</button>
        </div>
      </section>
    `;
    root.querySelector('#go-vote').addEventListener('click', () => navigate(`/vote/${poll.id}`));

    const countdownEl = root.querySelector('#countdown');
    const tick = () => {
      if (isPastDeadline(poll.deadline)) {
        location.reload();
        return;
      }
      countdownEl.textContent = `⏰ 마감까지: ${formatRemaining(poll.deadline)}`;
    };
    tick();
    const handle = setInterval(tick, 1000);
    window.addEventListener('hashchange', () => clearInterval(handle), { once: true });
    return;
  }

  // 마감 후: 결과 표시
  try {
    votes = await loadVotes(poll.id);
  } catch (err) {
    root.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  // 폴이 후보 식당을 명시했으면 그 셋으로 좁힘. 취소된 식당은 일반 사용자 결과에서 제외.
  const candidate = poll.restaurantIds && poll.restaurantIds.length > 0
    ? restaurants.filter((r) => poll.restaurantIds.includes(r.id))
    : restaurants;

  const result = tally(votes, candidate);

  root.innerHTML = `
    <section class="vote-header">
      <h2>${escapeHtml(poll.title)}</h2>
      <div class="vote-meta">
        <span>📅 ${escapeHtml(formatEventDateTime(poll.eventDate, poll.eventTime))}</span>
        <span>마감됨</span>
      </div>
    </section>

    <section class="stack-4" style="margin-top: var(--space-3);">
      <div>
        <h2>참석 현황</h2>
        <p class="text-soft fs-small">총 ${result.totalVotes}명 응답</p>
      </div>
      <div class="result-summary">
        <div class="stat">
          <div class="stat-num">${result.attendance[ATTENDANCE.YES]}</div>
          <div class="stat-label">참석</div>
        </div>
        <div class="stat">
          <div class="stat-num">${result.attendance[ATTENDANCE.NO]}</div>
          <div class="stat-label">불참석</div>
        </div>
        <div class="stat">
          <div class="stat-num">${result.attendance[ATTENDANCE.HOLD]}</div>
          <div class="stat-label">보류</div>
        </div>
      </div>
    </section>

    <section class="stack-4" style="margin-top: var(--space-5);">
      <div>
        <h2>식당 순위</h2>
        <p class="text-soft fs-small">1순위 2점 · 2순위 1점 가중치 합산</p>
      </div>
      ${
        result.ranking.length === 0
          ? `<div class="state"><p>아직 식당에 투표한 사람이 없습니다.</p></div>`
          : `<ol class="ranking-list">
              ${result.ranking
                .map(
                  (item, idx) => `
                <li class="ranking-item ${idx === 0 ? 'is-winner' : ''}">
                  <div class="ranking-rank">${idx === 0 ? '🏆' : `#${idx + 1}`}</div>
                  ${item.restaurant.imageUrl ? `<img class="ranking-thumb" src="${escapeHtml(item.restaurant.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
                  <div>
                    <div class="ranking-name">${escapeHtml(item.restaurant.name)}</div>
                    <div class="ranking-meta">
                      ${escapeHtml(item.restaurant.category || '')}
                      ${item.restaurant.walkingMinutes != null ? ` · 도보 ${item.restaurant.walkingMinutes}분` : ''}
                    </div>
                  </div>
                  <div class="ranking-score">
                    <div><span class="pts">${item.score}</span>점</div>
                    <div class="fs-small text-soft">1순위 ${item.first} · 2순위 ${item.second}</div>
                  </div>
                </li>
              `
                )
                .join('')}
            </ol>`
      }
    </section>
  `;
}
