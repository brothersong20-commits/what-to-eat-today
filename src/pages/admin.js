import { createPoll, updatePoll, deletePoll, loadPolls, loadRestaurants, loadVotes, subscribeVotes, unsubscribe, createRestaurant, updateRestaurant, deleteRestaurant, setRestaurantActive, loadCafes, createCafe, updateCafe, deleteCafe, setCafeActive, loadOptions, createOption, updateOption, deleteOption } from '../lib/supabase.js';
import { CATEGORIES, AREAS, CAFE_CATEGORIES, categorySlug } from '../lib/config.js';
import { serializeMenus } from '../lib/menus.js';
import { filterBarHtml, bindFilterBar, applyFilter } from '../components/filter-bar.js';
import { showToast } from '../lib/toast.js';
import { tally } from '../lib/tally.js';
import { isPastDeadline, formatRemaining, formatEventDateTime, deadlineUrgency, isDeadlineAfterEvent } from '../lib/time.js';
import { ATTENDANCE } from '../lib/config.js';
import { buildShareUrl, openQrModal } from '../components/share.js';
import { verifiedSealHtml } from '../components/verified-seal.js';

const STORAGE_KEY = 'wte_admin_key';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 모듈 스코프 cleanup 레지스트리 — 탭 전환·상세 떠나기·해시 변경 시 모두 회수
const cleanups = new Set();
function registerCleanup(fn) { cleanups.add(fn); return fn; }
function runAllCleanups() {
  for (const fn of cleanups) {
    try { fn(); } catch { /* noop */ }
  }
  cleanups.clear();
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

  // 해시가 바뀌면 모든 폴링/타이머 회수
  window.addEventListener('hashchange', runAllCleanups, { once: true });

  if (!getStoredKey()) {
    renderLogin(root);
  } else {
    renderShell(root);
  }
}

function getStoredKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}
function setStoredKey(value) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* noop */ }
}
function clearStoredKey() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────
// 로그인 게이트
// ─────────────────────────────────────────────────────────
function renderLogin(root) {
  runAllCleanups();
  root.innerHTML = `
    <section class="card stack-4">
      <div class="stack-3">
        <h2>관리자 인증</h2>
        <p class="text-soft fs-small">진행중인 회식 투표를 관리하려면 관리자 키가 필요합니다.</p>
      </div>
      <div class="stack-3">
        <label class="field-label" for="admin-key">관리자 키</label>
        <div class="input-wrap">
          <input type="password" id="admin-key" class="input" autocomplete="off" placeholder="키를 입력해주세요" />
          <span class="caps-hint" id="admin-caps-hint" hidden>⇪ Caps Lock 켜짐</span>
        </div>
        <p class="field-error" id="admin-key-error" hidden>관리자 키가 올바르지 않습니다.</p>
      </div>
      <button class="btn btn-primary btn-block" id="admin-login-btn">확인</button>
    </section>
  `;

  const input = root.querySelector('#admin-key');
  const errorEl = root.querySelector('#admin-key-error');
  const capsHint = root.querySelector('#admin-caps-hint');
  const btn = root.querySelector('#admin-login-btn');
  input.focus();

  function showError() {
    input.classList.add('has-error');
    errorEl.hidden = false;
  }

  function syncCaps(e) {
    const on = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
    capsHint.hidden = !on;
  }

  input.addEventListener('input', () => {
    input.classList.remove('has-error');
    errorEl.hidden = true;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btn.click(); return; }
    syncCaps(e);
  });
  input.addEventListener('keyup', syncCaps);
  input.addEventListener('blur', () => { capsHint.hidden = true; });
  btn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) { showError(); input.focus(); return; }
    const expected = import.meta.env.VITE_ADMIN_KEY;
    if (expected && value !== expected) { showError(); input.focus(); return; }
    setStoredKey(value);
    renderShell(root);
  });
}

// ─────────────────────────────────────────────────────────
// 탭 셸
// ─────────────────────────────────────────────────────────
function renderShell(root, { initialTab = 'active', autoOpenPollId = null } = {}) {
  runAllCleanups();
  root.innerHTML = `
    <div class="admin-tabs" role="tablist">
      <button type="button" class="admin-tab" data-tab="active" role="tab">진행중인 투표</button>
      <button type="button" class="admin-tab" data-tab="new" role="tab">새 투표 만들기</button>
      <button type="button" class="admin-tab" data-tab="restaurants" role="tab">식당 관리</button>
      <button type="button" class="admin-tab" data-tab="cafes" role="tab">카페 관리</button>
      <button type="button" class="admin-tab" data-tab="options" role="tab">분류 관리</button>
      <button type="button" class="btn btn-ghost admin-logout" id="admin-logout">로그아웃</button>
    </div>
    <div id="admin-tab-body"></div>
  `;

  const body = root.querySelector('#admin-tab-body');
  const tabs = root.querySelectorAll('.admin-tab');

  function activate(tab) {
    tabs.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    runAllCleanups();
    if (tab === 'active') renderActiveList(body, root, { autoOpenPollId });
    else if (tab === 'restaurants') renderRestaurantsTab(body, root);
    else if (tab === 'cafes') renderCafesTab(body, root);
    else if (tab === 'options') renderOptionsTab(body, root);
    else renderForm(body, root);
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });

  root.querySelector('#admin-logout').addEventListener('click', () => {
    clearStoredKey();
    renderLogin(root);
  });

  activate(initialTab);
}

// ─────────────────────────────────────────────────────────
// 진행중 투표 목록
// ─────────────────────────────────────────────────────────
async function renderActiveList(mount, shellRoot, { autoOpenPollId = null } = {}) {
  mount.innerHTML = `<div class="state"><p>투표 목록을 불러오는 중...</p></div>`;

  let polls = [];
  let restaurants = [];
  try {
    [polls, restaurants] = await Promise.all([loadPolls(), loadRestaurants()]);
  } catch (err) {
    mount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const active = polls
    .filter((p) => p.status === 'active' && !isPastDeadline(p.deadline))
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

  const closed = polls
    .filter((p) => p.status === 'closed' || isPastDeadline(p.deadline))
    .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''));

  mount.innerHTML = `
    <section class="stack-4">
      <div>
        <h2>진행중인 투표</h2>
        <p class="text-soft fs-small">카드를 클릭해 현황을 보고 수정할 수 있습니다.</p>
      </div>
      <div id="active-poll-cards" class="poll-list">
        ${
          active.length === 0
            ? `<div class="state"><p>진행중인 투표가 없습니다. <a href="#" id="go-new-tab">새 투표 만들기</a> 탭에서 만들어보세요.</p></div>`
            : active.map(pollCardHtml).join('')
        }
      </div>

      ${closed.length > 0 ? `
        <details class="closed-polls">
          <summary>마감된 투표 (${closed.length})</summary>
          <div class="poll-list" id="closed-poll-cards" style="margin-top: var(--space-3);">
            ${closed.map(pollCardHtml).join('')}
          </div>
        </details>
      ` : ''}
    </section>
  `;

  const handleCardClick = (e) => {
    const card = e.target.closest('[data-poll-id]');
    if (!card) return;
    e.preventDefault();
    const pollId = card.dataset.pollId;
    renderDetail(mount, shellRoot, pollId, polls, restaurants);
  };
  mount.querySelector('#active-poll-cards')?.addEventListener('click', handleCardClick);
  mount.querySelector('#closed-poll-cards')?.addEventListener('click', handleCardClick);

  const goNew = mount.querySelector('#go-new-tab');
  if (goNew) {
    goNew.addEventListener('click', (e) => {
      e.preventDefault();
      shellRoot.querySelector('.admin-tab[data-tab="new"]').click();
    });
  }

  if (autoOpenPollId && polls.some((p) => p.id === autoOpenPollId)) {
    renderDetail(mount, shellRoot, autoOpenPollId, polls, restaurants);
  }
}

function pollCardHtml(p) {
  const eventStr = formatEventDateTime(p.eventDate, p.eventTime);
  const closed = p.status === 'closed' || isPastDeadline(p.deadline);
  const remaining = closed ? '마감됨' : `마감까지 ${formatRemaining(p.deadline)}`;
  const candidateCount = p.restaurantIds?.length || 0;
  const removedCount = p.removedRestaurantIds?.length || 0;
  const urg = closed ? null : deadlineUrgency(p.deadline);
  const badge = closed
    ? { cls: 'is-closed', text: '마감' }
    : urg
      ? { cls: `is-${urg}`, text: '마감임박' }
      : { cls: 'is-active', text: '진행중' };
  return `
    <a class="poll-item poll-item--admin ${closed ? 'is-closed' : ''}" href="#" data-poll-id="${escapeHtml(p.id)}">
      <div class="poll-item-admin-head">
        <div class="poll-item-title">${escapeHtml(p.title)}</div>
        <span class="poll-badge ${badge.cls}">${badge.text}</span>
      </div>
      <div class="poll-item-meta">
        ${p.mealType ? `<span class="poll-item-meal">🍽 ${escapeHtml(p.mealType)}</span>` : ''}
        ${eventStr ? `<span class="poll-item-date">📅 ${escapeHtml(eventStr)}</span>` : ''}
        <span class="poll-item-substats">🍱 후보 ${candidateCount}개${removedCount > 0 ? ` · 취소 ${removedCount}` : ''}</span>
      </div>
      <div class="poll-item-deadline">⏰ ${escapeHtml(remaining)}</div>
    </a>
  `;
}

// ─────────────────────────────────────────────────────────
// 상세 패널 (수정 폼 + 실시간 현황)
// ─────────────────────────────────────────────────────────
async function renderDetail(mount, shellRoot, pollId, allPolls, restaurants) {
  runAllCleanups();

  let poll = allPolls.find((p) => p.id === pollId);
  if (!poll) {
    mount.innerHTML = `<div class="state state-error"><p>투표를 찾을 수 없습니다.</p></div>`;
    return;
  }

  const closed = poll.status === 'closed' || isPastDeadline(poll.deadline);
  const readonly = closed; // 마감 후엔 폼 잠금, 상태 토글만 활성
  const shareUrl = buildShareUrl(poll.id);

  mount.innerHTML = `
    <div class="detail-toolbar">
      <button type="button" class="btn btn-ghost" id="detail-back">← 목록으로</button>
      <button type="button" class="btn btn-ghost rf-danger" id="detail-delete" style="margin-left: auto;">투표 삭제</button>
    </div>
    <div class="card detail-share">
      <span class="rf-section-title">공유 링크</span>
      <div class="detail-share-row">
        <input type="text" id="detail-share-url" class="input detail-share-input" readonly value="${escapeHtml(shareUrl)}" />
        <button type="button" class="btn btn-outline" id="detail-copy-url">링크 복사</button>
        <button type="button" class="btn btn-outline" id="detail-qr">QR 코드</button>
      </div>
    </div>

    <div class="detail-grid">
      <section class="card stack-4 detail-edit">
        <div class="stack-3">
          <h2>투표 수정</h2>
          <p class="text-soft fs-small">
            ${readonly
              ? '마감된 투표입니다. 다시 열려면 상태 토글을 끄세요.'
              : '변경한 필드만 저장됩니다. 후보 식당을 제외해도 기존 표는 "취소된 식당" 섹션에 보존됩니다.'}
          </p>
        </div>

        <form id="detail-form" class="stack-4" novalidate>
          <section class="rf-section stack-3">
            <h4 class="rf-section-title">기본 정보</h4>
            <div class="stack-3">
              <label class="field-label" for="df-title">제목</label>
              <input type="text" id="df-title" class="input" maxlength="60" />
            </div>
            <div class="stack-3">
              <label class="field-label" for="df-meal-type">회식 종류</label>
              <select id="df-meal-type" class="input">
                <option value="점심">점심</option>
                <option value="저녁">저녁</option>
                <option value="회식">회식</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </section>

          <section class="rf-section stack-3">
            <h4 class="rf-section-title">일정</h4>
            <div class="field-pair">
              <div class="stack-3">
                <label class="field-label" for="df-event-date">행사 날짜</label>
                <input type="date" id="df-event-date" class="input" />
              </div>
              <div class="stack-3">
                <label class="field-label" for="df-event-time">행사 시간</label>
                <input type="time" id="df-event-time" class="input" />
              </div>
            </div>
            <div class="stack-3">
              <label class="field-label" for="df-deadline">투표 마감 시각</label>
              <input type="datetime-local" id="df-deadline" class="input" />
              <p class="field-warn" id="df-deadline-warn" hidden>마감 시각은 행사 시작 시각보다 빨라야 합니다.</p>
            </div>
          </section>

          <section class="rf-section stack-3">
            <h4 class="rf-section-title">상태 · 후보</h4>
            <label class="status-toggle">
              <input type="checkbox" id="df-status-closed" />
              <span>이 투표를 마감 처리</span>
            </label>
            <div class="stack-3">
              <label class="field-label">투표 후보 식당</label>
              <p class="text-soft fs-small">최소 2개. 체크 해제하면 후보에서 제외되고 "취소된 식당"으로 표시됩니다.</p>
              <div id="df-restaurant-filter"></div>
              <div class="row-3" style="justify-content: space-between;">
                <span class="fs-small text-soft" id="df-restaurant-count">선택 0개</span>
              </div>
              <div id="df-restaurant-list" class="admin-restaurant-grid"></div>
            </div>
          </section>

          <section class="rf-section stack-3">
            <h4 class="rf-section-title">메모</h4>
            <div class="stack-3">
              <label class="field-label" for="df-description">설명</label>
              <textarea id="df-description" class="input" rows="3" maxlength="200" style="height: auto; padding: 1rem 1.4rem; resize: vertical;"></textarea>
            </div>
          </section>
        </form>

        <button class="btn btn-primary btn-block" id="df-save">저장하기</button>
      </section>

      <section class="card stack-4 detail-status" id="detail-status-mount">
        <div class="state"><p>현황을 불러오는 중...</p></div>
      </section>
    </div>
  `;

  mount.querySelector('#detail-back').addEventListener('click', () => {
    runAllCleanups();
    renderActiveList(mount, shellRoot);
  });

  mount.querySelector('#detail-delete').addEventListener('click', async () => {
    if (!confirm(`정말 "${poll.title}" 투표를 삭제할까요?\n이 투표에 등록된 모든 표가 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      await deletePoll({ adminKey: getStoredKey(), pollId: poll.id });
      const idx = allPolls.findIndex((p) => p.id === poll.id);
      if (idx >= 0) allPolls.splice(idx, 1);
      showToast('투표가 삭제되었습니다');
      runAllCleanups();
      renderActiveList(mount, shellRoot);
    } catch (err) {
      handleAdminError(err, mount, shellRoot);
    }
  });

  const urlInput = mount.querySelector('#detail-share-url');
  mount.querySelector('#detail-copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('링크가 복사되었어요');
    } catch {
      urlInput.select();
      try { document.execCommand('copy'); showToast('링크가 복사되었어요'); }
      catch { showToast('복사에 실패했어요. 직접 복사해주세요', { error: true }); }
    }
  });

  mount.querySelector('#detail-qr').addEventListener('click', () => {
    openQrModal({ url: shareUrl, title: poll.title });
  });

  // 폼 prefill (마운트 시 1회만 — 폴링이 덮어쓰지 않음)
  const form = {
    title: mount.querySelector('#df-title'),
    mealType: mount.querySelector('#df-meal-type'),
    eventDate: mount.querySelector('#df-event-date'),
    eventTime: mount.querySelector('#df-event-time'),
    deadline: mount.querySelector('#df-deadline'),
    description: mount.querySelector('#df-description'),
    statusClosed: mount.querySelector('#df-status-closed')
  };
  prefillForm(form, poll);

  const dfDeadlineWarn = mount.querySelector('#df-deadline-warn');
  function syncDeadlineWarn() {
    const bad = isDeadlineAfterEvent(
      form.deadline.value,
      form.eventDate.value,
      form.eventTime.value
    );
    dfDeadlineWarn.hidden = !bad;
    form.deadline.classList.toggle('has-warn', bad);
    return bad;
  }
  ['change', 'input'].forEach((ev) => {
    form.eventDate.addEventListener(ev, syncDeadlineWarn);
    form.eventTime.addEventListener(ev, syncDeadlineWarn);
    form.deadline.addEventListener(ev, syncDeadlineWarn);
  });
  syncDeadlineWarn();

  if (readonly) {
    [form.title, form.mealType, form.eventDate, form.eventTime, form.deadline, form.description]
      .forEach((el) => el.setAttribute('disabled', 'disabled'));
  }

  // 식당 픽커
  const filterMount = mount.querySelector('#df-restaurant-filter');
  const listEl = mount.querySelector('#df-restaurant-list');
  const countEl = mount.querySelector('#df-restaurant-count');
  const picker = mountRestaurantPicker(
    { filterMount, listEl, countEl },
    restaurants,
    {
      initiallySelected: poll.restaurantIds,
      removedDisplay: poll.removedRestaurantIds,
      disabled: readonly
    }
  );

  // 현황 패널 & 카운트다운
  const statusMount = mount.querySelector('#detail-status-mount');

  async function refreshStatus() {
    try {
      const votes = await loadVotes(poll.id);
      renderStatusPanel(statusMount, poll, restaurants, votes);
    } catch (err) {
      statusMount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
  await refreshStatus();

  // Realtime 구독 — votes 테이블 변경 시 즉시 현황 패널만 다시 렌더
  const channel = subscribeVotes(poll.id, () => { refreshStatus(); });
  registerCleanup(() => unsubscribe(channel));

  const countdownEl = statusMount.querySelector('#detail-countdown');
  if (countdownEl) {
    const tick = () => {
      const el = statusMount.querySelector('#detail-countdown');
      if (!el) return;
      const closedNow = poll.status === 'closed' || isPastDeadline(poll.deadline);
      el.classList.toggle('is-closed', closedNow);
      el.textContent = closedNow ? '⏹ 마감됨' : `⏰ 마감까지: ${formatRemaining(poll.deadline)}`;
    };
    const cdHandle = setInterval(tick, 1000);
    registerCleanup(() => clearInterval(cdHandle));
  }

  // 저장
  const saveBtn = mount.querySelector('#df-save');
  let saving = false;
  saveBtn.addEventListener('click', async () => {
    if (saving) return;

    const patch = buildPatch(form, poll, picker.getSelectedIds());
    if (Object.keys(patch).length === 0) {
      showToast('변경된 내용이 없습니다');
      return;
    }

    // 클라이언트 측 deadline 검증 (서버도 검증)
    if (patch.deadline !== undefined) {
      const d = new Date(patch.deadline.replace(' ', 'T'));
      if (isNaN(d.getTime())) {
        showToast('마감 시각이 올바르지 않습니다', { error: true });
        return;
      }
    }
    // 마감 시각이 행사 시작보다 늦으면 차단 (날짜만/마감만 바뀐 경우도 잡으려 폼값으로 비교)
    if (isDeadlineAfterEvent(form.deadline.value, form.eventDate.value, form.eventTime.value)) {
      syncDeadlineWarn();
      showToast('마감 시각은 행사 시작 전이어야 합니다', { error: true });
      form.deadline.focus();
      return;
    }
    if (patch.restaurantIds !== undefined && patch.restaurantIds.length < 2) {
      showToast('식당은 2개 이상 선택해야 합니다', { error: true });
      return;
    }

    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
      await updatePoll({ adminKey: getStoredKey(), pollId: poll.id, patch });
      showToast('저장되었습니다');

      // 폴 다시 로드해서 originalPoll 갱신 + 현황 강제 새로고침
      const fresh = await loadPolls();
      const idx = allPolls.findIndex((p) => p.id === poll.id);
      const updated = fresh.find((p) => p.id === poll.id);
      if (updated) {
        if (idx >= 0) allPolls[idx] = updated;
        poll = updated;
        prefillForm(form, poll);
        picker.refresh({
          initiallySelected: poll.restaurantIds,
          removedDisplay: poll.removedRestaurantIds
        });
      }
      await refreshStatus();
    } catch (err) {
      if (err.code === 'unauthorized') {
        clearStoredKey();
        showToast('관리자 키가 만료되었거나 변경되었습니다. 다시 로그인해주세요', { error: true });
        renderLogin(mount.closest('#admin-root') || shellRoot);
        return;
      }
      showToast(err.message || '저장에 실패했습니다', { error: true });
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = '저장하기';
    }
  });
}

function prefillForm(form, poll) {
  form.title.value = poll.title || '';
  form.mealType.value = poll.mealType || '저녁';
  form.eventDate.value = poll.eventDate || '';
  form.eventTime.value = poll.eventTime || '';
  // deadline: "YYYY-MM-DD HH:mm" → "YYYY-MM-DDTHH:mm" (datetime-local 입력 포맷)
  form.deadline.value = poll.deadline ? poll.deadline.replace(' ', 'T').slice(0, 16) : '';
  form.description.value = poll.description || '';
  form.statusClosed.checked = poll.status === 'closed';
}

function buildPatch(form, poll, currentRestaurantIds) {
  const patch = {};

  const title = form.title.value.trim();
  if (title !== poll.title) patch.title = title;

  if (form.mealType.value !== poll.mealType) patch.mealType = form.mealType.value;
  if (form.eventDate.value !== poll.eventDate) patch.eventDate = form.eventDate.value;
  if (form.eventTime.value !== poll.eventTime) patch.eventTime = form.eventTime.value;

  // deadline은 폼 포맷("YYYY-MM-DDTHH:mm")을 wire 포맷("YYYY-MM-DD HH:mm")으로 변환
  const deadlineWire = form.deadline.value ? form.deadline.value.replace('T', ' ') : '';
  if (deadlineWire !== poll.deadline) patch.deadline = deadlineWire;

  const desc = form.description.value.trim();
  if (desc !== poll.description) patch.description = desc;

  const nextStatus = form.statusClosed.checked ? 'closed' : 'active';
  if (nextStatus !== poll.status) patch.status = nextStatus;

  const currentSorted = [...currentRestaurantIds].sort();
  const originalSorted = [...poll.restaurantIds].sort();
  const sameRestaurants =
    currentSorted.length === originalSorted.length &&
    currentSorted.every((id, i) => id === originalSorted[i]);
  if (!sameRestaurants) patch.restaurantIds = currentRestaurantIds;

  return patch;
}

// ─────────────────────────────────────────────────────────
// 현황 패널 (폴링으로 재호출됨)
// ─────────────────────────────────────────────────────────
function renderStatusPanel(mount, poll, allRestaurants, votes) {
  const activeIds = new Set(poll.restaurantIds);
  const removedIds = new Set(poll.removedRestaurantIds);

  const activeCandidates = allRestaurants.filter((r) => activeIds.has(r.id));
  const removedCandidates = allRestaurants.filter((r) => removedIds.has(r.id));

  const activeResult = tally(votes, activeCandidates);
  const removedResult = tally(votes, removedCandidates);

  const closed = poll.status === 'closed' || isPastDeadline(poll.deadline);

  mount.innerHTML = `
    <div class="stack-3">
      <h2>실시간 현황</h2>
      <div class="status-countdown ${closed ? 'is-closed' : ''}" id="detail-countdown">
        ${closed ? '⏹ 마감됨' : `⏰ 마감까지: ${escapeHtml(formatRemaining(poll.deadline))}`}
      </div>
      <p class="text-soft fs-small">투표가 들어오는 즉시 실시간으로 반영됩니다</p>
    </div>

    <div class="status-stats">
      <div class="stat stat--yes">
        <div class="stat-num">${activeResult.attendance[ATTENDANCE.YES]}</div>
        <div class="stat-label">참석</div>
      </div>
      <div class="stat">
        <div class="stat-num">${activeResult.attendance[ATTENDANCE.NO]}</div>
        <div class="stat-label">불참석</div>
      </div>
      <div class="stat">
        <div class="stat-num">${activeResult.attendance[ATTENDANCE.HOLD]}</div>
        <div class="stat-label">보류</div>
      </div>
    </div>

    <div class="stack-3">
      <h3>식당 랭킹</h3>
      ${
        activeResult.ranking.length === 0
          ? `<p class="text-soft fs-small">아직 식당에 투표한 사람이 없습니다.</p>`
          : `<ol class="status-ranking">
              ${activeResult.ranking.map((item, idx) => `
                <li class="status-rank-row ${idx === 0 ? 'is-top' : ''}">
                  <span class="rank-no">${idx === 0 ? '🏆' : `#${idx + 1}`}</span>
                  <span class="rank-name">${escapeHtml(item.restaurant.name)}</span>
                  <span class="rank-score">${item.score}점 <span class="text-mute fs-small">(${item.first}·${item.second})</span></span>
                </li>
              `).join('')}
            </ol>`
      }
    </div>

    ${removedResult.ranking.length > 0 ? `
      <div class="stack-3 removed-section">
        <h3>취소된 식당 (참고)</h3>
        <p class="text-soft fs-small">후보에서 제외되었지만 이전 투표가 남아있는 식당입니다.</p>
        <ol class="status-ranking">
          ${removedResult.ranking.map((item) => `
            <li class="status-rank-row is-removed">
              <span class="rank-no">✕</span>
              <span class="rank-name">${escapeHtml(item.restaurant.name)}</span>
              <span class="rank-score">${item.score}점 <span class="text-mute fs-small">(${item.first}·${item.second})</span></span>
            </li>
          `).join('')}
        </ol>
      </div>
    ` : ''}

    <div class="stack-3">
      <h3>투표자 (${votes.length}명)</h3>
      ${
        votes.length === 0
          ? `<p class="text-soft fs-small">아직 응답한 사람이 없습니다.</p>`
          : `<ul class="voter-list">
              ${votes
                .slice()
                .sort((a, b) => (b.votedAt || '').localeCompare(a.votedAt || ''))
                .map((v) => voterRowHtml(v, allRestaurants))
                .join('')}
            </ul>`
      }
    </div>
  `;
}

function voterRowHtml(v, restaurants) {
  const nameOf = (id) => {
    const r = restaurants.find((x) => x.id === id);
    return r ? r.name : id;
  };
  const picks = v.attendance === ATTENDANCE.YES
    ? `<span class="voter-picks">1: ${escapeHtml(nameOf(v.choice1Id))}${v.choice2Id ? ` · 2: ${escapeHtml(nameOf(v.choice2Id))}` : ''}</span>`
    : '';
  return `
    <li class="voter-row">
      <span class="voter-name">${escapeHtml(v.voterName)}</span>
      <span class="voter-attendance att-${attClass(v.attendance)}">${escapeHtml(v.attendance)}</span>
      ${picks}
    </li>
  `;
}

function attClass(attendance) {
  if (attendance === ATTENDANCE.YES) return 'yes';
  if (attendance === ATTENDANCE.NO) return 'no';
  if (attendance === ATTENDANCE.HOLD) return 'hold';
  return 'unknown';
}

// ─────────────────────────────────────────────────────────
// 식당 픽커 (수정 폼 + 새 폼 양쪽에서 사용)
// ─────────────────────────────────────────────────────────
function mountRestaurantPicker(els, restaurants, opts = {}) {
  const { filterMount, listEl, countEl } = els;
  const { initiallySelected = [], removedDisplay = [], disabled = false } = opts;

  const selectedIds = new Set(initiallySelected);
  const removedSet = new Set(removedDisplay);
  const filterState = { category: '', query: '', groupDining: false };

  const categories = [...new Set(restaurants.map((r) => r.category).filter(Boolean))];
  filterMount.innerHTML = filterBarHtml({ categories, selectedCategory: '', query: '', groupDining: true });

  function renderList() {
    // 후보군 = 활성 식당 + (선택됐거나 취소됨으로 표시할 비활성 식당)
    const all = restaurants.slice();
    const filtered = applyFilter(all, filterState);
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="state"><p>조건에 맞는 식당이 없습니다.</p></div>`;
      return;
    }
    listEl.innerHTML = filtered.map((r) => {
      const checked = selectedIds.has(r.id) ? 'checked' : '';
      const isRemoved = removedSet.has(r.id) && !selectedIds.has(r.id);
      const badges = `
        ${r.category ? `<span class="rc-badge">${escapeHtml(r.category)}</span>` : ''}
        ${r.isGroupDining ? verifiedSealHtml({ size: '1.6rem' }) : ''}
        ${isRemoved ? `<span class="removed-badge">취소됨</span>` : ''}
      `;
      const disabledAttr = disabled ? 'disabled' : '';
      return `
        <label class="admin-restaurant-row ${isRemoved ? 'is-removed' : ''}">
          <input type="checkbox" value="${escapeHtml(r.id)}" ${checked} ${disabledAttr} />
          ${badges}
          <span class="admin-restaurant-name">${escapeHtml(r.name)}</span>
        </label>
      `;
    }).join('');
  }

  function updateCount() {
    countEl.textContent = `선택 ${selectedIds.size}개 · 전체 식당 ${restaurants.length}개`;
  }

  bindFilterBar(filterMount, filterState, renderList);

  listEl.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
    if (cb.checked) selectedIds.add(cb.value);
    else selectedIds.delete(cb.value);
    updateCount();
    // 체크/체크해제로 "취소됨" 배지 가시성이 바뀌므로 재렌더
    renderList();
  });

  renderList();
  updateCount();

  return {
    getSelectedIds: () => [...selectedIds],
    refresh: (next = {}) => {
      if (Array.isArray(next.initiallySelected)) {
        selectedIds.clear();
        next.initiallySelected.forEach((id) => selectedIds.add(id));
      }
      if (Array.isArray(next.removedDisplay)) {
        removedSet.clear();
        next.removedDisplay.forEach((id) => removedSet.add(id));
      }
      renderList();
      updateCount();
    }
  };
}

// ─────────────────────────────────────────────────────────
// 새 투표 만들기
// ─────────────────────────────────────────────────────────
async function renderForm(mount, shellRoot) {
  mount.innerHTML = `<div class="state"><p>식당 목록을 불러오는 중...</p></div>`;

  let restaurants;
  try {
    restaurants = await loadRestaurants();
  } catch (err) {
    mount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  mount.innerHTML = `
    <section class="card stack-4">
      <div class="stack-3">
        <h2>새 회식 투표 만들기</h2>
        <p class="text-soft fs-small">아래 항목을 채워 투표를 생성하세요. 생성 후 공유 링크가 발급됩니다.</p>
      </div>

      <form id="new-form" class="stack-4" novalidate>
        <section class="rf-section stack-3">
          <h4 class="rf-section-title">기본 정보</h4>
          <div class="stack-3">
            <label class="field-label" for="nf-title">제목</label>
            <input type="text" id="nf-title" class="input" maxlength="60" placeholder="예: 5월 부서 저녁회식" autocomplete="off" />
            <p class="field-error" id="nf-title-error" hidden>제목을 입력해주세요.</p>
          </div>
          <div class="stack-3">
            <label class="field-label" for="nf-meal-type">회식 종류</label>
            <select id="nf-meal-type" class="input">
              <option value="점심">점심</option>
              <option value="저녁" selected>저녁</option>
              <option value="회식">회식</option>
              <option value="기타">기타</option>
            </select>
          </div>
        </section>

        <section class="rf-section stack-3">
          <h4 class="rf-section-title">일정</h4>
          <div class="field-pair">
            <div class="stack-3">
              <label class="field-label" for="nf-event-date">행사 날짜</label>
              <input type="date" id="nf-event-date" class="input" />
              <p class="field-error" id="nf-event-date-error" hidden>행사 날짜를 선택해주세요.</p>
            </div>
            <div class="stack-3">
              <label class="field-label" for="nf-event-time">행사 시간</label>
              <input type="time" id="nf-event-time" class="input" />
              <p class="field-error" id="nf-event-time-error" hidden>행사 시간을 선택해주세요.</p>
            </div>
          </div>
          <div class="stack-3">
            <label class="field-label" for="nf-deadline">투표 마감 시각</label>
            <input type="datetime-local" id="nf-deadline" class="input" />
            <p class="field-error" id="nf-deadline-error" hidden>마감 시각을 선택해주세요.</p>
            <p class="field-warn" id="nf-deadline-warn" hidden>마감 시각은 행사 시작 시각보다 빨라야 합니다.</p>
          </div>
        </section>

        <section class="rf-section stack-3">
          <h4 class="rf-section-title">메모</h4>
          <div class="stack-3">
            <label class="field-label" for="nf-description">설명 (선택)</label>
            <textarea id="nf-description" class="input" rows="3" maxlength="200" placeholder="참석자에게 보일 메모" style="height: auto; padding: 1rem 1.4rem; resize: vertical;"></textarea>
          </div>
        </section>

        <section class="rf-section stack-3">
          <h4 class="rf-section-title">투표 후보 식당</h4>
          <p class="text-soft fs-small">참석자가 1·2순위로 고를 식당을 골라주세요. (최소 2개)</p>
          <div id="nf-restaurant-filter"></div>
          <div class="row-3" style="justify-content: space-between;">
            <span class="fs-small text-soft" id="nf-restaurant-count">선택 0개</span>
          </div>
          <div id="nf-restaurant-list" class="admin-restaurant-grid"></div>
          <p class="field-error" id="nf-restaurants-error" hidden>최소 2개 이상의 식당을 선택해주세요.</p>
        </section>
      </form>
    </section>

    <div class="submit-bar" style="margin-top: var(--space-3);">
      <button class="btn btn-primary btn-block" id="nf-submit">투표 만들기</button>
    </div>
  `;

  const fields = {
    title: mount.querySelector('#nf-title'),
    mealType: mount.querySelector('#nf-meal-type'),
    eventDate: mount.querySelector('#nf-event-date'),
    eventTime: mount.querySelector('#nf-event-time'),
    deadline: mount.querySelector('#nf-deadline'),
    description: mount.querySelector('#nf-description')
  };
  const errors = {
    title: mount.querySelector('#nf-title-error'),
    eventDate: mount.querySelector('#nf-event-date-error'),
    eventTime: mount.querySelector('#nf-event-time-error'),
    deadline: mount.querySelector('#nf-deadline-error'),
    restaurants: mount.querySelector('#nf-restaurants-error')
  };

  Object.entries(fields).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      el.classList.remove('has-error');
      if (errors[key]) errors[key].hidden = true;
    });
  });

  const deadlineWarn = mount.querySelector('#nf-deadline-warn');
  function syncDeadlineWarn() {
    const bad = isDeadlineAfterEvent(
      fields.deadline.value,
      fields.eventDate.value,
      fields.eventTime.value
    );
    deadlineWarn.hidden = !bad;
    fields.deadline.classList.toggle('has-warn', bad);
    return bad;
  }
  ['change', 'input'].forEach((ev) => {
    fields.eventDate.addEventListener(ev, syncDeadlineWarn);
    fields.eventTime.addEventListener(ev, syncDeadlineWarn);
    fields.deadline.addEventListener(ev, syncDeadlineWarn);
  });

  const picker = mountRestaurantPicker(
    {
      filterMount: mount.querySelector('#nf-restaurant-filter'),
      listEl: mount.querySelector('#nf-restaurant-list'),
      countEl: mount.querySelector('#nf-restaurant-count')
    },
    restaurants,
    { initiallySelected: [], removedDisplay: [] }
  );

  const submitBtn = mount.querySelector('#nf-submit');
  let submitting = false;
  submitBtn.addEventListener('click', async () => {
    if (submitting) return;

    const title = fields.title.value.trim();
    const mealType = fields.mealType.value;
    const eventDate = fields.eventDate.value;
    const eventTime = fields.eventTime.value;
    const deadlineRaw = fields.deadline.value;
    const description = fields.description.value.trim();
    const selectedIds = picker.getSelectedIds();

    let firstErrorEl = null;
    function markError(key) {
      fields[key].classList.add('has-error');
      if (errors[key]) errors[key].hidden = false;
      if (!firstErrorEl) firstErrorEl = fields[key];
    }
    if (!title) markError('title');
    if (!eventDate) markError('eventDate');
    if (!eventTime) markError('eventTime');
    if (!deadlineRaw) markError('deadline');
    if (selectedIds.length < 2) {
      errors.restaurants.hidden = false;
      if (!firstErrorEl) firstErrorEl = mount.querySelector('#nf-restaurant-list');
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
    if (isDeadlineAfterEvent(deadlineRaw, eventDate, eventTime)) {
      syncDeadlineWarn();
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
        restaurantIds: selectedIds
      });
      if (!result || !result.pollId) {
        showToast('서버 응답에 투표 ID가 없습니다. polls 테이블을 확인해주세요.', { error: true });
        submitBtn.disabled = false;
        submitBtn.textContent = '투표 만들기';
        submitting = false;
        return;
      }
      showToast('투표가 만들어졌어요');
      // 진행중 탭으로 전환 + 새 폴 상세 자동 오픈
      const adminRoot = mount.closest('#admin-root');
      renderShell(adminRoot, { initialTab: 'active', autoOpenPollId: result.pollId });
    } catch (err) {
      if (err.code === 'unauthorized') {
        clearStoredKey();
        showToast('관리자 키가 만료되었거나 변경되었습니다. 다시 로그인해주세요', { error: true });
        const adminRoot = mount.closest('#admin-root');
        renderLogin(adminRoot);
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
// 식당 관리 탭
// ─────────────────────────────────────────────────────────
async function renderRestaurantsTab(mount, shellRoot, { editingId = null } = {}) {
  mount.innerHTML = `<div class="state"><p>식당 목록을 불러오는 중...</p></div>`;

  let restaurants = [];
  let options = { categories: CATEGORIES, areas: AREAS };
  try {
    const [rs, opts] = await Promise.all([
      loadRestaurants({ includeInactive: true }),
      loadOptions().catch(() => ({ categories: CATEGORIES, areas: AREAS }))
    ]);
    restaurants = rs;
    if (opts.categories.length || opts.areas.length) options = opts;
  } catch (err) {
    mount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const editing = editingId ? restaurants.find((r) => r.id === editingId) : null;

  mount.innerHTML = `
    <section class="stack-4">
      <div class="row-3" style="justify-content: space-between;">
        <div>
          <h2>식당 관리</h2>
          <p class="text-soft fs-small">행을 클릭해서 수정. 새 식당은 아래 폼으로 추가.</p>
        </div>
        <span class="fs-small text-soft">총 ${restaurants.length}개 (활성 ${restaurants.filter((r) => r.active).length})</span>
      </div>

      <div id="rest-list" class="rest-list">
        ${restaurants.map((r) => restaurantRowHtml(r, r.id === editingId)).join('') || `<div class="state"><p>등록된 식당이 없습니다.</p></div>`}
      </div>

      <section class="card stack-4">
        <div class="stack-3">
          <h3>${editing ? `식당 수정 — ${escapeHtml(editing.name)}` : '새 식당 추가'}</h3>
          ${editing ? '' : `<p class="text-soft fs-small">ID는 자동 부여됩니다. 이름은 필수.</p>`}
        </div>
        ${restaurantFormHtml(editing, { ...options, nextId: nextRestaurantId(restaurants), showGroupDining: true })}
        <div class="row-2" style="justify-content: space-between; flex-wrap: wrap;">
          <div class="row-2">
            ${editing ? `
              <button type="button" class="btn btn-ghost" id="rf-cancel">취소</button>
              <button type="button" class="btn btn-outline" id="rf-toggle-active">${editing.active ? '비활성화' : '활성화'}</button>
              <button type="button" class="btn btn-ghost rf-danger" id="rf-delete">완전 삭제</button>
            ` : ''}
          </div>
          <button type="button" class="btn btn-primary" id="rf-save">${editing ? '수정 저장' : '식당 추가'}</button>
        </div>
      </section>
    </section>
  `;

  // 행 클릭 → 수정 모드
  mount.querySelector('#rest-list')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-restaurant-id]');
    if (!row) return;
    const rid = row.dataset.restaurantId;
    renderRestaurantsTab(mount, shellRoot, { editingId: editingId === rid ? null : rid });
  });

  if (editing) {
    mount.querySelector('#rf-cancel').addEventListener('click', () => {
      renderRestaurantsTab(mount, shellRoot);
    });
    mount.querySelector('#rf-toggle-active').addEventListener('click', async () => {
      try {
        await setRestaurantActive({ adminKey: getStoredKey(), id: editing.id, active: !editing.active });
        showToast(editing.active ? '비활성화되었습니다' : '활성화되었습니다');
        renderRestaurantsTab(mount, shellRoot, { editingId: editing.id });
      } catch (err) {
        handleAdminError(err, mount, shellRoot);
      }
    });
    mount.querySelector('#rf-delete').addEventListener('click', async () => {
      if (!confirm(`정말 "${editing.name}"을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.\n(폴 후보에 남아있을 수 있어 비활성화를 권장)`)) return;
      try {
        await deleteRestaurant({ adminKey: getStoredKey(), id: editing.id });
        showToast('삭제되었습니다');
        renderRestaurantsTab(mount, shellRoot);
      } catch (err) {
        handleAdminError(err, mount, shellRoot);
      }
    });
  }

  // 카테고리 select / direct input 토글
  const categorySelect = mount.querySelector('#rf-category-select');
  const categoryInput = mount.querySelector('#rf-category-input');
  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === '__custom__') {
      categoryInput.hidden = false;
      categoryInput.focus();
    } else {
      categoryInput.hidden = true;
      categoryInput.value = '';
    }
  });

  // 지역 select / direct input 토글
  const areaSelect = mount.querySelector('#rf-area-select');
  const areaInput = mount.querySelector('#rf-area-input');
  areaSelect.addEventListener('change', () => {
    if (areaSelect.value === '__custom__') {
      areaInput.hidden = false;
      areaInput.focus();
    } else {
      areaInput.hidden = true;
      areaInput.value = '';
    }
  });

  // 메뉴 표 — 행 추가 / 삭제
  mount.querySelector('#rf-menu-add')?.addEventListener('click', () => {
    mount.querySelector('#rf-menu-rows').insertAdjacentHTML('beforeend', menuRowHtml({}));
  });
  mount.querySelector('#rf-menu-rows')?.addEventListener('click', (e) => {
    const del = e.target.closest('.me-del');
    if (del) del.closest('.menu-edit-row').remove();
  });

  // 썸네일 URL → 미리보기 라이브 갱신
  const imageUrlInput = mount.querySelector('#rf-image-url');
  const imagePreview = mount.querySelector('#rf-image-preview');
  imageUrlInput?.addEventListener('input', () => {
    const url = imageUrlInput.value.trim();
    if (url) {
      imagePreview.src = url;
      imagePreview.hidden = false;
    } else {
      imagePreview.hidden = true;
    }
  });

  mount.querySelector('#rf-save').addEventListener('click', async () => {
    const id = (mount.querySelector('#rf-id').value || '').trim();
    const name = (mount.querySelector('#rf-name').value || '').trim();
    const category =
      categorySelect.value === '__custom__'
        ? (categoryInput.value || '').trim()
        : categorySelect.value;
    const area =
      areaSelect.value === '__custom__'
        ? (areaInput.value || '').trim()
        : areaSelect.value;
    const address = (mount.querySelector('#rf-address').value || '').trim();
    const naverUrl = (mount.querySelector('#rf-naver-url').value || '').trim();
    const imageUrl = (mount.querySelector('#rf-image-url').value || '').trim();
    const walkingRaw = (mount.querySelector('#rf-walking').value || '').trim();
    const walkingMinutes = walkingRaw === '' ? null : Number(walkingRaw);
    const menuRows = [...mount.querySelectorAll('#rf-menu-rows .menu-edit-row')].map((row) => {
      const priceRaw = (row.querySelector('.me-price').value || '').trim();
      return {
        name: row.querySelector('.me-name').value,
        price: priceRaw === '' ? null : Number(priceRaw),
        representative: row.querySelector('.me-rep').checked
      };
    });
    const menusText = serializeMenus(menuRows);
    const note = (mount.querySelector('#rf-note').value || '').trim();
    const businessHours = (mount.querySelector('#rf-business-hours').value || '').trim();

    if (!id || !name) {
      showToast('이름은 필수입니다', { error: true });
      return;
    }
    if (naverUrl && !/^https?:\/\//i.test(naverUrl)) {
      showToast('네이버 링크는 http(s)://로 시작해야 합니다', { error: true });
      return;
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      showToast('썸네일 이미지 URL은 http(s)://로 시작해야 합니다', { error: true });
      return;
    }
    if (walkingMinutes !== null && (isNaN(walkingMinutes) || walkingMinutes < 0)) {
      showToast('도보 시간은 0 이상의 숫자여야 합니다', { error: true });
      return;
    }

    const isGroupDining = mount.querySelector('#rf-group-dining')?.checked || false;

    try {
      if (editing) {
        await updateRestaurant({
          adminKey: getStoredKey(),
          id: editing.id,
          patch: { name, category, area, address, naverUrl, imageUrl, walkingMinutes, menusText, note, businessHours, isGroupDining }
        });
        showToast('수정되었습니다');
        renderRestaurantsTab(mount, shellRoot, { editingId: editing.id });
      } else {
        await createRestaurant({
          adminKey: getStoredKey(),
          id, name, category, area, address, naverUrl, imageUrl, walkingMinutes, menusText, note, businessHours, isGroupDining
        });
        showToast('식당이 추가되었습니다');
        renderRestaurantsTab(mount, shellRoot, { editingId: id });
      }
    } catch (err) {
      handleAdminError(err, mount, shellRoot);
    }
  });
}

// ─────────────────────────────────────────────────────────
// 카페 관리 탭 — 식당 관리 탭 미러 (폼·행·메뉴 헬퍼 재사용, capacity 없음)
// ─────────────────────────────────────────────────────────
async function renderCafesTab(mount, shellRoot, { editingId = null } = {}) {
  mount.innerHTML = `<div class="state"><p>카페 목록을 불러오는 중...</p></div>`;

  let cafes = [];
  let options = { cafeCategories: CAFE_CATEGORIES, areas: AREAS };
  try {
    const [cs, opts] = await Promise.all([
      loadCafes({ includeInactive: true }),
      loadOptions().catch(() => ({ cafeCategories: CAFE_CATEGORIES, areas: AREAS }))
    ]);
    cafes = cs;
    if ((opts.cafeCategories && opts.cafeCategories.length) || (opts.areas && opts.areas.length)) options = opts;
  } catch (err) {
    mount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const formOpts = {
    categories: options.cafeCategories && options.cafeCategories.length ? options.cafeCategories : CAFE_CATEGORIES,
    areas: options.areas && options.areas.length ? options.areas : AREAS
  };
  const editing = editingId ? cafes.find((c) => c.id === editingId) : null;

  mount.innerHTML = `
    <section class="stack-4">
      <div class="row-3" style="justify-content: space-between;">
        <div>
          <h2>카페 관리</h2>
          <p class="text-soft fs-small">행을 클릭해서 수정. 새 카페는 아래 폼으로 추가.</p>
        </div>
        <span class="fs-small text-soft">총 ${cafes.length}개 (활성 ${cafes.filter((c) => c.active).length})</span>
      </div>

      <div id="rest-list" class="rest-list">
        ${cafes.map((c) => restaurantRowHtml(c, c.id === editingId)).join('') || `<div class="state"><p>등록된 카페가 없습니다.</p></div>`}
      </div>

      <section class="card stack-4">
        <div class="stack-3">
          <h3>${editing ? `카페 수정 — ${escapeHtml(editing.name)}` : '새 카페 추가'}</h3>
          ${editing ? '' : `<p class="text-soft fs-small">ID는 자동 부여됩니다. 이름은 필수.</p>`}
        </div>
        ${restaurantFormHtml(editing, { ...formOpts, nextId: nextCafeId(cafes) })}
        <div class="row-2" style="justify-content: space-between; flex-wrap: wrap;">
          <div class="row-2">
            ${editing ? `
              <button type="button" class="btn btn-ghost" id="rf-cancel">취소</button>
              <button type="button" class="btn btn-outline" id="rf-toggle-active">${editing.active ? '비활성화' : '활성화'}</button>
              <button type="button" class="btn btn-ghost rf-danger" id="rf-delete">완전 삭제</button>
            ` : ''}
          </div>
          <button type="button" class="btn btn-primary" id="rf-save">${editing ? '수정 저장' : '카페 추가'}</button>
        </div>
      </section>
    </section>
  `;

  // 행 클릭 → 수정 모드
  mount.querySelector('#rest-list')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-restaurant-id]');
    if (!row) return;
    const cid = row.dataset.restaurantId;
    renderCafesTab(mount, shellRoot, { editingId: editingId === cid ? null : cid });
  });

  if (editing) {
    mount.querySelector('#rf-cancel').addEventListener('click', () => {
      renderCafesTab(mount, shellRoot);
    });
    mount.querySelector('#rf-toggle-active').addEventListener('click', async () => {
      try {
        await setCafeActive({ adminKey: getStoredKey(), id: editing.id, active: !editing.active });
        showToast(editing.active ? '비활성화되었습니다' : '활성화되었습니다');
        renderCafesTab(mount, shellRoot, { editingId: editing.id });
      } catch (err) {
        handleAdminError(err, mount, shellRoot);
      }
    });
    mount.querySelector('#rf-delete').addEventListener('click', async () => {
      if (!confirm(`정말 "${editing.name}"을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.`)) return;
      try {
        await deleteCafe({ adminKey: getStoredKey(), id: editing.id });
        showToast('삭제되었습니다');
        renderCafesTab(mount, shellRoot);
      } catch (err) {
        handleAdminError(err, mount, shellRoot);
      }
    });
  }

  // 카테고리 select / direct input 토글
  const categorySelect = mount.querySelector('#rf-category-select');
  const categoryInput = mount.querySelector('#rf-category-input');
  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === '__custom__') {
      categoryInput.hidden = false;
      categoryInput.focus();
    } else {
      categoryInput.hidden = true;
      categoryInput.value = '';
    }
  });

  // 지역 select / direct input 토글
  const areaSelect = mount.querySelector('#rf-area-select');
  const areaInput = mount.querySelector('#rf-area-input');
  areaSelect.addEventListener('change', () => {
    if (areaSelect.value === '__custom__') {
      areaInput.hidden = false;
      areaInput.focus();
    } else {
      areaInput.hidden = true;
      areaInput.value = '';
    }
  });

  // 메뉴 표 — 행 추가 / 삭제
  mount.querySelector('#rf-menu-add')?.addEventListener('click', () => {
    mount.querySelector('#rf-menu-rows').insertAdjacentHTML('beforeend', menuRowHtml({}));
  });
  mount.querySelector('#rf-menu-rows')?.addEventListener('click', (e) => {
    const del = e.target.closest('.me-del');
    if (del) del.closest('.menu-edit-row').remove();
  });

  // 썸네일 URL → 미리보기 라이브 갱신
  const imageUrlInput = mount.querySelector('#rf-image-url');
  const imagePreview = mount.querySelector('#rf-image-preview');
  imageUrlInput?.addEventListener('input', () => {
    const url = imageUrlInput.value.trim();
    if (url) {
      imagePreview.src = url;
      imagePreview.hidden = false;
    } else {
      imagePreview.hidden = true;
    }
  });

  mount.querySelector('#rf-save').addEventListener('click', async () => {
    const id = (mount.querySelector('#rf-id').value || '').trim();
    const name = (mount.querySelector('#rf-name').value || '').trim();
    const category =
      categorySelect.value === '__custom__'
        ? (categoryInput.value || '').trim()
        : categorySelect.value;
    const area =
      areaSelect.value === '__custom__'
        ? (areaInput.value || '').trim()
        : areaSelect.value;
    const address = (mount.querySelector('#rf-address').value || '').trim();
    const naverUrl = (mount.querySelector('#rf-naver-url').value || '').trim();
    const imageUrl = (mount.querySelector('#rf-image-url').value || '').trim();
    const walkingRaw = (mount.querySelector('#rf-walking').value || '').trim();
    const walkingMinutes = walkingRaw === '' ? null : Number(walkingRaw);
    const menuRows = [...mount.querySelectorAll('#rf-menu-rows .menu-edit-row')].map((row) => {
      const priceRaw = (row.querySelector('.me-price').value || '').trim();
      return {
        name: row.querySelector('.me-name').value,
        price: priceRaw === '' ? null : Number(priceRaw),
        representative: row.querySelector('.me-rep').checked
      };
    });
    const menusText = serializeMenus(menuRows);
    const note = (mount.querySelector('#rf-note').value || '').trim();
    const businessHours = (mount.querySelector('#rf-business-hours').value || '').trim();

    if (!id || !name) {
      showToast('이름은 필수입니다', { error: true });
      return;
    }
    if (naverUrl && !/^https?:\/\//i.test(naverUrl)) {
      showToast('네이버 링크는 http(s)://로 시작해야 합니다', { error: true });
      return;
    }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      showToast('썸네일 이미지 URL은 http(s)://로 시작해야 합니다', { error: true });
      return;
    }
    if (walkingMinutes !== null && (isNaN(walkingMinutes) || walkingMinutes < 0)) {
      showToast('도보 시간은 0 이상의 숫자여야 합니다', { error: true });
      return;
    }

    try {
      if (editing) {
        await updateCafe({
          adminKey: getStoredKey(),
          id: editing.id,
          patch: { name, category, area, address, naverUrl, imageUrl, walkingMinutes, menusText, note, businessHours }
        });
        showToast('수정되었습니다');
        renderCafesTab(mount, shellRoot, { editingId: editing.id });
      } else {
        await createCafe({
          adminKey: getStoredKey(),
          id, name, category, area, address, naverUrl, imageUrl, walkingMinutes, menusText, note, businessHours
        });
        showToast('카페가 추가되었습니다');
        renderCafesTab(mount, shellRoot, { editingId: id });
      }
    } catch (err) {
      handleAdminError(err, mount, shellRoot);
    }
  });
}

// ─────────────────────────────────────────────────────────
// 분류 관리 (카테고리·지역·카페 카테고리 옵션 CRUD)
// ─────────────────────────────────────────────────────────
async function renderOptionsTab(mount, shellRoot) {
  mount.innerHTML = `<div class="state"><p>분류 목록을 불러오는 중...</p></div>`;

  let options;
  try {
    options = await loadOptions();
  } catch (err) {
    mount.innerHTML = `<div class="state state-error"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  mount.innerHTML = `
    <section class="stack-4">
      <div>
        <h2>분류 관리</h2>
        <p class="text-soft fs-small">카테고리·지역·카페 카테고리 항목을 추가·이름변경·삭제합니다. <strong>이름변경</strong> 시 그 값을 쓰던 기존 식당·카페도 함께 바뀝니다. <strong>삭제</strong>는 목록에서만 빠지고 기존 값은 유지됩니다.</p>
      </div>
      <div class="opt-cols">
        ${optionPanelHtml('category', '카테고리', options.categories)}
        ${optionPanelHtml('area', '지역', options.areas)}
        ${optionPanelHtml('cafe_category', '카페 카테고리', options.cafeCategories || [])}
      </div>
    </section>
  `;

  const reload = () => renderOptionsTab(mount, shellRoot);

  mount.querySelectorAll('.opt-add-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.kind;
      const input = mount.querySelector(`.opt-add-input[data-kind="${kind}"]`);
      const value = (input.value || '').trim();
      if (!value) {
        showToast('항목 이름을 입력해주세요', { error: true });
        return;
      }
      try {
        await createOption({ adminKey: getStoredKey(), kind, value });
        showToast('추가되었습니다');
        reload();
      } catch (err) {
        handleAdminError(err, mount, shellRoot);
      }
    });
  });

  mount.querySelectorAll('.opt-add-input').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      mount.querySelector(`.opt-add-btn[data-kind="${inp.dataset.kind}"]`).click();
    });
  });

  mount.querySelectorAll('.opt-list').forEach((list) => {
    list.addEventListener('click', async (e) => {
      const row = e.target.closest('.opt-row');
      if (!row) return;
      const kind = row.dataset.kind;
      const value = row.dataset.value;

      if (e.target.closest('.opt-rename')) {
        row.classList.add('is-editing');
        const edit = row.querySelector('.opt-edit');
        edit.focus();
        edit.select();
      } else if (e.target.closest('.opt-cancel')) {
        row.classList.remove('is-editing');
        row.querySelector('.opt-edit').value = value;
      } else if (e.target.closest('.opt-save')) {
        const next = (row.querySelector('.opt-edit').value || '').trim();
        if (!next) {
          showToast('이름을 입력해주세요', { error: true });
          return;
        }
        if (next === value) {
          row.classList.remove('is-editing');
          return;
        }
        try {
          await updateOption({ adminKey: getStoredKey(), kind, oldValue: value, newValue: next });
          showToast('변경되었습니다');
          reload();
        } catch (err) {
          handleAdminError(err, mount, shellRoot);
        }
      } else if (e.target.closest('.opt-delete')) {
        try {
          await deleteOption({ adminKey: getStoredKey(), kind, value });
          showToast('삭제되었습니다');
          reload();
        } catch (err) {
          handleAdminError(err, mount, shellRoot);
        }
      }
    });

    list.addEventListener('keydown', (e) => {
      const inp = e.target.closest('.opt-edit');
      if (!inp) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        inp.closest('.opt-row').querySelector('.opt-save').click();
      } else if (e.key === 'Escape') {
        inp.closest('.opt-row').querySelector('.opt-cancel').click();
      }
    });
  });
}

function optionPanelHtml(kind, title, values) {
  const rows =
    values.map((v) => optionRowHtml(kind, v)).join('') ||
    `<p class="text-soft fs-small">항목이 없습니다.</p>`;
  return `
    <section class="card stack-3">
      <h3>${escapeHtml(title)} <span class="text-soft fs-small">(${values.length})</span></h3>
      <div class="opt-list">${rows}</div>
      <div class="row-2" style="gap: var(--space-2);">
        <input type="text" class="input opt-add-input" data-kind="${kind}" placeholder="새 ${escapeHtml(title)} 추가" autocomplete="off" />
        <button type="button" class="btn btn-outline opt-add-btn" data-kind="${kind}">추가</button>
      </div>
    </section>
  `;
}

function optionRowHtml(kind, value) {
  const v = escapeHtml(value);
  return `
    <div class="opt-row" data-kind="${kind}" data-value="${v}">
      <span class="opt-val">${v}</span>
      <input type="text" class="input opt-edit" value="${v}" autocomplete="off" />
      <div class="opt-actions">
        <button type="button" class="btn btn-ghost fs-small opt-rename">이름변경</button>
        <button type="button" class="btn btn-ghost fs-small opt-save">저장</button>
        <button type="button" class="btn btn-ghost fs-small opt-cancel">취소</button>
        <button type="button" class="btn btn-ghost fs-small rf-danger opt-delete">삭제</button>
      </div>
    </div>
  `;
}

function restaurantRowHtml(r, isEditing) {
  return `
    <div class="rest-row ${isEditing ? 'is-editing' : ''} ${r.active ? '' : 'is-inactive'}" data-restaurant-id="${escapeHtml(r.id)}">
      ${r.imageUrl ? `<img class="rest-thumb" src="${escapeHtml(r.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
      <span class="rest-id">${escapeHtml(r.id)}</span>
      ${r.category ? `<span class="rc-badge rc-badge--${categorySlug(r.category)}">${escapeHtml(r.category)}</span>` : ''}
      ${r.area ? `<span class="rc-badge rc-badge--area">${escapeHtml(r.area)}</span>` : ''}
      ${r.isGroupDining ? verifiedSealHtml({ size: '1.6rem' }) : ''}
      <span class="rest-name">${escapeHtml(r.name)}</span>
      ${r.naverUrl ? `<a class="rest-naver" href="${escapeHtml(r.naverUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 네이버</a>` : ''}
      <span class="rest-flag ${r.active ? 'is-active' : 'is-inactive'}">${r.active ? '활성' : '비활성'}</span>
    </div>
  `;
}

function nextRestaurantId(restaurants) {
  let max = 0;
  for (const r of restaurants) {
    const m = /^R(\d+)$/i.exec(r.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `R${String(max + 1).padStart(3, '0')}`;
}

function nextCafeId(cafes) {
  let max = 0;
  for (const c of cafes) {
    const m = /^C(\d+)$/i.exec(c.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `C${String(max + 1).padStart(3, '0')}`;
}

function restaurantFormHtml(r, opts = {}) {
  const v = r || {};
  const categories = opts.categories || CATEGORIES;
  const areas = opts.areas || AREAS;
  const selectedCategory = v.category || '';
  const isCustomCategory = selectedCategory && !categories.includes(selectedCategory);
  const selectedArea = v.area || '';
  const isCustomArea = selectedArea && !areas.includes(selectedArea);
  return `
    <form id="rest-form" class="stack-4" novalidate>
      <section class="rf-section stack-3">
        <h4 class="rf-section-title">기본 정보</h4>
        <div class="row-2" style="flex-wrap: wrap; gap: var(--space-3);">
          <div class="stack-3" style="flex: 1; min-width: 12rem;">
            <label class="field-label" for="rf-id">ID ${r ? '(수정 불가)' : '(자동 부여)'}</label>
            <input type="text" id="rf-id" class="input${r ? '' : ' input--plain'}" value="${escapeHtml(r ? (v.id || '') : (opts.nextId || ''))}" ${r ? 'disabled' : 'readonly'} placeholder="예: R006" />
            ${r ? '' : `<p class="text-soft fs-small">기존 ID 중 가장 큰 번호 +1 로 자동 부여됩니다.</p>`}
          </div>
          <div class="stack-3" style="flex: 2; min-width: 16rem;">
            <label class="field-label" for="rf-name">이름 *</label>
            <input type="text" id="rf-name" class="input" value="${escapeHtml(v.name || '')}" placeholder="예: 멘야하나비" />
          </div>
        </div>
        <div class="row-2" style="flex-wrap: wrap; gap: var(--space-3);">
          <div class="stack-3" style="flex: 1; min-width: 14rem;">
            <label class="field-label" for="rf-category-select">카테고리</label>
            <select id="rf-category-select" class="input">
              <option value="">(없음)</option>
              ${categories.map((c) => `<option value="${escapeHtml(c)}" ${c === selectedCategory ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
              <option value="__custom__" ${isCustomCategory ? 'selected' : ''}>+ 직접 입력</option>
            </select>
            <input type="text" id="rf-category-input" class="input" ${isCustomCategory ? '' : 'hidden'} value="${isCustomCategory ? escapeHtml(selectedCategory) : ''}" placeholder="예: 퓨전" />
          </div>
          <div class="stack-3" style="flex: 1; min-width: 14rem;">
            <label class="field-label" for="rf-area-select">지역</label>
            <select id="rf-area-select" class="input">
              <option value="">(없음)</option>
              ${areas.map((a) => `<option value="${escapeHtml(a)}" ${a === selectedArea ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
              <option value="__custom__" ${isCustomArea ? 'selected' : ''}>+ 직접 입력</option>
            </select>
            <input type="text" id="rf-area-input" class="input" ${isCustomArea ? '' : 'hidden'} value="${isCustomArea ? escapeHtml(selectedArea) : ''}" placeholder="예: 인천대입구" />
          </div>
          <div class="stack-3" style="flex: 1; min-width: 12rem;">
            <label class="field-label" for="rf-walking">도보 (분)</label>
            <input type="number" id="rf-walking" class="input" min="0" value="${v.walkingMinutes != null ? v.walkingMinutes : ''}" placeholder="예: 5" />
          </div>
        </div>
        ${opts.showGroupDining ? `
        <div class="stack-3">
          <label class="rf-checkbox" for="rf-group-dining">
            <input type="checkbox" id="rf-group-dining" ${v.isGroupDining ? 'checked' : ''} />
            <span>단체 회식 가능 (10인 이상)</span>
          </label>
          <p class="text-soft fs-small">체크하면 식당 카드·목록에 인증 배지가 표시되고, 회식 투표 생성 시 필터로 추려낼 수 있습니다.</p>
        </div>
        ` : ''}
      </section>

      <section class="rf-section stack-3">
        <h4 class="rf-section-title">위치 · 이미지</h4>
        <div class="stack-3">
          <label class="field-label" for="rf-business-hours">영업시간</label>
          <input type="text" id="rf-business-hours" class="input" value="${escapeHtml(v.businessHours || '')}" placeholder="예: 매일 11:00–21:00 (브레이크 15:00–17:00)" />
        </div>
        <div class="stack-3">
          <label class="field-label" for="rf-address">주소</label>
          <input type="text" id="rf-address" class="input" value="${escapeHtml(v.address || '')}" placeholder="예: 강남구 테헤란로 123" />
        </div>
        <div class="stack-3">
          <label class="field-label" for="rf-naver-url">네이버 지도 링크</label>
          <input type="url" id="rf-naver-url" class="input" value="${escapeHtml(v.naverUrl || '')}" placeholder="예: https://naver.me/xxxxxxxx" />
        </div>
        <div class="stack-3">
          <label class="field-label" for="rf-image-url">썸네일 이미지 URL</label>
          <input type="url" id="rf-image-url" class="input" value="${escapeHtml(v.imageUrl || '')}" placeholder="예: https://images.example.com/photo.jpg" />
          <p class="text-soft fs-small">외부 이미지 링크를 붙여넣으면 식당 카드·목록에 썸네일로 표시됩니다.</p>
          <img id="rf-image-preview" class="rf-image-preview" alt="썸네일 미리보기" src="${escapeHtml(v.imageUrl || '')}" ${v.imageUrl ? '' : 'hidden'} referrerpolicy="no-referrer" onerror="this.hidden = true" />
        </div>
      </section>

      <section class="rf-section stack-3">
        <h4 class="rf-section-title">상세</h4>
        <div class="stack-3">
          <label class="field-label">메뉴</label>
          <p class="text-soft fs-small">이름·가격을 각 칸에 입력. 대표 메뉴는 ⭐ 체크 (여러 개 가능).</p>
          <div class="menu-edit-head">
            <span>대표</span><span>이름</span><span>가격(원)</span><span></span>
          </div>
          <div id="rf-menu-rows" class="stack-2">
            ${(v.menus && v.menus.length ? v.menus : [{}]).map((m) => menuRowHtml(m)).join('')}
          </div>
          <button type="button" class="btn btn-outline" id="rf-menu-add" style="align-self: flex-start;">+ 메뉴 행 추가</button>
        </div>
        <div class="stack-3">
          <label class="field-label" for="rf-note">메모</label>
          <textarea id="rf-note" class="input" rows="2" maxlength="200" style="height: auto; padding: 1rem 1.4rem; resize: vertical;" placeholder="예: 주차 가능, 예약 필수">${escapeHtml(v.note || '')}</textarea>
        </div>
      </section>
    </form>
  `;
}

function menuRowHtml(m) {
  const v = m || {};
  return `
    <div class="menu-edit-row">
      <label class="menu-edit-rep">
        <input type="checkbox" class="me-rep" ${v.representative ? 'checked' : ''} aria-label="대표 메뉴" />
      </label>
      <input type="text" class="input me-name" value="${escapeHtml(v.name || '')}" placeholder="메뉴 이름" />
      <input type="text" inputmode="numeric" class="input me-price" value="${v.price != null ? v.price : ''}" placeholder="가격" />
      <button type="button" class="btn btn-ghost rf-danger me-del" aria-label="행 삭제">✕</button>
    </div>
  `;
}

function handleAdminError(err, mount, shellRoot) {
  if (err.code === 'unauthorized') {
    clearStoredKey();
    showToast('관리자 키가 만료되었거나 변경되었습니다. 다시 로그인해주세요', { error: true });
    const adminRoot = mount.closest('#admin-root') || shellRoot;
    renderLogin(adminRoot);
    return;
  }
  showToast(err.message || '오류가 발생했습니다', { error: true });
}

