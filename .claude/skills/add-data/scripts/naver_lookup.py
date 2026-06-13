#!/usr/bin/env python3
"""
네이버 개발자센터 '지역(local) 검색' 오픈 API로 식당/카페 기본 정보를 조회한다.
공식 API라 ToS·봇탐지 문제가 없는 안전한 자동 채움 경로다.

반환(자동 채움 가능): 상호명·카테고리(네이버 분류)·주소(지번/도로명)·전화·좌표·네이버 link.
**메뉴/가격/영업시간/사진은 이 API에 없다** — 그건 스크린샷/검색으로 보완한다.

사용:
    python naver_lookup.py "현대옥 송도신도시점"

인증: 프로젝트 루트 `.env.local` 의 NAVER_SEARCH_ID / NAVER_SEARCH_SECRET 를 읽는다
(환경변수로 이미 설정돼 있으면 그걸 우선). VITE_ 접두사가 아니라 번들에 노출되지 않는다.

출력: 정리된 후보 목록(JSON). title의 <b> 태그 제거, 좌표는 WGS84(경도/위도)로 변환.
"""

import json
import os
import sys
import re
import urllib.parse
import urllib.request


def find_env_value(keys):
    """환경변수 우선, 없으면 상위로 올라가며 .env.local 에서 key=value 파싱."""
    found = {k: os.environ.get(k) for k in keys}
    if all(found.values()):
        return found
    here = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        candidate = os.path.join(here, '.env.local')
        if os.path.isfile(candidate):
            with open(candidate, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, _, v = line.partition('=')
                    k = k.strip()
                    if k in keys and not found.get(k):
                        found[k] = v.strip()
            break
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return found


def strip_tags(s):
    return re.sub(r'</?b>', '', s or '')


def main():
    if len(sys.argv) < 2:
        print('usage: python naver_lookup.py "<식당/카페 이름 (+지역)>"', file=sys.stderr)
        sys.exit(2)
    query = sys.argv[1]

    env = find_env_value(['NAVER_SEARCH_ID', 'NAVER_SEARCH_SECRET'])
    cid, csecret = env.get('NAVER_SEARCH_ID'), env.get('NAVER_SEARCH_SECRET')
    if not cid or not csecret:
        print(json.dumps({
            'error': 'NAVER_SEARCH_ID/SECRET 미설정 — .env.local 을 확인하세요.'
        }, ensure_ascii=False))
        sys.exit(1)

    url = 'https://openapi.naver.com/v1/search/local.json?' + urllib.parse.urlencode({
        'query': query, 'display': 5, 'sort': 'random'
    })
    req = urllib.request.Request(url, headers={
        'X-Naver-Client-Id': cid,
        'X-Naver-Client-Secret': csecret,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        print(json.dumps({'error': f'HTTP {e.code}', 'body': body}, ensure_ascii=False))
        sys.exit(1)
    except Exception as e:  # noqa
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(1)

    items = []
    for it in data.get('items', []):
        mapx, mapy = it.get('mapx'), it.get('mapy')
        # 네이버 좌표는 정수형 KATEC/그리드. 최신 지역검색은 10^7 스케일 경위도(예: 1269770162 → 126.9770162).
        def to_deg(v):
            try:
                return round(int(v) / 1e7, 7)
            except (TypeError, ValueError):
                return None
        items.append({
            'name': strip_tags(it.get('title')),
            'naver_category': it.get('category'),   # 예: "음식점>한식>해장국" — 우리 enum으로 매핑 필요
            'address': it.get('address'),
            'road_address': it.get('roadAddress'),
            'telephone': it.get('telephone') or '',
            'link': it.get('link') or '',
            'lng': to_deg(mapx),
            'lat': to_deg(mapy),
        })
    print(json.dumps({'query': query, 'count': len(items), 'items': items}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
