# 오늘뭐먹지? (what-to-eat-today)

회사 부서 회식 메뉴를 카카오톡 투표 스타일로 결정하는 웹앱.

- 데이터·인증·실시간은 Supabase (Postgres + RPC + Realtime)
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

- `/` — 식당 둘러보기 + 진행중 폴 목록
- `/#/admin` — 관리자 (투표 만들기/수정, 식당 관리, 키 입력 후 진입)
- `/#/vote/:pollId` — 투표 페이지 (카톡 공유용)
- `/#/result/:pollId` — 결과 페이지 (마감 후 공개)

## 환경 변수

`.env.local` 에 3개 값 필요:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...           # 또는 anon JWT
VITE_ADMIN_KEY=test123                          # private.app_config의 admin_key와 동일
```

## Supabase 셋업

1. https://supabase.com 에서 새 프로젝트 생성
2. Project Settings → API → Project URL, Publishable key 복사 → `.env.local`
3. SQL Editor에서 `supabase/schema.sql` 전체 실행 (테이블·RPC·RLS·Realtime 한 번에)
4. (선택) `supabase/seed.sql` 실행 — 더미 식당 5개·진행중 폴·마감된 폴 + 더미 투표

스키마는 멱등 작성이라 변경 후 다시 실행해도 안전합니다.

## 관리자 인증

폴 생성·수정과 식당 관리는 키 검증을 두 군데서 거칩니다.

1. **클라이언트**: `.env.local`의 `VITE_ADMIN_KEY`와 비교 (입력 차단용)
2. **서버**: RPC가 `private.app_config.admin_key` 값과 비교 (실제 데이터 보호)

두 값을 동일하게 맞추세요. 변경 시:

```sql
update private.app_config set value = '새 값' where key = 'admin_key';
```

키는 클라 번들에 노출되므로 강한 인증이 아닙니다. "URL이 새도 폴은 못 만들게" 정도의 가벼운 차단으로 보면 됩니다.

## 폴더 구조

```
src/
├── main.js               # 라우터 부트스트랩
├── styles/
│   ├── tokens.css        # DESIGN.md → CSS variables
│   └── global.css        # 공통 + 컴포넌트 스타일
├── pages/
│   ├── home.js           # 식당 리스트 + 진행중 폴
│   ├── vote.js           # 투표 페이지
│   ├── result.js         # 결과 페이지 (가중치 집계)
│   └── admin.js          # 관리자 (탭: 진행중 / 새 투표 / 식당 관리)
├── lib/
│   ├── config.js         # CATEGORIES, ATTENDANCE 상수
│   ├── supabase.js       # Supabase client + 모든 데이터 함수 + Realtime
│   ├── menus.js          # menus_text 파싱
│   ├── tally.js          # 1·2순위 가중치 집계
│   ├── time.js           # 카운트다운/마감 비교
│   ├── router.js         # hash 라우터
│   └── toast.js          # 토스트 메시지
└── components/
    ├── restaurant-card.js
    └── filter-bar.js

supabase/
├── schema.sql            # 테이블 + RPC + RLS + Realtime publication
└── seed.sql              # 검증용 더미 데이터
```

## 배포

1. GitHub에 푸시
2. Vercel에서 import → 자동 빌드
3. Vercel Project Settings → Environment Variables 에 위 3개 값 등록
4. 발급된 도메인 또는 `/#/vote/<폴ID>` URL을 카카오톡에 공유
