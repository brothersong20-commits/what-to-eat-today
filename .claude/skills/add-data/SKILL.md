---
name: add-data
description: >-
  what-to-eat-today(회식/점심 투표 앱)의 Supabase DB에 식당 또는 카페를 등록할 때 사용한다.
  관리자가 식당/카페 이름과 주소(또는 네이버 지도 링크)를 주면 web search로 카테고리·대표메뉴·
  메뉴/가격·영업시간·정기휴무를 조사해, 비활성 초안(active=false, source='ai_draft')으로 직접
  insert 한다. "식당 추가/등록", "카페 넣어줘", "이 가게 DB에 넣어줘", "메뉴 조사해서 등록",
  "/add-data" 같은 요청은 물론, 네이버 지도 링크나 "가게명 + 주소"를 던지며 등록을 암시하면
  명시적으로 'add-data'라고 부르지 않아도 이 스킬을 적극적으로 사용할 것. 손으로 관리자 폼을
  채우는 대신 조사·입력을 자동화하는 것이 목적이다.
---

# add-data — 식당·카페 AI 초안 입력

관리자가 준 최소 정보(이름 + 주소/네이버링크)로 web search 조사를 해서, 식당 또는 카페를
**비활성 초안**(`active=false`, `source='ai_draft'`)으로 Supabase에 입력한다. 관리자는
`/#/admin`의 '식당 관리' / '카페 관리' 탭에서 초안을 열어 검토·수정한 뒤 활성화한다.

핵심 가치: 관리자가 네이버·블로그를 일일이 뒤져 폼 칸을 채우던 일을 **조사는 AI가, 검토는 사람이**로
나눈다. 그래서 이 스킬은 "정확한 사실 수집 + 안전한 입력"에 집중하고, **불확실한 건 지어내지 않고
비워서 사람이 채우게** 한다.

> 이 작업은 클라이언트(anon)가 아니라 **운영자(Claude Code)의 MCP 작업**이다. seed 입력과 같은
> 성격이라 RPC를 거치지 않고 `execute_sql`로 직접 insert 한다. 앱의 "쓰기는 RPC 경유" 원칙은
> anon 클라이언트 대상이라 여기 적용 대상이 아니다.

## 워크플로 (식당/카페 1곳당)

### 1. 입력 파싱
- **종류**: '카페'/'cafe'가 명시되면 카페, 아니면 식당(기본). 한 요청에 섞여 있으면 각각 분류.
- **이름**: 필수. 없으면 한 줄로 되묻는다.
- **위치 단서**: 주소 또는 네이버 지도 링크(`naver.me/...`, `map.naver.com/...`). 둘 다 없으면 동명
  식당 혼동을 막기 위해 한 번 확인한다.
- 여러 곳이면 줄 단위로 나눠 각각 처리한다.

### 2. 다음 ID 채번
Supabase에서 현재 최대 ID를 조회해 `+1` 한다. admin.js `nextRestaurantId`/`nextCafeId`와 **동일 규칙**:
정형 ID(`R###`/`C###`)만 집계하고 **count가 아니라 max 기준**(중간 삭제로 번호가 비어 있을 수 있다).

```sql
-- 식당. 카페는 public.cafes + id ~ '^C\d+$'
select coalesce(max(substring(id from 2)::int), 0) + 1 as next
from public.restaurants where id ~ '^R\d+$';
```

결과 N 으로 `R{N:03d}` / `C{N:03d}`. 여러 곳을 연속 입력하면 넣은 만큼 N을 올려 충돌을 피한다.
(project_id는 `.env.local`의 `VITE_SUPABASE_URL` 서브도메인 ref — 현재 프로젝트 `mipyuuphhdtdwyxhxpjw`.
불확실하면 `list_projects`로 확인.)

### 3. 조사 (하이브리드: 공식 API 먼저 → web search 보완)

**3-a. 네이버 지역검색(공식 API)으로 기본정보 자동 채움 — 합법·우선.**
ToS·봇탐지 문제가 없는 공식 경로다. 먼저 실행해 **카테고리·주소·좌표·네이버 link·전화**를 채운다.
```bash
python .claude/skills/add-data/scripts/naver_lookup.py "현대옥 송도신도시점"
```
- 결과 후보 중 입력한 이름/주소와 맞는 항목을 고른다(여러 개면 주소로 판별).
- `naver_category`(예: `음식점>한식>해장국`)를 우리 enum(한식·중식·…/프랜차이즈·…)으로 매핑.
- `road_address`→`address`, `link`→`naver_url`(입력 링크가 있으면 그걸 우선), `telephone`은 있으면 `note`에 보탬.
- **이 API에 메뉴·가격·영업시간·사진은 없다.** 그건 3-b로.
- 키 미설정/오류면 이 단계는 건너뛰고 web search로만 진행(보고에 "네이버 API 미사용" 명시).

**3-b. web search로 나머지 보완 — 최신·사실 우선.**
공식 API에 없는 것(메뉴·가격·영업시간·휴무·대표메뉴)을 조사하고 **출처 URL과 날짜를 함께 기록**한다. 최근 1~2년 우선.
- **카테고리**: 식당 = `한식·중식·일식·양식·분식·회·고기·기타` 중 하나. 카페 = `프랜차이즈·개인카페·
  베이커리·디저트·로스터리·브런치·기타` 중 하나. 애매하면 `기타`.
- **대표/밀고 있는 메뉴**: 많이 추천되거나 가게 시그니처. 대표는 `representative: true`.
- **메뉴와 가격**: 가능한 만큼. 가격은 변동되니 조사 시점 기준임을 `source_note`에 남긴다.
- **영업시간 / 정기휴무 / 브레이크타임**: 휴무 요일은 `월~일` 중 해당 요일 배열.
- **주소 / 네이버 지도 링크**: 입력으로 받았으면 그대로, 아니면 보완.
- **단체 회식 적합성**(식당만): 룸/단체석/큰 수용 언급이 있으면 `is_group_dining: true` 후보. 불확실하면 false.

자세한 필드 의미·비워두는 규칙은 [references/fields.md](references/fields.md) 참고.

**가격 출처 주의**: `map.naver.com`(네이버 지도/플레이스 메뉴 탭)은 WebFetch로 **가져올 수 없다**(차단). 가격은
다이닝코드·블로그·가게 공식 등 다른 출처를 우선 시도하고, 그래도 지점 가격이 안 잡히면 **관리자에게 네이버
'메뉴' 탭 스크린샷을 요청**해 그 값을 넣는다(타 지점 가격을 이 지점 가격인 양 넣지 말 것).

**확신이 낮으면 비우고 `source_note`에 "미확인 — 관리자 확인 필요"로 남긴다. 절대 지어내지 않는다.**

### 4. 구조화 JSON → 안전한 INSERT 생성 (스크립트 사용)
조사 결과를 [references/fields.md](references/fields.md)의 JSON 스키마로 정리한 뒤,
**손으로 SQL을 쓰지 말고** 번들 스크립트로 INSERT를 생성한다. 이 스크립트가 작은따옴표·배열 원소
이스케이프, `menus_text` 직렬화(메뉴명 `/`→`·` 치환 포함), 제어문자 제거를 결정적으로 처리한다.

```bash
python .claude/skills/add-data/scripts/build_insert_sql.py entity.json
```

`entity.json`은 한 건(dict) 또는 여러 건(list) 모두 가능. 출력은 `active=false`,
`source='ai_draft'` 가 박힌 단일 `insert` 문(들)이다. `image_url`/`menu_image_urls`는
의도적으로 넣지 않는다(관리자 입력/업로드 몫).

### 5. insert 실행
생성된 INSERT를 Supabase MCP `execute_sql`로 실행한다. **한 호출에 insert 문만** 넣고 대상
project_id를 재확인한다. 같은 이름이 이미 있으면(동명/재등록) 실행 전에 관리자에게 알리고 진행 여부를 확인한다.

### 6. 관리자에게 보고 (한국어, 간결히)
- 넣은 곳 목록(ID · 이름 · 카테고리 · 대표메뉴 요약).
- **미확인/비워둔 항목**(특히 area·이미지·불확실한 가격) — 관리자가 채워야 할 것.
- 안내: "`/#/admin` → '식당 관리'(또는 '카페 관리') 탭에서 **비활성 초안**으로 보입니다.
  검토·수정 후 활성화하세요."

## 가드레일
- **모르면 비우고 명시. 지어내지 않는다.** 추측으로 채운 가격·메뉴는 관리자가 믿고 그대로 공개할 위험이 있다.
- 항상 `active=false`, `source='ai_draft'`. 단 `active=false`는 **앱 UI 게이트일 뿐 보안 경계가
  아니다**(`loadRestaurants`가 기본 `active=true`만 로드하지만 RLS는 anon 전체 SELECT 허용).
  → `source_note` 등에 **민감정보 금지**.
- **`source` 졸업은 활성화 시 자동**: 관리자가 초안을 활성화하면 `set_restaurant_active`/`set_cafe_active`가
  `ai_draft`→`manual`로 승격한다(검토 완료로 간주). 즉 활성화 = 초안 졸업.
- SQL은 손으로 조립하지 말고 **반드시 스크립트로 생성**한다.
- ID 채번은 매번 DB max를 재조회한다.

## 파일 구성
- `SKILL.md` — 이 워크플로.
- `scripts/naver_lookup.py` — 네이버 지역검색(공식 API)로 기본정보(카테고리·주소·좌표·링크·전화) 자동 채움.
- `scripts/build_insert_sql.py` — 구조화 JSON → 안전한 단일 INSERT(이스케이프·menus_text·배열 처리).
- `scripts/upload_image.py` — 로컬 이미지 파일 → Supabase Storage(`images` 버킷) 업로드, public URL 반환(kind 검증·매직바이트·2MB 가드). 이미지 백필용.
- `scripts/audit_naver.py` — 기존 DB(식당·카페)를 네이버 지역검색으로 점검(존재·카테고리·주소, **보고서 전용·DB 미수정**).
- `references/fields.md` — 컬럼/JSON 필드 의미, 비워두는 규칙, area·이미지 처리, 예시.
