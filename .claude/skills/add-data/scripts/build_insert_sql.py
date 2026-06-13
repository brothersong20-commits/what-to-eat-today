#!/usr/bin/env python3
"""
구조화된 식당/카페 JSON 한 건을 받아, Supabase MCP `execute_sql` 로 그대로 실행할 수 있는
**안전한 단일 INSERT 문**을 만들어 출력한다.

이 스크립트가 존재하는 이유: Supabase MCP `execute_sql` 은 파라미터 바인딩이 없어서, 손으로 SQL
문자열을 조립하면 작은따옴표 하나만 빠뜨려도 구문이 깨지거나 주입이 일어난다. 모든 문자열·배열
원소 이스케이프와 `menus_text` 직렬화를 여기서 결정적으로 처리해, 매번 같은 안전한 결과를 보장한다.

사용:
    python build_insert_sql.py entity.json
    # 또는
    cat entity.json | python build_insert_sql.py

입력 JSON 스키마 (없는 필드는 생략 가능 = NULL/기본값):
    {
      "kind": "restaurant" | "cafe",   # 필수
      "id": "R023",                      # 필수 (스킬이 DB max+1 로 채번)
      "name": "멘야하나비",              # 필수
      "category": "일식",
      "area": null,                       # 회사 캠퍼스 큐레이션 값 — 보통 비움
      "address": "...",
      "naver_url": "https://naver.me/xxxx",
      "walking_minutes": 5,
      "business_hours": "매일 11:00–21:00",
      "closed_days": ["월"],             # 요일 배열
      "menus": [                          # menus_text 로 직렬화됨
        {"name": "마제소바", "price": 9000, "representative": true},
        {"name": "돈코츠라멘", "price": 10000}
      ],
      "note": null,
      "is_group_dining": false,          # restaurant 만 사용 (cafe 는 무시)
      "source_note": "출처: <url> (2026-06 조사) · 가격 변동 가능 · 이미지 관리자 입력 필요"
    }

규칙:
- active=false, source='ai_draft' 는 항상 고정.
- image_url / menu_image_urls 는 의도적으로 넣지 않음 (관리자가 입력/업로드).
- menus_text 는 src/lib/menus.js `serializeMenus` 와 동일: 대표메뉴 우선 → 가격 내림차순(가격 없으면 뒤),
  대표는 선두 '*', 가격 있으면 '(가격)'. 메뉴명의 '/' 는 구분자 충돌을 막기 위해 '·' 로 치환.
"""

import json
import sys
import re


def _clean_text(s):
    """제어문자 제거(개행/탭 제외하면 거의 없음). NUL·기타 제어문자는 SQL/표시 모두에서 위험."""
    if s is None:
        return None
    s = str(s)
    # NUL 및 C0 제어문자(개행 \n, 탭 \t 만 허용) 제거
    s = "".join(ch for ch in s if ch == "\n" or ch == "\t" or ord(ch) >= 0x20)
    return s


def sql_str(s):
    """텍스트 → SQL 문자열 리터럴. None → NULL. 작은따옴표는 ''로 이스케이프."""
    s = _clean_text(s)
    if s is None or s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def sql_int(n):
    if n is None or n == "":
        return "NULL"
    try:
        return str(int(n))
    except (TypeError, ValueError):
        return "NULL"


def sql_bool(b):
    return "true" if bool(b) else "false"


def sql_text_array(items):
    """text[] 리터럴. 빈 배열/None → '{}'. 각 원소를 개별 이스케이프해 array[...] 로."""
    items = [
        _clean_text(x).strip()
        for x in (items or [])
        if x is not None and _clean_text(x).strip() != ""
    ]
    if not items:
        return "'{}'"
    return "array[" + ", ".join("'" + x.replace("'", "''") + "'" for x in items) + "]"


def serialize_menus(menus):
    """src/lib/menus.js serializeMenus 와 동일한 menus_text 직렬화."""
    rows = []
    for m in menus or []:
        name = _clean_text(m.get("name"))
        if not name:
            continue
        name = name.strip()
        if not name:
            continue
        # 메뉴명 내 '/' 는 구분자라 파싱이 깨짐 → '·' 로 치환
        name = name.replace("/", "·")
        price = m.get("price")
        if price == "" or price is None:
            price = None
        else:
            try:
                price = int(price)
            except (TypeError, ValueError):
                price = None
        rows.append(
            {"name": name, "price": price, "representative": bool(m.get("representative"))}
        )

    # 정렬: 대표메뉴 우선(내림차순), 그 안에서 가격 내림차순(가격 없으면 -inf → 뒤). 안정 정렬.
    def key(r):
        price = r["price"] if r["price"] is not None else float("-inf")
        return (0 if r["representative"] else 1, -price)

    rows.sort(key=key)

    parts = []
    for r in rows:
        prefix = "*" if r["representative"] else ""
        price = f"({r['price']})" if r["price"] is not None else ""
        parts.append(f"{prefix}{r['name']}{price}")
    return "/".join(parts)


def build_insert(entity):
    kind = entity.get("kind")
    if kind not in ("restaurant", "cafe"):
        raise ValueError("kind 는 'restaurant' 또는 'cafe' 여야 합니다.")
    table = "public.restaurants" if kind == "restaurant" else "public.cafes"

    if not entity.get("id") or not str(entity["id"]).strip():
        raise ValueError("id 는 필수입니다 (예: R023 / C012).")
    if not entity.get("name") or not str(entity["name"]).strip():
        raise ValueError("name 은 필수입니다.")

    # ID 형식 가드 (admin.js 채번 규칙과 동일한 정형만 허용)
    expected_prefix = "R" if kind == "restaurant" else "C"
    if not re.match(rf"^{expected_prefix}\d+$", str(entity["id"]).strip()):
        raise ValueError(
            f"id 형식이 잘못되었습니다: {entity['id']!r} (기대: {expected_prefix} + 숫자, 예 {expected_prefix}023)"
        )

    menus_text = serialize_menus(entity.get("menus"))

    cols = [
        "id",
        "name",
        "category",
        "area",
        "address",
        "naver_url",
        "walking_minutes",
        "business_hours",
        "closed_days",
        "menus_text",
        "note",
    ]
    vals = [
        sql_str(entity.get("id").strip()),
        sql_str(entity.get("name").strip()),
        sql_str(entity.get("category")),
        sql_str(entity.get("area")),
        sql_str(entity.get("address")),
        sql_str(entity.get("naver_url")),
        sql_int(entity.get("walking_minutes")),
        sql_str(entity.get("business_hours")),
        sql_text_array(entity.get("closed_days")),
        sql_str(menus_text if menus_text else None),
        sql_str(entity.get("note")),
    ]

    if kind == "restaurant":
        cols.append("is_group_dining")
        vals.append(sql_bool(entity.get("is_group_dining")))

    # 고정 필드
    cols += ["active", "source", "source_note"]
    vals += ["false", "'ai_draft'", sql_str(entity.get("source_note"))]

    cols_sql = ", ".join(cols)
    vals_sql = ", ".join(vals)
    return f"insert into {table}\n  ({cols_sql})\nvalues\n  ({vals_sql});"


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    # 단건 dict 또는 리스트(여러 곳) 모두 지원
    entities = data if isinstance(data, list) else [data]
    for e in entities:
        print(build_insert(e))


if __name__ == "__main__":
    main()
