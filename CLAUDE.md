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

세 레이어가 명확히 분리돼 있다.

1. **Static SPA (Vite + Vanilla JS, no framework)** — `src/main.js`가 해시 라우터(`src/lib/router.js`)에 네 라우트를 등록한다: `/`, `/vote/:id`, `/result/:id`, `/admin`. 각 페이지는 `src/pages/`의 `renderXxx(app, params)` 함수로 구현된다.

2. **데이터 읽기 — Google Sheets CSV export** — `src/lib/sheets.js`가 `https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}` 를 `papaparse`로 파싱한다. 시트는 셋: `restaurants` / `polls` / `votes`. 헤더 정의의 단일 진실 원천은 `apps-script/Code.gs`의 `SHEETS` 상수다.

3. **데이터 쓰기 — Apps Script Webhook** — `src/lib/webhook.js`가 POST. 응답이 `{ ok: false, error: <code> }`이면 `translateError`가 한국어로 변환한다.

데이터 흐름:

```
[홈]    home.js    → loadRestaurants()                    → restaurant-card
[투표]  vote.js    → loadPoll + loadRestaurants
                  → submitVote (webhook → Apps Script doPost → votes 시트 upsert)
[결과]  result.js  → loadPoll + loadRestaurants + loadVotes
                  → tally() → 가중치 랭킹
[관리자] admin.js  → createPoll (webhook → Apps Script doPost → polls 시트 append)
```

## 비명확한 핵심 규칙

이 프로젝트에서 코드만 봐서는 즉시 보이지 않는 제약과 관습들. 변경 전 반드시 확인할 것.

- **CORS preflight 회피**: webhook은 `Content-Type: text/plain;charset=utf-8`로 보낸다(`src/lib/webhook.js`의 `postWebhook`). 이는 Apps Script 표준 패턴이다. JSON으로 바꾸면 preflight `OPTIONS`가 발생하고 Apps Script는 처리할 수 없어 무성으로 실패한다.

- **webhook `action` 디스패치**: `Code.gs`의 `doPost`는 `body.action`으로 분기하며 누락 시 `'vote'`로 fallback. `'vote'` → `handleVote_`, `'create_poll'` → `handleCreatePoll_`. 디스패처 fallback은 구버전 클라이언트 호환을 위해 절대 제거하지 말 것. 새 액션 추가 시 분기만 늘리고 vote/createPoll 로직은 건드리지 않는다.

- **관리자 인증**: `/#/admin` 진입 시 `VITE_ADMIN_KEY`와 비교하고 통과하면 `localStorage.wte_admin_key`에 저장. `createPoll` 요청에 `adminKey`를 실어 보내면 Apps Script가 Script Property `ADMIN_KEY`로 재검증해 `unauthorized`를 반환할 수 있음. 두 키는 **동일 값**으로 맞춰야 한다.

- **투표는 (poll_id, voter_name) 기준 upsert**: 같은 이름으로 다시 제출하면 Apps Script `doPost`가 기존 행을 덮어쓴다(`apps-script/Code.gs` `doPost`의 마지막 블록). 응답의 `updated` 플래그로 신규/수정을 구분한다.

- **마감 검증은 서버에서도 한다**: 클라이언트가 `isPastDeadline()`로 한 번 가드하지만, Apps Script가 `polls.deadline`과 `polls.status`를 다시 검증해 `poll_closed`/`deadline_passed`를 반환한다. 클라이언트 시계를 신뢰하지 말 것.

- **가중치 집계**: 1순위 = 2점, 2순위 = 1점. 동점이면 1순위 카운트 → 2순위 카운트 순으로 타이브레이크(`src/lib/tally.js`). 점수 0인 식당은 랭킹에서 제외된다.

- **한국어 enum 값이 wire 를 가로지른다**: `ATTENDANCE = { YES: '참석', NO: '불참석', HOLD: '보류' }`(`src/lib/config.js`). 같은 한국어 문자열이 시트 셀, Apps Script `doPost` 검증, 클라이언트 비교 로직에서 동일하게 사용된다. 한 곳만 영문으로 바꾸면 다른 곳에서 조용히 깨진다.

- **메뉴 텍스트 포맷**: `restaurants.menus_text`는 `"이름(가격)/이름(가격)"` 슬래시 구분 문자열이다. `src/lib/menus.js`의 `parseMenusText`가 파싱하며 가격 없는 항목(`price = null`)도 허용한다.

- **`VITE_` 환경변수는 클라이언트 번들에 노출된다**: `SHEET_ID`, GID들, Apps Script URL 모두 공개된다. 민감 정보는 절대 저장 금지. 시트 공유 설정도 "링크가 있는 모든 사용자"를 전제로 한다.

- **디자인 토큰 파이프라인**: `DESIGN.md`(Starbucks 영감 명세) → `src/styles/tokens.css`(CSS 변수) → `src/styles/global.css`(토큰만 참조). 새 색/간격이 필요하면 먼저 `tokens.css`에 토큰을 추가하고 그 변수를 사용해야 한다. 루트가 `62.5%`라는 전제 위에서 `1rem = 10px`로 스페이싱 스케일이 설계돼 있다.

- **`CATEGORIES`는 안내용 하드코딩**: `src/lib/config.js`의 배열은 참고용이고, 실제 필터 칩은 시트의 카테고리 값에서 동적으로 추출된다(`home.js`, `vote.js`). 카테고리 추가 시 시트만 고쳐도 동작하지만 둘 다 맞춰두는 게 권장된다.

- **라우터는 해시 기반(`/#/vote/:id`)**: 정적 호스팅(Vercel)에서 SPA fallback 설정이 불필요하다. 새 라우트는 `src/main.js`에서 `defineRoute(...)` 한 줄을 추가한다.

## 시트 컬럼을 추가/변경할 때 동기화할 지점

세 곳을 함께 갱신해야 한다.

1. `apps-script/Code.gs`의 `SHEETS` 상수 (헤더 정의)
2. `src/lib/sheets.js`의 `loadRestaurants` / `loadPolls` / `loadVotes` 매핑
3. 사용 측 페이지/컴포넌트
