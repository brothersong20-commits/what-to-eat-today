# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # 의존성 설치
npm run dev      # Vite dev server — http://localhost:5173 (자동 오픈)
npm run build    # dist/ 로 프로덕션 빌드
npm run preview  # 빌드 결과 로컬 미리보기
```

테스트 러너와 린터는 설정돼 있지 않다. UI 변경은 dev 서버에서 직접 확인해야 한다.

## Architecture — Big Picture

두 레이어로 분리돼 있다.

1. **Static SPA (Vite + Vanilla JS, no framework)** — `src/main.js`가 해시 라우터(`src/lib/router.js`)에 네 라우트를 등록한다: `/`, `/vote/:id`, `/result/:id`, `/admin`. 각 페이지는 `src/pages/`의 `renderXxx(app, params)` 함수로 구현된다.

2. **Supabase (Postgres + RPC + Realtime)** — `src/lib/supabase.js`가 단일 진입점. 읽기는 `supabase.from(...)`, 쓰기는 RPC 호출(`submit_vote`, `create_poll`, `update_poll`, `create_restaurant`, `update_restaurant`, `delete_restaurant`, `set_restaurant_active`), 변경 구독은 `subscribeVotes`. 스키마와 함수 정의의 단일 진실 원천은 `supabase/schema.sql`이다.

데이터 흐름:

```
[홈]    home.js    → loadRestaurants + loadPolls           → restaurant-card / poll-list
[투표]  vote.js    → loadPoll + loadRestaurants
                  → submitVote (RPC: public.submit_vote)
[결과]  result.js  → loadPoll + loadRestaurants + loadVotes
                  → tally() → 가중치 랭킹
[관리자] admin.js  → loadPolls + loadRestaurants + loadVotes
                  → createPoll / updatePoll (RPC)
                  → createRestaurant / updateRestaurant / deleteRestaurant / setRestaurantActive (RPC)
                  → subscribeVotes (Realtime: postgres_changes on votes)
```

## 코드 재사용 원칙 (새 바퀴 금지)

새 코드를 쓰기 전에 **먼저 아래 공유 자산을 확인**한다. 같은 일을 하는 유틸이 이미
있으면 재사용하고, 없으면 인라인 복붙 대신 기존 컨벤션(단일 책임 작은 모듈 —
`verified-seal.js`/`heart-icon.js` 식 HTML 헬퍼, `escape.js`/`facets.js` 식 lib 유틸)을
따라 새 모듈을 만든다. 단, "세 줄 복붙 < 잘못된 추상화" — 목적이 다른 단일 사용
로직까지 억지로 합치지 말 것. 새 공유 모듈을 추가하면 아래 표도 갱신한다.

### src/lib (순수 로직)

| 모듈 | 공개 API | 용도 |
|---|---|---|
| `tally.js` | `tally(votes, restaurants)` | 1·2순위 가중치 랭킹 |
| `time.js` | `isPastDeadline` `clockParts` `withinDeadlineDay` `formatEventDateTime` `formatRemaining` `deadlineUrgency` `isDeadlineAfterEvent` | 마감/이벤트 시간 계산·표시 |
| `config.js` | `CATEGORIES` `CAFE_CATEGORIES` `AREAS` `CATEGORY_SLUGS` `categorySlug()` `ATTENDANCE` | 카테고리/지역/카페 카테고리 안내값·slug·참석 enum |
| `menus.js` | `parseMenusText` `serializeMenus` `compareMenu` `formatPrice` | 메뉴 텍스트 파싱·가격 포맷 |
| `shuffle.js` | `shuffle(arr)` | 무작위 정렬 |
| `escape.js` | `escapeHtml(s)` `safeUrl(url)` | innerHTML 직전 이스케이프 · href/src 스킴 화이트리스트(http/https만) |
| `facets.js` | `uniq(items, key)` | 필터용 고유값 추출 |
| `client-id.js` | `getClientId()` | 좋아요용 익명 브라우저 id |
| `voter.js` | `markVoted` `getVotedRecord` `hasVoted` | 투표 완료 브라우저 게이트 |
| `toast.js` | `showToast(msg, opts)` | 토스트 피드백 |
| `router.js` | `defineRoute` `start` `navigate` `currentPath` `onRouteLeave(fn)` | 해시 라우터 · 페이지 정리(cleanup) 등록 |
| `modal.js` | `openModal(opts)` | 오버레이 모달 수명주기·접근성 |
| `supabase.js` | `loadRestaurants/Cafes/Polls/Poll/Votes/Likes/Options` · `submitVote` `toggleLike` · `create/update/delete*` RPC(poll·restaurant·cafe·option) · `setRestaurant/CafeActive` · `uploadImage` · `subscribeVotes/Likes`/`unsubscribe` | 데이터 레이어 단일 진입점. `supabase` 클라이언트는 내부 전용(export 안 함) |

### src/components (HTML 헬퍼/위젯)

| 모듈 | 공개 API | 용도 |
|---|---|---|
| `restaurant-card.js` | `restaurantCardHtml(r, opts)` | 식당/카페 카드 |
| `category-badge.js` | `categoryBadgeHtml(cat)` `areaBadgeHtml(area)` | rc-badge pill |
| `verified-seal.js` | `verifiedSealHtml({size,title,decorative})` | 단체회식 인증 씰 |
| `heart-icon.js` | `heartSvg()` | 좋아요 하트 SVG |
| `flip-clock.js` | `flipClockHtml({parts,size,label})` `updateFlipClock()` | 플립 카운트다운 |
| `filter-bar.js` | `filterBarHtml()` `bindFilterBar()` `applyFilter()` | 카테고리/지역/검색 필터 |
| `share.js` | `buildShareUrl` `shareControlsHtml` `bindShareControls` `openQrModal` | 링크 복사·QR |
| `spin-wheel.js` | `spinWheelButtonHtml()` `bindSpinWheel()` | 식당 돌림판 |

## 비명확한 핵심 규칙

이 프로젝트에서 코드만 봐서는 즉시 보이지 않는 제약과 관습들. 변경 전 반드시 확인할 것.

- **쓰기는 항상 RPC 경유 (이미지 업로드만 예외)**: 클라이언트는 `anon` (publishable) 키만 가지고, polls/votes/restaurants에 대한 RLS 정책은 SELECT만 허용한다. INSERT/UPDATE/DELETE는 `security definer`로 선언된 RPC(`submit_vote`, `create_poll`, `update_poll`)를 통해서만 가능하다. 새 쓰기 작업이 필요하면 `supabase/schema.sql`에 RPC를 먼저 정의하고 클라이언트에서 호출한다. **유일한 예외는 Storage 이미지 업로드** — `storage.objects`는 DB 행이 아닌 public 자산이라 `images` 버킷·`restaurants`/`cafes` prefix 한정 + 2MB·이미지 MIME 제한의 anon insert 정책(schema.sql 섹션 9)으로 클라이언트가 직접 업로드한다(`uploadImage`). 업로드 결과 public URL을 기존 `image_url`/`menu_image_urls` 저장 경로에 넣으므로 RPC 무결성 검증은 유지된다. 썸네일·메뉴판은 URL 붙여넣기와 파일 업로드를 **병행**(하이브리드).

- **AI 초안 출처 컬럼 (`source`/`source_note`)**: `restaurants`/`cafes`의 `source`는 `'ai_draft'`(=`add-data` 스킬이 web search로 만든 미검토 초안) / `'manual'`(관리자 입력 또는 검토 완료) / `null`(레거시). CHECK 제약으로 값 강제. **관리자 폼 수동 생성은 `source`를 보내지 않아 `null`로 남고**(=초안 아님으로 취급), 배지/배너는 `source==='ai_draft' && !active`일 때만 뜬다. **초안 졸업은 활성화 시점**: `set_restaurant_active`/`set_cafe_active`가 활성화할 때 `ai_draft`→`manual`로 승격한다(별도 인자 없이 본문에서 처리, 시그니처 불변이라 grant 변경 불필요). `add-data` 스킬은 클라이언트가 아니라 운영자 MCP 작업이라 RPC가 아닌 직접 insert를 쓴다(`active=false`, `source='ai_draft'`).

- **관리자 인증 (이중 검증)**: `/#/admin` 진입 시 클라이언트의 `VITE_ADMIN_KEY`와 비교 후 `localStorage.wte_admin_key`에 저장한다. `create_poll`·`update_poll` RPC는 `p_admin_key` 인자를 받아 `private.app_config` 테이블의 `admin_key` 값과 비교한다. private 스키마는 anon/authenticated에 GRANT가 없어 클라이언트가 직접 SELECT 불가하고, 함수는 `security definer`로 우회해서 읽는다. **두 키는 동일 값으로 맞춰야 한다.** 변경 시 SQL Editor에서 `update private.app_config set value = '새 값' where key = 'admin_key';` 실행 + `.env.local`의 `VITE_ADMIN_KEY` 갱신.

- **투표는 (poll_id, voter_name) 기준 upsert**: `submit_vote` RPC가 `on conflict ... do update`로 같은 이름의 기존 행을 덮어쓴다. 응답 boolean으로 신규(`false`)/수정(`true`)을 구분한다.

- **마감·선택 검증은 서버에서도 한다**: 클라이언트가 `isPastDeadline()`로 한 번 가드하지만, `submit_vote` RPC가 `polls.deadline`과 `polls.status`를 다시 검증해 `poll_closed`/`deadline_passed` 예외를 raise. 추가로 참석 시 `choice_1/2`가 폴 후보(`restaurant_ids`)에 속하는지·서로 다른지(`invalid_choice`/`duplicate_choice`)와 `voter_name` 길이(`voter_name_too_long`)도 서버에서 검증한다. 클라이언트 시계·입력을 신뢰하지 말 것.

- **부분 업데이트 컨벤션**: `update_poll`은 null인 필드를 "변경 안 함"으로 해석한다. `description`을 빈 값으로 명시 클리어하려면 별도 boolean `p_clear_description=true`로 보낸다. 클라이언트 `updatePoll({patch})`이 이 변환을 담당.

- **취소된 식당 보존**: 관리자가 후보에서 식당을 제거하면 `polls.removed_restaurant_ids` 배열로 옮겨진다. 다시 추가하면 거기서 빠진다. tally 자체는 변경 없이, admin 상세 패널에서 활성/취소 두 셋을 각각 tally해 별도 섹션으로 표시한다. `result.js`(일반 사용자)는 활성 식당만 tally한다.

- **가중치 집계**: 1순위 = 2점, 2순위 = 1점. 동점이면 1순위 카운트 → 2순위 카운트 순으로 타이브레이크(`src/lib/tally.js`). 점수 0인 식당은 랭킹에서 제외된다.

- **한국어 enum 값이 wire 를 가로지른다**: `ATTENDANCE = { YES: '참석', NO: '불참석', HOLD: '보류' }`(`src/lib/config.js`). 같은 한국어 문자열이 Postgres `check` 제약, RPC 검증, 클라이언트 비교 로직에서 동일하게 사용된다. 한 곳만 영문으로 바꾸면 다른 곳에서 조용히 깨진다.

- **메뉴 텍스트 포맷**: `restaurants.menus_text`는 `"이름(가격)/이름(가격)"` 슬래시 구분 문자열이다. `src/lib/menus.js`의 `parseMenusText`가 파싱하며 가격 없는 항목(`price = null`)도 허용한다.

- **Realtime 구독·타이머 cleanup은 라우터가 일괄 회수**: `subscribeVotes`/`subscribeLikes` 채널과 `setInterval` 등은 페이지에서 `onRouteLeave(fn)`(`src/lib/router.js`)로 등록하면 다음 라우트로 dispatch될 때 자동 정리된다(같은 경로 재진입처럼 hashchange가 안 뜨는 경우까지 커버). 채널은 `unsubscribe(channel)`로 정리. admin.js는 모듈 스코프 레지스트리(`registerCleanup`/`runAllCleanups`)를 쓰되 진입 시 `onRouteLeave(runAllCleanups)`로 연결한다. **새 페이지에서 타이머/구독을 만들면 반드시 `onRouteLeave`로 정리 등록할 것.**

- **`VITE_` 환경변수는 클라이언트 번들에 노출된다**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`(=publishable/anon key), `VITE_ADMIN_KEY` 모두 공개된다. **`service_role` 키는 절대 클라이언트에 두지 말 것** — RLS 우회 가능하다. 관리자 키는 publishable이 아니라 별도 GUC 검증이라 안전성 확보.

- **디자인 토큰 파이프라인**: `DESIGN.md`(Starbucks 영감 명세) → `src/styles/tokens.css`(CSS 변수) → `src/styles/global.css`(토큰만 참조). 새 색/간격이 필요하면 먼저 `tokens.css`에 토큰을 추가하고 그 변수를 사용해야 한다. 루트가 `62.5%`라는 전제 위에서 `1rem = 10px`로 스페이싱 스케일이 설계돼 있다.

- **`CATEGORIES`는 안내용 하드코딩**: `src/lib/config.js`의 배열은 참고용이고, 실제 필터 칩은 DB의 카테고리 값에서 동적으로 추출된다(`home.js`, `vote.js`). 카테고리 추가 시 DB만 고쳐도 동작하지만 둘 다 맞춰두는 게 권장된다.

- **라우터는 해시 기반(`/#/vote/:id`)**: 정적 호스팅(Vercel)에서 SPA fallback 설정이 불필요하다. 새 라우트는 `src/main.js`에서 `defineRoute(...)` 한 줄을 추가한다.

## 스키마를 추가/변경할 때 동기화할 지점

세 곳을 함께 갱신해야 한다.

1. `supabase/schema.sql` — 테이블·RPC·RLS·publication 정의의 단일 진실 원천. Supabase SQL Editor에서 실행해야 DB에 반영된다.
2. `src/lib/supabase.js`의 `loadRestaurants` / `loadPolls` / `loadVotes` / `mapPoll` 등 매핑 함수, 그리고 `createPoll` / `updatePoll` / `submitVote`의 인자 변환.
3. 사용 측 페이지/컴포넌트.

## Supabase 운영

- **스키마 초기 설정**: `supabase/schema.sql` 전체를 Supabase 대시보드 SQL Editor에 붙여넣고 실행. 멱등하게 작성돼 있어 반복 실행 가능.
- **시드 데이터**: 빈 시작용 더미가 필요하면 `supabase/seed.sql` 실행.
- **ADMIN_KEY 변경**: `update private.app_config set value = '...' where key = 'admin_key';` 실행 + `.env.local`의 `VITE_ADMIN_KEY` 동기화.
- **Realtime 동작 확인**: `supabase_realtime` publication에 `public.votes`가 포함돼 있어야 한다. `schema.sql`이 자동 추가하지만, 새 테이블의 변경도 구독하려면 publication에 add 필요.

## Git 커밋 규칙

이 저장소의 커밋은 아래 규칙을 **반드시** 따른다. (기존 커밋 4개에서 확립된 컨벤션 — 이탈 금지)

- **언어**: 제목·본문 전부 한국어. 영문 커밋 메시지 금지.

- **커밋 시점**: 사용자가 명시적으로 커밋을 요청할 때만 커밋한다. 코드 변경 후 자동으로 커밋하지 않는다.

- **제목 줄 (subject)**:
  - 모든 릴리스(major·minor 무관)는 `Phase X.Y (vX.Y): 요약` 형식으로 통일한다. X=Phase 단위 major, Y=소수점 minor. `vN.M:`이나 `Phase N (vN.M):` 같은 변형은 쓰지 않는다.
    예) `Phase 1.0 (v1.0): 초기 릴리스 ...`, `Phase 1.1 (v1.1): 관리자 폴 생성 ...`, `Phase 2.0 (v2.0): Supabase 마이그레이션 ...`, `Phase 2.1 (v2.1): 식당 카테고리 색상 ...`
  - 요약은 여러 변경을 ` · `(공백+가운뎃점+공백)로 구분.
  - 버전이 올라가지 않는 작업도 그 다음 minor 릴리스로 간주해 `Phase X.Y (vX.Y):`를 붙이고 `package.json` bump + `vX.Y` 태그를 함께 만든다 (별도 무버전 커밋을 남기지 않는다).
  - 버전 체계는 우하단 버전 뱃지/`package.json` 참조 — Phase 단위 major + 소수점 minor.

- **본문 (body)**: 변경이 여러 영역에 걸치면 `[그룹명]` 대괄호 헤더로 묶고 그 아래 `-` 불릿. 무엇을·왜를 간결하게. 변경이 단순하면 짧은 불릿 몇 줄로 충분.

- **트레일러**: 모든 커밋 본문 마지막에 빈 줄 후 정확히 아래 한 줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

- **작성자/설정**: author 는 기존 git config(`brothersong20 <brothersong20@gmail.com>`) 그대로. `git config`를 수정하지 않는다.

- **amend 금지**: 항상 새 커밋을 만든다. 사용자가 명시적으로 amend를 요청한 경우에만 예외.

- **릴리스 절차**: 모든 커밋은 곧 릴리스다. `package.json` 버전을 `X.Y`로 bump하는 변경을 커밋에 포함하고, 커밋 후 `vX.Y` 태그를 찍는다. push 는 `git push` + `git push --tags`. origin upstream 은 이미 설정돼 있어 `git push`로 충분.

- **푸시**: 사용자가 푸시를 요청하지 않으면 푸시하지 않는다.

본문 작성 예시:

```
Phase 1.1 (v1.1): 관리자 폴 생성 페이지 · 폴별 식당 후보 선택 · 홈 헤더 개편

[관리자]
- /#/admin 라우트와 관리자 인증 이중 검증
- 폴 생성 시 식당 후보 다중 선택

[홈]
- 헤더 재정렬, 진행중 폴 섹션 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
