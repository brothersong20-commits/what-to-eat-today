import { formatPrice } from '../lib/menus.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 식당 카드 HTML.
 * mode:
 *   'view'   — 홈/탐색용 (메뉴 펼치기 토글)
 *   'choice' — 투표용 (1·2순위 라디오)
 */
export function restaurantCardHtml(r, { mode = 'view', pollId, choice1Id, choice2Id } = {}) {
  const menus = (r.menus || [])
    .map(
      (m) =>
        `<li class="menu-row">
          <span class="menu-name">${escapeHtml(m.name)}</span>
          ${m.price ? `<span class="menu-price">${escapeHtml(formatPrice(m.price))}</span>` : ''}
        </li>`
    )
    .join('');

  const meta = [
    r.category && `<span class="rc-badge">${escapeHtml(r.category)}</span>`,
    r.walkingMinutes != null && `<span class="rc-meta">🚶 도보 ${r.walkingMinutes}분</span>`,
    r.capacity && `<span class="rc-meta">🪑 ${escapeHtml(r.capacity)}</span>`
  ]
    .filter(Boolean)
    .join('');

  const noteRow = r.note
    ? `<p class="rc-note">📝 ${escapeHtml(r.note)}</p>`
    : '';

  const choiceRow =
    mode === 'choice'
      ? `<div class="rc-choices">
          <label class="rc-choice ${choice1Id === r.id ? 'is-picked-1' : ''}">
            <input type="radio" name="choice1" value="${escapeHtml(r.id)}" ${choice1Id === r.id ? 'checked' : ''} />
            <span>1순위</span>
          </label>
          <label class="rc-choice ${choice2Id === r.id ? 'is-picked-2' : ''}">
            <input type="radio" name="choice2" value="${escapeHtml(r.id)}" ${choice2Id === r.id ? 'checked' : ''} />
            <span>2순위</span>
          </label>
        </div>`
      : '';

  return `
    <article class="restaurant-card" data-id="${escapeHtml(r.id)}">
      <header class="rc-header">
        <h3 class="rc-name">${escapeHtml(r.name)}</h3>
        <div class="rc-meta-row">${meta}</div>
      </header>

      ${
        r.address
          ? `<p class="rc-address">📍 ${
              r.naverUrl
                ? `<a href="${escapeHtml(r.naverUrl)}" target="_blank" rel="noopener" class="rc-naver-link">${escapeHtml(r.address)} ↗</a>`
                : escapeHtml(r.address)
            }</p>`
          : r.naverUrl
            ? `<p class="rc-address"><a href="${escapeHtml(r.naverUrl)}" target="_blank" rel="noopener" class="rc-naver-link">📍 네이버 지도에서 보기 ↗</a></p>`
            : ''
      }
      ${noteRow}

      ${
        menus
          ? `<details class="rc-menus">
              <summary>메뉴 ${r.menus.length}개 보기</summary>
              <ul class="menu-list">${menus}</ul>
            </details>`
          : ''
      }

      ${choiceRow}
    </article>
  `;
}
