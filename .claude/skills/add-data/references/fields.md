# 필드 레퍼런스 — add-data

`build_insert_sql.py`에 넘기는 JSON의 각 필드 의미와, web search로 채울 때의 규칙.

## JSON 스키마

```json
{
  "kind": "restaurant",
  "id": "R023",
  "name": "멘야하나비",
  "category": "일식",
  "area": null,
  "address": "인천 연수구 ...",
  "naver_url": "https://naver.me/xxxx",
  "walking_minutes": 5,
  "business_hours": "매일 11:00–21:00 (브레이크 15:00–17:00)",
  "closed_days": ["월"],
  "menus": [
    {"name": "마제소바", "price": 9000, "representative": true},
    {"name": "돈코츠라멘", "price": 10000},
    {"name": "차슈덮밥"}
  ],
  "note": null,
  "is_group_dining": false,
  "source_note": "출처: <url1>, <url2> (2026-06 조사) · 가격 변동 가능 · 이미지 관리자 입력 필요"
}
```

## 필드별 규칙

| 필드 | 타입 | 규칙 |
|---|---|---|
| `kind` | `"restaurant"`/`"cafe"` | 필수. 카페면 `is_group_dining` 무시됨. |
| `id` | text | 필수. `R###`/`C###` 정형만(스크립트가 형식 검증). DB max+1로 채번. |
| `name` | text | 필수. |
| `category` | text | 식당: 한식·중식·일식·양식·분식·회·고기·기타. 카페: 프랜차이즈·개인카페·베이커리·디저트·로스터리·브런치·기타. 애매하면 기타. |
| `area` | text | **보통 비운다(null).** 회사 캠퍼스 큐레이션 값(아트포레·송해원·푸르지오시티·IBS타워·커낼워크·인천대입구)이라 web search로 단정 곤란. 주소가 명백히 한 구역일 때만 채우고, 아니면 관리자가 고르게 둔다. |
| `address` | text | 입력으로 받았으면 그대로, 아니면 조사로 보완. |
| `naver_url` | text | `http(s)://`로 시작. 네이버 지도/플레이스 링크. |
| `walking_minutes` | int | 회사에서 도보 분. 모르면 비운다(관리자가 채움). |
| `business_hours` | text | 자유 텍스트. 브레이크타임 있으면 함께. |
| `closed_days` | text[] | 정기휴무 요일 배열(`["월"]`). 없으면 `[]` 또는 생략. |
| `menus` | object[] | `{name, price?, representative?}`. 스크립트가 `menus_text`로 직렬화. **가격은 숫자(콤마 없이)**, 모르면 생략(괄호 없이 표시됨). |
| `note` | text | 주차·예약 등 메모. 최대 200자 권장. |
| `is_group_dining` | bool | **식당만.** 단체석/룸/큰 수용 확인 시 true. 불확실하면 false. |
| `source_note` | text | 조사 출처 URL 몇 개 + 조사 일자 + 미확인 항목 + 이미지 안내. 관리자 검토 근거. **민감정보 금지**(RLS상 anon이 읽을 수 있음). |

## 의도적으로 비우는 것
- `image_url`, `menu_image_urls`: 초안 생성 시점엔 **비움**(외부 URL 직접 박지 않음 — 핫링크·만료 위험). `source_note`에
  "썸네일·메뉴판 이미지는 관리자 업로드 필요" 명시. 이미지는 아래 "이미지 출처 정책"대로 별도로 채운다.
- 고정값 `active=false`, `source='ai_draft'`는 스크립트가 자동으로 넣으므로 JSON에 둘 필요 없다.

## 이미지 출처 정책 (실제 지점 사진 우선)
이미지는 **외부 URL을 그대로 넣지 않는다.** 항상 `scripts/upload_image.py`로 우리 Storage에 올린 public URL을 쓴다(핫링크·만료 방지). 출처는 아래 순서로 시도:
1. **관리자 제공(최우선·가장 정확)**: 네이버 '사진' 탭 스크린샷이나 직접 찍은 사진 파일 → `upload_image.py`로 호스팅, 또는 관리자 폼 '파일 업로드'.
2. **네이버 사진탭 자동 수집 (Playwright)**: `scripts/naver_photos.mjs`로 네이버 플레이스 '사진' 탭의 실제 지점
   사진 URL을 수집(헤드리스 브라우저라 `map.naver.com` 차단 우회). 흐름:
   `node .claude/skills/add-data/scripts/naver_photos.mjs "<naver_url>"` → 사진 URL 중 대표(ldb-phinf) 1장 선택
   → `curl`로 다운로드(UA + `-e https://m.place.naver.com/`) → `upload_image.py`로 호스팅 → `image_url` 설정 +
   **`image_source`에 네이버 플레이스 링크 저장**(손님 카드에 '사진 출처' 링크로 노출).
   - **저작권은 점주/방문자**에게 있음 — 사내툴 전제로 쓰되 `image_source`(+필요시 `source_note`) 출처 표기 필수.
   - **일괄 대량 수집은 ToS 부담** → 빈 곳 보강·신규 등록 위주로 절제. 기존 관리자 사진은 덮지 않는다.
   - 블로그/티스토리는 기본 WebSearch가 잘 못 찾으니, 네이버 사진탭(naver_photos.mjs)을 우선 쓴다.
3. **대표 스톡(임시)**: 위가 다 안 되면 Wikimedia Commons 등 라이선스 명확한 대표 사진을 임시로 쓰되 `image_source`에 출처를 남기고 `source_note`에 "대표 스톡사진 — 실제 지점 사진으로 교체 권장" 명시.

`image_source`(text 컬럼)는 image_url 사진의 출처 URL이며, 손님 카드 썸네일에 "사진 출처 ↗" 링크로 표시된다.

## menus_text 직렬화 (스크립트가 처리)
`src/lib/menus.js` `serializeMenus`와 동일:
- 대표메뉴 우선 → 그 안에서 가격 내림차순(가격 없으면 뒤).
- 대표는 선두 `*`, 가격 있으면 `(가격)`.
- 메뉴명에 `/`가 있으면 구분자와 충돌하므로 `·`로 치환.
- 예: 위 JSON → `*마제소바(9000)/돈코츠라멘(10000)/차슈덮밥`

## 예시: 입력 → 출력

**관리자 요청**: "멘야하나비 https://naver.me/xxxx 등록해줘"

**조사·정리 후 entity.json** → `python .claude/skills/add-data/scripts/build_insert_sql.py entity.json`

**스크립트 출력(예)**:
```sql
insert into public.restaurants
  (id, name, category, area, address, naver_url, walking_minutes, business_hours, closed_days, menus_text, note, is_group_dining, active, source, source_note)
values
  ('R023', '멘야하나비', '일식', NULL, '인천 연수구 ...', 'https://naver.me/xxxx', 5, '매일 11:00–21:00 (브레이크 15:00–17:00)', array['월'], '*마제소바(9000)/돈코츠라멘(10000)/차슈덮밥', NULL, false, false, 'ai_draft', '출처: ... (2026-06 조사) · 가격 변동 가능 · 이미지 관리자 입력 필요');
```

이 INSERT를 Supabase MCP `execute_sql`로 실행 → 관리자에게 검토 안내.
