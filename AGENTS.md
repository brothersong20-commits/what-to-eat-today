# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
| `config.js` | `CATEGORIES` `categorySlug()` `ATTENDANCE` | 카테고리 slug·참석 enum |
| `menus.js` | `parseMenusText` `serializeMenus` `compareMenu` `formatPrice` | 메뉴 텍스트 파싱·가격 포맷 |
| `shuffle.js` | `shuffle(arr)` | 무작위 정렬 |
| `escape.js` | `escapeHtml(s)` | innerHTML 직전 이스케이프 |
| `facets.js` | `uniq(items, key)` | 필터용 고유값 추출 |
| `client-id.js` | `getClientId()` | 좋아요용 익명 브라우저 id |
| `voter.js` | `markVoted` `getVotedRecord` `hasVoted` | 투표 완료 브라우저 게이트 |
| `toast.js` | `showToast(msg, opts)` | 토스트 피드백 |
| `router.js` | `defineRoute` `start` `navigate` `currentPath` | 해시 라우터 |
| `modal.js` | `openModal(opts)` | 오버레이 모달 수명주기·접근성 |
| `supabase.js` | `loadRestaurants/Cafes/Polls/Votes/Likes` · `submitVote` · `create/update* RPC` · `subscribe*`/`unsubscribe` | 데이터 레이어 단일 진입점 |

### src/components (HTML 헬퍼/위젯)

| 모듈 | 공개 API | 용도 |
|---|---|---|
| `restaurant-card.js` | `restaurantCardHtml(r, opts)` | 식당/카페 카드 |
| `category-badge.js` | `categoryBadgeHtml(cat)` `areaBadgeHtml(area)` | rc-badge pill |
| `verified-seal.js` | `verifiedSealHtml()` | 단체회식 인증 씰 |
| `heart-icon.js` | `heartSvg()` | 좋아요 하트 SVG |
| `flip-clock.js` | `flipClockHtml()` `updateFlipClock()` | 플립 카운트다운 |
| `filter-bar.js` | `filterBarHtml()` `bindFilterBar()` `applyFilter()` | 카테고리/지역/검색 필터 |
| `share.js` | `buildShareUrl` `shareControlsHtml` `bindShareControls` `openQrModal` | 링크 복사·QR |
| `spin-wheel.js` | `spinWheelButtonHtml()` `bindSpinWheel()` | 식당 돌림판 |
| `photo-marquee.js` | `photoMarqueeHtml(images)` | 홈 히어로 배경 무한 사진 marquee(장식 텍스처) |

## 비명확한 핵심 규칙

이 프로젝트에서 코드만 봐서는 즉시 보이지 않는 제약과 관습들. 변경 전 반드시 확인할 것.

- **쓰기는 항상 RPC 경유**: 클라이언트는 `anon` (publishable) 키만 가지고, polls/votes/restaurants에 대한 RLS 정책은 SELECT만 허용한다. INSERT/UPDATE/DELETE는 `security definer`로 선언된 RPC(`submit_vote`, `create_poll`, `update_poll`)를 통해서만 가능하다. 새 쓰기 작업이 필요하면 `supabase/schema.sql`에 RPC를 먼저 정의하고 클라이언트에서 호출한다.

- **관리자 인증 (구글 OAuth + 이메일 허용목록)**: `/#/admin` 진입 시 `bootstrapAuth`(admin.js)가 Supabase Auth 세션을 확인한다 — 세션 없으면 "구글로 로그인" 버튼(`signInWithGoogle`), 세션 있으면 `is_current_user_admin` RPC로 권한을 물어 통과 시 관리자 셸, 아니면 "권한 없음" 안내. 서버 측은 14개 쓰기 RPC가 본문에서 `private.is_admin()`(=JWT의 `email`이 `private.admin_allowlist`에 있는지, security definer로 검사)을 호출해 막는다. **관리자 추가/삭제는 `insert/delete ... private.admin_allowlist`** (RPC 불필요, 운영자 직접). 클라이언트는 `flowType:'pkce'`로 세션을 유지하며(`supabase.js`), 로그인 토큰이 모든 요청에 자동 첨부된다. **레거시 주의**: 옛 공유 비밀번호(`VITE_ADMIN_KEY`/`localStorage.wte_admin_key`/`private.app_config.admin_key`/`is_admin_or_key`)는 OAuth 전환(Step 6)으로 전부 제거됐다. 단 14개 RPC 시그니처의 **`p_admin_key text` 첫 인자는 호환을 위해 남아있으나 본문에서 미사용**(deprecated) — 클라이언트 래퍼가 아직 `p_admin_key: ''`로 보내지만 무시된다.

- **투표는 (poll_id, voter_name) 기준 upsert**: `submit_vote` RPC가 `on conflict ... do update`로 같은 이름의 기존 행을 덮어쓴다. 응답 boolean으로 신규(`false`)/수정(`true`)을 구분한다.

- **마감 검증은 서버에서도 한다**: 클라이언트가 `isPastDeadline()`로 한 번 가드하지만, `submit_vote` RPC가 `polls.deadline`과 `polls.status`를 다시 검증해 `poll_closed`/`deadline_passed` 예외를 raise. 클라이언트 시계를 신뢰하지 말 것.

- **부분 업데이트 컨벤션**: `update_poll`은 null인 필드를 "변경 안 함"으로 해석한다. `description`을 빈 값으로 명시 클리어하려면 별도 boolean `p_clear_description=true`로 보낸다. 클라이언트 `updatePoll({patch})`이 이 변환을 담당.

- **취소된 식당 보존**: 관리자가 후보에서 식당을 제거하면 `polls.removed_restaurant_ids` 배열로 옮겨진다. 다시 추가하면 거기서 빠진다. tally 자체는 변경 없이, admin 상세 패널에서 활성/취소 두 셋을 각각 tally해 별도 섹션으로 표시한다. `result.js`(일반 사용자)는 활성 식당만 tally한다.

- **가중치 집계**: 1순위 = 2점, 2순위 = 1점. 동점이면 1순위 카운트 → 2순위 카운트 순으로 타이브레이크(`src/lib/tally.js`). 점수 0인 식당은 랭킹에서 제외된다.

- **한국어 enum 값이 wire 를 가로지른다**: `ATTENDANCE = { YES: '참석', NO: '불참석', HOLD: '보류' }`(`src/lib/config.js`). 같은 한국어 문자열이 Postgres `check` 제약, RPC 검증, 클라이언트 비교 로직에서 동일하게 사용된다. 한 곳만 영문으로 바꾸면 다른 곳에서 조용히 깨진다.

- **메뉴 텍스트 포맷**: `restaurants.menus_text`는 `"이름(가격)/이름(가격)"` 슬래시 구분 문자열이다. `src/lib/menus.js`의 `parseMenusText`가 파싱하며 가격 없는 항목(`price = null`)도 허용한다.

- **Realtime 구독은 cleanup 필수**: `subscribeVotes`가 반환한 채널을 페이지 떠날 때 `unsubscribe(channel)`로 정리해야 한다. admin.js는 모듈 스코프 cleanup 레지스트리(`registerCleanup`)로 통일 처리.

- **`VITE_` 환경변수는 클라이언트 번들에 노출된다**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`(=publishable/anon key)는 공개돼도 되는 값이다. **`service_role` 키는 절대 클라이언트에 두지 말 것** — RLS 우회 가능하다. (구 `VITE_ADMIN_KEY`는 OAuth 전환으로 제거.) 관리자 권한은 클라이언트 키가 아니라 서버에서 로그인 JWT의 이메일을 `private.admin_allowlist`와 대조해 판정한다.

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
- **관리자 추가/삭제 (구글 OAuth)**: `insert into private.admin_allowlist (email) values ('someone@gmail.com');` / `delete from private.admin_allowlist where email = '...';`. 해당 이메일의 구글 계정으로 로그인하면 관리자가 된다. 구글 provider 활성화·Redirect URLs는 Supabase 대시보드 Authentication에서.
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
  Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>
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

Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>
```
