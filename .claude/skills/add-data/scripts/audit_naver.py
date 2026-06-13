#!/usr/bin/env python3
"""
기존 DB의 식당·카페를 네이버 지역검색(공식 API)로 점검한다 — **존재·카테고리·주소** 중심.
보고서 전용: DB를 절대 수정하지 않는다(읽기만). 결과를 JSON으로 출력하고, 사람이 검토 후 반영한다.

핵심 주의(샘플로 확인된 사실):
- 질의어가 길면 0건이 흔하다 → 이름/이름+송도/접미사 제거 등 **여러 변형을 시도**한다.
- "0건"은 폐업이 아니다(이름이 다르게 등록됐을 수 있음) → `no_match`는 '수동확인'으로만 표시.
- 매칭은 **주소(도로명+번호)**로 확정한다. 동명 타지역 오매칭 방지.
- 네이버 카테고리→우리 enum 매핑은 휴리스틱(회/고기 뉘앙스)이라 **불일치는 플래그만**, 자동결정 안 함.

인증: `.env.local`의 VITE_SUPABASE_URL / VITE_SUPABASE_KEY(anon, RLS가 전체 SELECT 허용) +
NAVER_SEARCH_ID / NAVER_SEARCH_SECRET.

사용: python audit_naver.py            # 식당+카페 전체
출력: JSON {summary, results:[...]}
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROAD_RE = re.compile(r'([가-힣A-Za-z0-9]+(?:번길|대로|로|길))\s*(\d+(?:-\d+)?)')


def load_env(keys):
    found = {k: os.environ.get(k) for k in keys}
    if all(found.values()):
        return found
    here = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        cand = os.path.join(here, '.env.local')
        if os.path.isfile(cand):
            with open(cand, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, _, v = line.partition('=')
                    if k.strip() in keys and not found.get(k.strip()):
                        found[k.strip()] = v.strip()
            break
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return found


ENV = load_env(['VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY', 'NAVER_SEARCH_ID', 'NAVER_SEARCH_SECRET'])


def fetch_rows(table):
    url = f"{ENV['VITE_SUPABASE_URL']}/rest/v1/{table}?select=id,name,category,area,address&order=id"
    req = urllib.request.Request(url, headers={
        'apikey': ENV['VITE_SUPABASE_KEY'],
        'Authorization': f"Bearer {ENV['VITE_SUPABASE_KEY']}",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))


def naver_local(query):
    """반환 (items, error). error 가 있으면 결과 없음과 구분(거짓 음성 방지)."""
    url = 'https://openapi.naver.com/v1/search/local.json?' + urllib.parse.urlencode({'query': query, 'display': 5})
    req = urllib.request.Request(url, headers={
        'X-Naver-Client-Id': ENV['NAVER_SEARCH_ID'],
        'X-Naver-Client-Secret': ENV['NAVER_SEARCH_SECRET'],
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return [], f'http_{e.code}'        # 401 인증, 429 쿼터 등 → no_result 와 구분
    except Exception as e:                  # noqa
        return [], f'net_{type(e).__name__}'
    out = []
    for it in data.get('items', []):
        out.append({
            'name': re.sub(r'</?b>', '', it.get('title') or ''),
            'category': it.get('category') or '',
            'road_address': it.get('roadAddress') or '',
            'address': it.get('address') or '',
        })
    return out, None


def roads(text):
    return {(r.replace(' ', ''), n) for r, n in ROAD_RE.findall(text or '')}


def addr_match(stored_addr, cand):
    """도로명+번호 교집합 + 연수구 일치면 매칭. (우리 데이터는 전부 연수구 송도라 구 토큰을 강제해
    동명 타지역·타구 오매칭을 막는다.) 주의: 호/층/동 단위 변경은 이 함수가 잡지 못한다 → 도로명+번호
    드리프트만 검출. 호 단위 차이는 보고서에서 road_address를 사람이 비교한다."""
    blob = (cand.get('road_address', '') + ' ' + cand.get('address', ''))
    if '연수구' not in blob:
        return False
    return bool(roads(stored_addr) & roads(blob))


def variants(name):
    base = name.strip()
    stripped = re.sub(r'(송도신도시점|송도점|송도|신도시점|랜드마크시티점|커낼워크점|점)$', '', base).strip()
    seen, out = set(), []
    for q in (base, f'{base} 송도', stripped, f'{stripped} 송도', ' '.join(base.split()[:2])):
        q = q.strip()
        if q and q not in seen:
            seen.add(q); out.append(q)
    return out


# 순서 중요: 더 구체적인 규칙을 위에. '햄버거/치킨/패스트푸드'를 '양식(버거 포함)'보다 먼저 둬야
# KFC·버거집이 양식으로 잘못 매핑되지 않는다(codex 지적 반영).
CAT_MAP = [
    (('생선회', '물회', '활어', '초밥', '횟집'), '회'),
    (('갈비', '삼겹', '곱창', '구이', '육류', '고기'), '고기'),
    (('햄버거', '버거', '치킨', '패스트푸드', '프라이드'), '패스트푸드'),
    (('중식',), '중식'),
    (('돈가스', '일식', '라멘', '스시', '우동'), '일식'),
    (('피자', '파스타', '양식', '스테이크'), '양식'),
    (('분식', '떡볶이', '김밥'), '분식'),
    (('베트남', '태국', '쌀국수', '아시아', '동남아'), '동남아'),
    (('베이커리', '제과', '빵'), '베이커리'),
    (('카페', '디저트', '커피'), '카페'),
    (('한식', '국밥', '냉면', '백반', '찌개', '국수', '해장', '순대'), '한식'),
]


def map_category(naver_cat):
    low = naver_cat
    for keys, val in CAT_MAP:
        if any(k in low for k in keys):
            return val
    return ''


def main():
    rows = [dict(r, _kind='restaurant') for r in fetch_rows('restaurants')] + \
           [dict(r, _kind='cafe') for r in fetch_rows('cafes')]
    results = []
    for r in rows:
        match = None
        used_q = None
        seen, errors = [], []
        for q in variants(r['name']):
            cands, err = naver_local(q)
            time.sleep(0.12)
            if err:
                errors.append(f'{q}:{err}'); continue
            for c in cands:
                seen.append(c)
                if addr_match(r.get('address', ''), c):
                    match = c; used_q = q; break
            if match:
                break
        if not match:
            uniq = []
            for c in seen:
                if (c['name'], c['road_address']) not in [(u['name'], u['road_address']) for u in uniq]:
                    uniq.append(c)
            reject = 'api_error' if (errors and not seen) else ('address_mismatch' if seen else 'no_results')
            results.append({
                'kind': r['_kind'], 'id': r['id'], 'name': r['name'],
                'stored_category': r.get('category'), 'stored_area': r.get('area'),
                'stored_address': r.get('address'),
                'status': 'no_match', 'reject': reject, 'errors': errors,
                'candidates': [{'name': c['name'], 'category': c['category'], 'road_address': c['road_address']} for c in uniq[:4]],
            })
            continue
        mapped = map_category(match['category'])
        cat_flag = bool(mapped) and mapped != (r.get('category') or '')
        results.append({
            'kind': r['_kind'], 'id': r['id'], 'name': r['name'],
            'stored_category': r.get('category'), 'stored_address': r.get('address'),
            'status': 'matched',
            'naver_name': match['name'], 'naver_category': match['category'],
            'mapped_category': mapped, 'category_flag': cat_flag,
            'naver_road_address': match['road_address'], 'query': used_q,
        })

    summary = {
        'total': len(results),
        'matched': sum(1 for x in results if x['status'] == 'matched'),
        'no_match': sum(1 for x in results if x['status'] == 'no_match'),
        'category_flags': sum(1 for x in results if x.get('category_flag')),
        'name_diff': sum(1 for x in results if x['status'] == 'matched' and x['naver_name'] != x['name']),
    }
    print(json.dumps({'summary': summary, 'results': results}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
