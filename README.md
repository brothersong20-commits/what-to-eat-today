# 오늘뭐먹지? (what-to-eat-today)

회사 부서 회식 메뉴를 카카오톡 투표 스타일로 결정하는 웹앱.

- 식당 DB는 구글 스프레드시트, 투표 제출은 Apps Script Webhook
- 정적 SPA (Vite + Vanilla JS) → Vercel 배포
- 디자인은 `DESIGN.md` (Starbucks 따뜻한 크림 + 4단계 그린)

## 빠른 시작

```bash
# 의존성 설치
npm install

# 로컬 dev 서버 (http://localhost:5173)
npm run dev

# 프로덕션 빌드
npm run build
```

## URL

- `/` — 식당 둘러보기
- `/#/admin` — 관리자 폴 생성 (키 입력 후 진입)
- `/#/vote/:pollId` — 투표 페이지 (카톡 공유용)
- `/#/result/:pollId` — 결과 페이지 (마감 후 공개)

## 환경 변수

`.env.local` 에 6개 값 필요:

```
VITE_SHEET_ID=
VITE_RESTAURANTS_GID=
VITE_POLLS_GID=
VITE_VOTES_GID=
VITE_APPS_SCRIPT_URL=
VITE_ADMIN_KEY=
```

값을 구하는 방법과 Apps Script 배포 절차는 [APPS_SCRIPT_SETUP.md](./APPS_SCRIPT_SETUP.md) 참조.

## 관리자 페이지 (`/#/admin`)

폴 생성은 `/#/admin` 라우트에서 한다. 동일한 키를 두 곳에 설정해야 한다.

1. `.env.local`에 `VITE_ADMIN_KEY=<공통키>` 등록 (클라가 입력 검증에 사용).
2. Apps Script 편집기 → ⚙ 프로젝트 설정 → 스크립트 속성에 `ADMIN_KEY=<같은 공통키>` 추가 (서버가 webhook 요청에서 재검증).
3. `Code.gs` 변경 후엔 반드시 **배포 → 배포 관리 → 편집 → 새 버전 → 배포**로 새 버전을 찍어야 적용된다.

키는 클라 번들에 노출되므로 강한 인증이 아니다. "URL이 새도 폴은 못 만들게" 정도의 가벼운 차단으로 보면 된다.

## 폴더 구조

```
src/
├── main.js               # 라우터 부트스트랩
├── styles/
│   ├── tokens.css        # DESIGN.md → CSS variables
│   └── global.css        # 공통 + 컴포넌트 스타일
├── pages/
│   ├── home.js           # 식당 리스트
│   ├── vote.js           # 투표 페이지
│   └── result.js         # 결과 페이지 (가중치 집계)
├── lib/
│   ├── config.js         # ENV → CSV/Webhook URL
│   ├── sheets.js         # CSV fetch + papaparse
│   ├── menus.js          # menus_text 파싱
│   ├── webhook.js        # Apps Script POST
│   ├── tally.js          # 1·2순위 가중치 집계
│   ├── time.js           # 카운트다운/마감 비교
│   ├── router.js         # hash 라우터
│   └── toast.js          # 토스트 메시지
└── components/
    ├── restaurant-card.js
    └── filter-bar.js

apps-script/
└── Code.gs               # 스프레드시트에 붙여넣을 Apps Script
```

## 배포

1. GitHub에 푸시
2. Vercel에서 import → 자동 빌드
3. Vercel Project Settings → Environment Variables 에 위 5개 값 등록
4. 발급된 도메인 또는 `/#/vote/<폴ID>` URL을 카카오톡에 공유
