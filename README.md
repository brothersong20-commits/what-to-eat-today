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

`.env.local` 에 2개 값 필요:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...           # 또는 anon JWT
```

## Supabase 셋업

1. https://supabase.com 에서 새 프로젝트 생성
2. Project Settings → API → Project URL, Publishable key 복사 → `.env.local`
3. SQL Editor에서 `supabase/schema.sql` 전체 실행 (테이블·RPC·RLS·Realtime 한 번에)
4. (선택) `supabase/seed.sql` 실행 — 더미 식당 5개·진행중 폴·마감된 폴 + 더미 투표

스키마는 멱등 작성이라 변경 후 다시 실행해도 안전합니다.

## 관리자 인증 (구글 OAuth + 이메일 허용목록)

`/#/admin` 은 **구글 로그인**으로 들어갑니다. 로그인한 구글 계정의 이메일이 `private.admin_allowlist`
테이블에 있어야 관리자로 인정되고, 폴/식당/카페 쓰기 RPC도 서버에서 같은 검사(`private.is_admin()`)를 합니다.

**1) Supabase 대시보드 설정** (Authentication)
- Providers → **Google** 활성화 + Google Cloud에서 발급한 Client ID/Secret 입력
  (구글 OAuth 클라이언트의 승인된 리디렉션 URI = `https://<project-ref>.supabase.co/auth/v1/callback`)
- URL Configuration → **Redirect URLs**에 개발/운영 주소 추가
  (로컬은 `http://localhost:5273/**`, 배포 시 `https://<도메인>/**`)

**2) 관리자 추가/삭제** (SQL Editor)

```sql
insert into private.admin_allowlist (email) values ('someone@gmail.com');
delete from private.admin_allowlist where email = 'someone@gmail.com';
```

관리자 권한은 클라이언트가 아니라 서버에서 로그인 JWT의 이메일로 판정하므로, 번들에 비밀이 들어가지 않습니다.

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
