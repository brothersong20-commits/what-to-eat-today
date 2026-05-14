import { createPoll } from '../lib/webhook.js';
import { loadRestaurants } from '../lib/sheets.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';
import { showToast } from '../lib/toast.js';
import { navigate } from '../lib/router.js';

const STORAGE_KEY = 'wte_admin_key';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function renderAdmin(app) {
  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1 class="site-title">오늘뭐먹지?</h1>
        <p class="site-subtitle">관리자</p>
      </div>
      <nav class="site-nav">
        <a href="#/">홈으로</a>
      </nav>
    </header>
    <div id="admin-root"></div>
  `;

  const root = app.querySelector('#admin-root');

  if (!getStoredKey()) {
    renderLogin(root);
  } else {
    renderForm(root);
  }
}

function getStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredKey(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode 등 — 무시 */
  }
}

function clearStoredKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// ─────────────────────────────────────────────────────────
// 1) 로그인 게이트
// ─────────────────────────────────────────────────────────
function renderLogin(root) {
  root.innerHTML = `
    <section class="card stack-4">
      <div class="stack-3">
        <h2>관리자 인증</h2>
        <p class="text-soft fs-small">새 회식 투표를 만들려면 관리자 키가 필요합니다.</p>
      </div>
      <div class="stack-3">
        <label class="field-label" for="admin-key">관리자 키</label>
        <input
          type="password"
          id="admin-key"
          class="input"
          autocomplete="off"
          placeholder="키를 입력해주세요"
        />
        <p class="field-error" id="admin-key-error" hidden>관리자 키가 올바르지 않습니다.</p>
      </div>
      <button class="btn btn-primary btn-block" id="admin-login-btn">확인</button>
    </section>
  `;

  const input = root.querySelector('#admin-key');
  const errorEl = root.querySelector('#admin-key-error');
  const btn = root.querySelector('#admin-login-btn');

  input.focus();

  function showError() {
    input.classList.add('has-error');
    errorEl.hidden = false;
  }

  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    errorEl.hidden = true;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btn.click();
    }
  });

  btn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) {
      showError();
      input.focus();
      return;
    }
    const expected = import.meta.env.VITE_ADMIN_KEY;
    if (expected && value !== expected) {
      showError();
      input.focus();
      return;
    }
    setStoredKey(value);
    renderForm(root);
  });
}

// ─────────────────────────────────────────────────────────
// 2) 폼 뷰
// ─────────────────────────────────────────────────────────
async function renderForm(root) {
  root.innerHTML = `<div class="state"><p>식당 목록을 불러오는 중...</p></div>`;

  let restaurants;
  try {
    restaurants = await loadRestaurants();
  } catch (err) {
    root.innerHTML = `<div class="state state-error"><p>${err.message}</p></div>`;
    return;
  }

  root.innerHTML = `
    <section class="card stack-4">
      <div class="stack-3">
        <h2>새 회식 투표 만들기</h2>
        <p class="text-soft fs-small">아래 항목을 채워 투표를 생성하세요. 생성 후 공유 링크가 발급됩니다.</p>
      </div>

      <form id="admin-form" class="stack-4" novalidate>
        <div class="stack-3">
          <label class="field-label" for="pf-title">제목</label>
          <input type="text" id="pf-title" class="input" maxlength="60" placeholder="예: 5월 부서 저녁회식" autocomplete="off" />
          <p class="field-error" id="pf-title-error" hidden>제목을 입력해주세요.</p>
        </div>

        <div class="stack-3">
          <label class="field-label" for="pf-meal-type">회식 종류</label>
          <select id="pf-meal-type" class="input">
            <option value="점심">점심</option>
            <option value="저녁" selected>저녁</option>
            <option value="회식">회식</option>
            <option value="기타">기타</option>
          </select>
        </div>

        <div class="stack-3">
          <label class="field-label" for="pf-event-date">행사 날짜</label>
          <input type="date" id="pf-event-date" class="input" />
          <p class="field-error" id="pf-event-date-error" hidden>행사 날짜를 선택해주세요.</p>
        </div>

        <div class="stack-3">
          <label class="field-label" for="pf-event-time">행사 시간</label>
          <input type="time" id="pf-event-time" class="input" />
          <p class="field-error" id="pf-event-time-error" hidden>행사 시간을 선택해주세요.</p>
        </div>

        <div class="stack-3">
          <label class="field-label" for="pf-deadline">투표 마감 시각</label>
          <input type="datetime-local" id="pf-deadline" class="input" />
          <p class="field-error" id="pf-deadline-error" hidden>마감 시각을 선택해주세요.</p>
        </div>

        <div class="stack-3">
          <label class="field-label" for="pf-description">설명 (선택)</label>
          <textarea id="pf-description" class="input" rows="3" maxlength="200" placeholder="참석자에게 보일 메모" style="height: auto; padding: 1rem 1.4rem; resize: vertical;"></textarea>
        </div>

        <div class="stack-3">
          <label class="field-label">투표 후보 식당</label>
          <p class="text-soft fs-small">참석자가 1·2순위로 고를 식당을 골라주세요. (최소 2개)</p>
          <div id="admin-restaurant-filter"></div>
          <div class="row-3" style="justify-content: space-between;">
            <span class="fs-small text-soft" id="admin-restaurant-count">선택 0개</span>
            <div class="row-2">
              <button type="button" class="btn btn-ghost btn-dark" id="admin-select-all">표시된 항목 선택</button>
              <button type="button" class="btn btn-ghost" id="admin-clear-all">선택 해제</button>
            </div>
          </div>
          <div id="admin-restaurant-list" class="admin-restaurant-grid"></div>
          <p class="field-error" id="pf-restaurants-error" hidden>최소 2개 이상의 식당을 선택해주세요.</p>
        </div>
      </form>
    </section>

    <div class="submit-bar" style="margin-top: var(--space-3);">
      <button class="btn btn-primary btn-block" id="pf-submit">투표 만들기</button>
    </div>

    <div class="row-2" style="margin-top: var(--space-3); justify-content: flex-end;">
      <button class="btn btn-ghost" id="admin-logout">로그아웃</button>
    </div>
  `;

  const submitBtn = root.querySelector('#pf-submit');
  const fields = {
    title: root.querySelector('#pf-title'),
    mealType: root.querySelector('#pf-meal-type'),
    eventDate: root.querySelector('#pf-event-date'),
    eventTime: root.querySelector('#pf-event-time'),
    deadline: root.querySelector('#pf-deadline'),
    description: root.querySelector('#pf-description')
  };
  const errors = {
    title: root.querySelector('#pf-title-error'),
    eventDate: root.querySelector('#pf-event-date-error'),
    eventTime: root.querySelector('#pf-event-time-error'),
    deadline: root.querySelector('#pf-deadline-error'),
    restaurants: root.querySelector('#pf-restaurants-error')
  };

  Object.entries(fields).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      el.classList.remove('has-error');
      if (errors[key]) errors[key].hidden = true;
    });
  });

  root.querySelector('#admin-logout').addEventListener('click', () => {
    clearStoredKey();
    renderLogin(root);
  });

  // ─── 식당 선택 섹션 ──────────────────────────────────────
  const selectedIds = new Set();
  const filterState = { category: '', query: '' };
  const filterMount = root.querySelector('#admin-restaurant-filter');
  const listEl = root.querySelector('#admin-restaurant-list');
  const countEl = root.querySelector('#admin-restaurant-count');

  const categories = [...new Set(restaurants.map((r) => r.category).filter(Boolean))];
  filterMount.innerHTML = filterBarHtml({ categories, selectedCategory: '', query: '' });

  function renderRestaurantList() {
    const filtered = applyFilter(restaurants, filterState);
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="state"><p>조건에 맞는 식당이 없습니다.</p></div>`;
      return;
    }
    listEl.innerHTML = filtered.map((r) => {
      const checked = selectedIds.has(r.id) ? 'checked' : '';
      const category = r.category ? `<span class="rc-badge">${escapeHtml(r.category)}</span>` : '';
      return `
        <label class="admin-restaurant-row">
          <input type="checkbox" value="${escapeHtml(r.id)}" ${checked} />
          ${category}
          <span class="admin-restaurant-name">${escapeHtml(r.name)}</span>
        </label>
      `;
    }).join('');
  }

  function updateCount() {
    countEl.textContent = `선택 ${selectedIds.size}개`;
    if (selectedIds.size >= 2) {
      errors.restaurants.hidden = true;
    }
  }

  bindFilterBar(filterMount, filterState, () => renderRestaurantList());

  listEl.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
    if (cb.checked) selectedIds.add(cb.value);
    else selectedIds.delete(cb.value);
    updateCount();
  });

  root.querySelector('#admin-select-all').addEventListener('click', () => {
    const filtered = applyFilter(restaurants, filterState);
    filtered.forEach((r) => selectedIds.add(r.id));
    renderRestaurantList();
    updateCount();
  });

  root.querySelector('#admin-clear-all').addEventListener('click', () => {
    selectedIds.clear();
    renderRestaurantList();
    updateCount();
  });

  renderRestaurantList();
  updateCount();

  let submitting = false;
  submitBtn.addEventListener('click', async () => {
    if (submitting) return;

    const title = fields.title.value.trim();
    const mealType = fields.mealType.value;
    const eventDate = fields.eventDate.value;
    const eventTime = fields.eventTime.value;
    const deadlineRaw = fields.deadline.value;
    const description = fields.description.value.trim();

    let firstErrorEl = null;
    function markError(fieldKey) {
      fields[fieldKey].classList.add('has-error');
      if (errors[fieldKey]) errors[fieldKey].hidden = false;
      if (!firstErrorEl) firstErrorEl = fields[fieldKey];
    }

    if (!title) markError('title');
    if (!eventDate) markError('eventDate');
    if (!eventTime) markError('eventTime');
    if (!deadlineRaw) markError('deadline');

    if (selectedIds.size < 2) {
      errors.restaurants.hidden = false;
      if (!firstErrorEl) firstErrorEl = listEl;
    }

    if (firstErrorEl) {
      firstErrorEl.focus?.();
      firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const deadlineDate = new Date(deadlineRaw);
    if (isNaN(deadlineDate.getTime())) {
      markError('deadline');
      fields.deadline.focus();
      return;
    }
    if (deadlineDate.getTime() <= Date.now()) {
      showToast('마감 시각은 현재보다 이후여야 합니다', { error: true });
      fields.deadline.focus();
      return;
    }
    const eventDateTime = new Date(`${eventDate}T${eventTime}:00`);
    if (!isNaN(eventDateTime.getTime()) && deadlineDate.getTime() > eventDateTime.getTime()) {
      showToast('마감 시각은 행사 시작 전이어야 합니다', { error: true });
      fields.deadline.focus();
      return;
    }

    const deadlineWire = deadlineRaw.replace('T', ' ');

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '만드는 중...';

    try {
      const result = await createPoll({
        adminKey: getStoredKey(),
        title,
        mealType,
        eventDate,
        eventTime,
        deadline: deadlineWire,
        description,
        restaurantIds: [...selectedIds]
      });
      if (!result || !result.pollId) {
        showToast('서버 응답에 투표 ID가 없습니다. polls 시트를 확인해주세요.', { error: true });
        submitBtn.disabled = false;
        submitBtn.textContent = '투표 만들기';
        submitting = false;
        return;
      }
      renderSuccess(root, { pollId: result.pollId, title });
    } catch (err) {
      if (err.code === 'unauthorized') {
        clearStoredKey();
        showToast('관리자 키가 만료되었거나 변경되었습니다. 다시 로그인해주세요', { error: true });
        renderLogin(root);
        return;
      }
      showToast(err.message || '생성에 실패했습니다', { error: true });
      submitBtn.disabled = false;
      submitBtn.textContent = '투표 만들기';
      submitting = false;
    }
  });
}

// ─────────────────────────────────────────────────────────
// 3) 성공 뷰
// ─────────────────────────────────────────────────────────
function renderSuccess(root, { pollId, title }) {
  const shareUrl = `${location.href.split('#')[0]}#/vote/${pollId}`;

  root.innerHTML = `
    <section class="card stack-4" style="text-align: center;">
      <div style="font-size: 4.8rem;">🎉</div>
      <h2>투표가 만들어졌어요</h2>
      <p class="text-soft">${escapeHtml(title)}</p>

      <div class="stack-3" style="text-align: left;">
        <div class="stack-3">
          <span class="field-label">투표 ID</span>
          <code style="display: block; padding: 1rem 1.4rem; background: var(--canvas-2, rgba(0,0,0,0.04)); border-radius: var(--radius-input); font-size: 1.5rem;">${escapeHtml(pollId)}</code>
        </div>
        <div class="stack-3">
          <span class="field-label">공유 링크</span>
          <input type="text" id="share-url" class="input" readonly value="${escapeHtml(shareUrl)}" />
        </div>
      </div>

      <div class="row-2" style="justify-content: center; flex-wrap: wrap;">
        <button class="btn btn-primary" id="copy-url">링크 복사</button>
        <button class="btn btn-outline" id="go-vote">투표 페이지로</button>
        <button class="btn btn-ghost" id="make-another">새 투표 만들기</button>
      </div>
    </section>
  `;

  const urlInput = root.querySelector('#share-url');

  root.querySelector('#copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('링크가 복사되었어요');
    } catch {
      urlInput.select();
      try {
        document.execCommand('copy');
        showToast('링크가 복사되었어요');
      } catch {
        showToast('복사에 실패했어요. 직접 복사해주세요', { error: true });
      }
    }
  });

  root.querySelector('#go-vote').addEventListener('click', () => navigate(`/vote/${pollId}`));
  root.querySelector('#make-another').addEventListener('click', () => renderForm(root));
}
