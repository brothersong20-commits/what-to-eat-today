import { formatPrice, compareMenu } from '../lib/menus.js';
import { escapeHtml } from '../lib/escape.js';
import { verifiedSealHtml } from './verified-seal.js';
import { heartSvg } from './heart-icon.js';
import { categoryBadgeHtml, areaBadgeHtml } from './category-badge.js';

/**
 * 식당 카드 HTML.
 * mode:
 *   'view'   — 홈/탐색용 (메뉴 펼치기 토글)
 *   'choice' — 투표용 (1·2순위 라디오)
 * like: { type: 'restaurant'|'cafe', count: number, liked: boolean, readonly?: boolean }
 *   주면 카드 우상단에 좋아요 하트를 렌더. 없으면 미렌더.
 *   readonly=true 면 클릭 불가한 표시 전용(투표 창 — 결과만 보기).
 */
export function restaurantCardHtml(r, { mode = 'view', pollId, choice1Id, choice2Id, like } = {}) {
  const menus = (r.menus || [])
    .slice()
    .sort(compareMenu)
    .map(
      (m) =>
        `<li class="menu-row ${m.representative ? 'is-rep' : ''}">
          <span class="menu-name">${m.representative ? '⭐ ' : ''}${escapeHtml(m.name)}</span>
          ${m.price ? `<span class="menu-price">${escapeHtml(formatPrice(m.price))}</span>` : ''}
        </li>`
    )
    .join('');

  const meta = [
    categoryBadgeHtml(r.category),
    areaBadgeHtml(r.area),
    r.walkingMinutes != null && `<span class="rc-meta">🚶 도보 ${r.walkingMinutes}분</span>`
  ]
    .filter(Boolean)
    .join('');

  const thumb = r.imageUrl
    ? `<img class="rc-thumb" src="${escapeHtml(r.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`
    : '';

  const noteRow = r.note
    ? `<p class="rc-note">📝 ${escapeHtml(r.note)}</p>`
    : '';

  const hoursRow = r.businessHours
    ? `<p class="rc-hours">🕒 ${escapeHtml(r.businessHours)}</p>`
    : '';

  const mapLink = r.naverUrl
    ? `<a href="${escapeHtml(r.naverUrl)}" target="_blank" rel="noopener" class="rc-map-link" aria-label="네이버 지도에서 보기">↗</a>`
    : '';

  const addressRow =
    r.address || r.naverUrl
      ? `<p class="rc-address">📍 <span class="rc-address-text">${escapeHtml(r.address)}</span>${mapLink}</p>`
      : '';

  const likeCount = Number(like && like.count) || 0;
  const likeBtn = !like
    ? ''
    : like.readonly
      ? `<span class="rc-like rc-like--readonly ${like.liked ? 'is-liked' : ''}" role="img" aria-label="좋아요 ${likeCount}개">${heartSvg()}<span class="rc-like-count">${likeCount}</span></span>`
      : `<button type="button" class="rc-like ${like.liked ? 'is-liked' : ''}" data-like-type="${escapeHtml(like.type)}" data-like-id="${escapeHtml(r.id)}" aria-pressed="${like.liked ? 'true' : 'false'}" aria-label="좋아요">${heartSvg()}<span class="rc-like-count">${likeCount}</span></button>`;

  const menuBoardChip =
    mode === 'view' && r.menuImageUrls && r.menuImageUrls.length
      ? `<button type="button" class="rc-menuboard-chip" data-menuboard-id="${escapeHtml(r.id)}" aria-label="메뉴판 사진 ${r.menuImageUrls.length}장 보기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor"/><path d="M5 17l4.5-4.5 3 3L16 12l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          메뉴판 ${r.menuImageUrls.length}
        </button>`
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
      ${likeBtn}
      ${thumb}
      <header class="rc-header">
        <h3 class="rc-name">${escapeHtml(r.name)}${r.isGroupDining ? verifiedSealHtml() : ''}</h3>
        <div class="rc-meta-row">${meta}</div>
      </header>

      ${addressRow}
      ${noteRow}
      ${hoursRow}

      ${
        menus || menuBoardChip
          ? `<div class="rc-actions">
              ${
                menus
                  ? `<details class="rc-menus">
                      <summary>메뉴 ${r.menus.length}개 보기</summary>
                      <ul class="menu-list">${menus}</ul>
                    </details>`
                  : ''
              }
              ${menuBoardChip}
            </div>`
          : ''
      }

      ${choiceRow}
    </article>
  `;
}
