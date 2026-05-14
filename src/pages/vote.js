import { loadRestaurants, loadPoll } from '../lib/sheets.js';
import { submitVote } from '../lib/webhook.js';
import { isPastDeadline, formatRemaining, formatEventDateTime } from '../lib/time.js';
import { ATTENDANCE } from '../lib/config.js';
import { restaurantCardHtml } from '../components/restaurant-card.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';
import { showToast } from '../lib/toast.js';
import { navigate } from '../lib/router.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderVote(app, { id: pollId }) {
  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1 class="site-title">오늘뭐먹지?</h1>
      </div>
      <nav class="site-nav">
        <a href="#/">식당 보기</a>
      </nav>
    </header>
    <div id="vote-root">
      <div class="state"><p>회식 정보를 불러오는 중...</p></div>
    </div>
  `;

  const root = app.querySelector('#vote-root');

  let poll, restaurants;
  try {
    const [loadedPoll, allRestaurants] = await Promise.all([loadPoll(pollId), loadRestaurants()]);
    poll = loadedPoll;
    // poll.restaurantIds 가 비어 있으면 (구버전 폴) 전체 활성 식당을 후보로 사용
    restaurants = poll && poll.restaurantIds && poll.restaurantIds.length > 0
      ? allRestaurants.filter((r) => poll.restaurantIds.includes(r.id))
      : allRestaurants;
  } catch (err) {
    root.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!poll) {
    root.innerHTML = `<div class="state state-error"><p>존재하지 않는 투표입니다. URL을 다시 확인해주세요.</p></div>`;
    return;
  }

  if (poll.status === 'closed' || isPastDeadline(poll.deadline)) {
    root.innerHTML = `
      <section class="card stack-3">
        <h2>마감된 투표예요</h2>
        <p class="text-soft">${escapeHtml(poll.title)} 투표는 이미 마감되었습니다.</p>
        <div class="row-2">
          <button class="btn btn-primary" id="go-result">결과 보러 가기</button>
          <button class="btn btn-outline" id="go-home">식당 보기</button>
        </div>
      </section>
    `;
    root.querySelector('#go-result').addEventListener('click', () => navigate(`/result/${poll.id}`));
    root.querySelector('#go-home').addEventListener('click', () => navigate('/'));
    return;
  }

  // ────── 정상 렌더 ──────
  const state = {
    voterName: '',
    attendance: '',
    choice1Id: '',
    choice2Id: '',
    filter: { category: '', query: '' },
    submitting: false
  };

  root.innerHTML = `
    <section class="vote-header">
      <h2>${escapeHtml(poll.title)}</h2>
      <div class="vote-meta">
        <span>🍽 ${escapeHtml(poll.mealType || '회식')}</span>
        <span>📅 ${escapeHtml(formatEventDateTime(poll.eventDate, poll.eventTime))}</span>
      </div>
      <div class="vote-countdown" id="countdown">마감까지: 계산 중...</div>
      ${poll.description ? `<p>${escapeHtml(poll.description)}</p>` : ''}
    </section>

    <section class="card stack-4" style="margin-top: var(--space-3);">
      <div class="stack-3">
        <label class="field-label" for="voter-name">이름</label>
        <input
          type="text"
          id="voter-name"
          class="input"
          placeholder="이름을 입력해주세요"
          autocomplete="off"
          maxlength="40"
        />
        <p class="field-error" id="voter-name-error" hidden>이름을 입력해주세요.</p>
      </div>

      <div class="stack-3">
        <label class="field-label">참석 여부</label>
        <div class="attendance-row" id="attendance-row">
          <label class="attendance-option" data-value="${ATTENDANCE.YES}">
            <input type="radio" name="attendance" value="${ATTENDANCE.YES}" />
            <span>✅ 참석</span>
          </label>
          <label class="attendance-option" data-value="${ATTENDANCE.NO}">
            <input type="radio" name="attendance" value="${ATTENDANCE.NO}" />
            <span>❌ 불참석</span>
          </label>
          <label class="attendance-option" data-value="${ATTENDANCE.HOLD}">
            <input type="radio" name="attendance" value="${ATTENDANCE.HOLD}" />
            <span>🤔 보류</span>
          </label>
        </div>
      </div>
    </section>

    <section class="card stack-3" id="choice-section" style="margin-top: var(--space-3); display: none;">
      <div>
        <h3>희망 식당 선택</h3>
        <p class="text-soft fs-small">1순위와 2순위를 골라주세요. (서로 다른 식당)</p>
      </div>
      <div id="vote-filter-mount"></div>
      <p class="text-soft fs-small" id="choice-summary"></p>
      <div id="vote-list" class="restaurant-grid"></div>
    </section>

    <div class="submit-bar" style="margin-top: var(--space-3);">
      <button class="btn btn-primary btn-block" id="submit-btn">투표 제출</button>
    </div>
  `;

  // ─── countdown ─────────────────────────────────────────
  const countdownEl = root.querySelector('#countdown');
  function tickCountdown() {
    if (isPastDeadline(poll.deadline)) {
      countdownEl.textContent = '⏰ 마감되었습니다';
      return false;
    }
    countdownEl.textContent = `⏰ 마감까지: ${formatRemaining(poll.deadline)}`;
    return true;
  }
  tickCountdown();
  const tickHandle = setInterval(() => {
    if (!tickCountdown()) clearInterval(tickHandle);
  }, 1000);
  window.addEventListener('hashchange', () => clearInterval(tickHandle), { once: true });

  // ─── name ─────────────────────────────────────────────
  const nameInput = root.querySelector('#voter-name');
  const nameError = root.querySelector('#voter-name-error');
  nameInput.addEventListener('input', () => {
    state.voterName = nameInput.value.trim();
    if (state.voterName) {
      nameInput.classList.remove('has-error');
      nameError.hidden = true;
    }
  });

  // ─── attendance ───────────────────────────────────────
  const attendanceRow = root.querySelector('#attendance-row');
  const choiceSection = root.querySelector('#choice-section');
  attendanceRow.addEventListener('change', (e) => {
    if (e.target.name !== 'attendance') return;
    state.attendance = e.target.value;
    attendanceRow.querySelectorAll('.attendance-option').forEach((opt) => {
      opt.classList.toggle('is-picked', opt.dataset.value === state.attendance);
    });
    choiceSection.style.display = state.attendance === ATTENDANCE.YES ? '' : 'none';
    if (state.attendance !== ATTENDANCE.YES) {
      state.choice1Id = '';
      state.choice2Id = '';
    }
  });

  // ─── filter + restaurant list (choice mode) ──────────
  const filterMount = root.querySelector('#vote-filter-mount');
  const listEl = root.querySelector('#vote-list');
  const choiceSummary = root.querySelector('#choice-summary');

  const categories = [...new Set(restaurants.map((r) => r.category).filter(Boolean))];
  filterMount.innerHTML = filterBarHtml({ categories, selectedCategory: '', query: '' });

  function renderList() {
    const filtered = applyFilter(restaurants, state.filter);
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="state"><p>조건에 맞는 식당이 없습니다.</p></div>`;
      return;
    }
    listEl.innerHTML = filtered
      .map((r) =>
        restaurantCardHtml(r, {
          mode: 'choice',
          choice1Id: state.choice1Id,
          choice2Id: state.choice2Id
        })
      )
      .join('');
  }

  function renderChoiceSummary() {
    const find = (id) => restaurants.find((r) => r.id === id);
    const first = find(state.choice1Id);
    const second = find(state.choice2Id);
    if (!first && !second) {
      choiceSummary.textContent = '아직 선택하지 않았어요.';
    } else {
      const parts = [];
      if (first) parts.push(`1순위: ${first.name}`);
      if (second) parts.push(`2순위: ${second.name}`);
      choiceSummary.textContent = parts.join(' · ');
    }
  }

  bindFilterBar(filterMount, state.filter, () => renderList());

  listEl.addEventListener('change', (e) => {
    const radio = e.target;
    if (radio.name !== 'choice1' && radio.name !== 'choice2') return;
    const id = radio.value;

    if (radio.name === 'choice1') {
      state.choice1Id = id;
      if (state.choice2Id === id) state.choice2Id = '';
    } else {
      if (state.choice1Id === id) {
        showToast('1순위와 다른 식당을 골라주세요', { error: true });
        radio.checked = false;
        return;
      }
      state.choice2Id = id;
    }
    renderList();
    renderChoiceSummary();
  });

  renderList();
  renderChoiceSummary();

  // ─── submit ───────────────────────────────────────────
  const submitBtn = root.querySelector('#submit-btn');
  submitBtn.addEventListener('click', async () => {
    if (state.submitting) return;

    if (!state.voterName) {
      nameInput.classList.add('has-error');
      nameError.hidden = false;
      nameInput.focus();
      return;
    }
    if (!state.attendance) {
      showToast('참석 여부를 선택해주세요', { error: true });
      return;
    }
    if (state.attendance === ATTENDANCE.YES && !state.choice1Id) {
      showToast('1순위 식당을 골라주세요', { error: true });
      return;
    }

    state.submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '제출 중...';

    try {
      const result = await submitVote({
        pollId: poll.id,
        voterName: state.voterName,
        attendance: state.attendance,
        choice1Id: state.choice1Id,
        choice2Id: state.choice2Id
      });
      renderSuccess(root, poll, result, state);
    } catch (err) {
      showToast(err.message || '제출에 실패했습니다', { error: true });
      submitBtn.disabled = false;
      submitBtn.textContent = '투표 제출';
      state.submitting = false;
    }
  });
}

function renderSuccess(root, poll, result, state) {
  const updatedNote = result.updated ? '기존 투표를 수정했어요.' : '투표가 제출되었어요.';
  root.innerHTML = `
    <section class="card stack-4" style="text-align: center;">
      <div style="font-size: 4.8rem;">🎉</div>
      <h2>${escapeHtml(updatedNote)}</h2>
      <p class="text-soft">${escapeHtml(poll.title)}</p>
      <p class="text-soft fs-small">이름: ${escapeHtml(state.voterName)} / ${escapeHtml(state.attendance)}</p>
      <div class="row-2" style="justify-content: center; flex-wrap: wrap;">
        <button class="btn btn-outline" id="redo">다시 투표</button>
        <button class="btn btn-primary" id="go-home">홈으로</button>
      </div>
    </section>
  `;
  root.querySelector('#redo').addEventListener('click', () => location.reload());
  root.querySelector('#go-home').addEventListener('click', () => navigate('/'));
}
