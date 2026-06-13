#!/usr/bin/env python3
"""
로컬 이미지 파일을 Supabase Storage(`images` 버킷)에 업로드하고 public URL을 반환한다.

운영자(Claude Code)가 add-data 스킬로 식당/카페 이미지를 호스팅할 때 쓴다. 외부(네이버/블로그)
이미지를 그대로 DB에 박으면 핫링크 차단·만료로 깨지므로, 다운로드→이 스크립트로 우리 Storage에
올려 영구 public URL을 얻는다.

인증/정책: `.env.local`의 VITE_SUPABASE_URL / VITE_SUPABASE_KEY(anon)를 읽어 Storage REST API 호출.
schema.sql 섹션 9의 `images_anon_insert` 정책(images 버킷 + restaurants/cafes prefix + 2MB·이미지 MIME)이
이 업로드를 허용한다.

사용:
    python upload_image.py <파일경로> <kind: restaurant|cafe> <id> <role: thumb|menu>
    # 예: python upload_image.py /tmp/hyundaiok.jpg restaurant R023 thumb
출력(JSON): { "ok": true, "public_url": "...", "path": "restaurants/R023/thumb-...jpg" }
"""

import json
import os
import sys
import time
import urllib.request

MAX_BYTES = 2 * 1024 * 1024
EXT_MIME = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'webp': 'image/webp', 'gif': 'image/gif',
}


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


def main():
    if len(sys.argv) != 5:
        print('usage: python upload_image.py <file> <restaurant|cafe> <id> <thumb|menu>', file=sys.stderr)
        sys.exit(2)
    path_in, kind, entity_id, role = sys.argv[1:5]

    if kind not in ('restaurant', 'cafe'):
        print(json.dumps({'ok': False, 'error': f'kind 는 restaurant|cafe 여야 함(받음: {kind})'}, ensure_ascii=False)); sys.exit(1)
    if not os.path.isfile(path_in):
        print(json.dumps({'ok': False, 'error': f'파일 없음: {path_in}'}, ensure_ascii=False)); sys.exit(1)
    size = os.path.getsize(path_in)
    if size > MAX_BYTES:
        print(json.dumps({'ok': False, 'error': f'2MB 초과({size}바이트)'}, ensure_ascii=False)); sys.exit(1)
    ext = os.path.splitext(path_in)[1].lstrip('.').lower()
    mime = EXT_MIME.get(ext)
    if not mime:
        print(json.dumps({'ok': False, 'error': f'허용 안 되는 형식: .{ext}'}, ensure_ascii=False)); sys.exit(1)

    env = load_env(['VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY'])
    base, anon = env.get('VITE_SUPABASE_URL'), env.get('VITE_SUPABASE_KEY')
    if not base or not anon:
        print(json.dumps({'ok': False, 'error': 'VITE_SUPABASE_URL/KEY 미설정'}, ensure_ascii=False)); sys.exit(1)

    folder = 'cafes' if kind == 'cafe' else 'restaurants'
    safe_id = ''.join(c for c in (entity_id or 'unknown') if c.isalnum() or c in '_-') or 'unknown'
    role = 'menu' if role == 'menu' else 'thumb'
    obj_path = f'{folder}/{safe_id}/{role}-{int(time.time())}-{os.getpid()}.{ext}'

    with open(path_in, 'rb') as f:
        body = f.read()
    # 매직바이트 검사 — 확장자만 믿지 않고 실제 내용으로 이미지 확인(위조 확장자·HTML 오류페이지 차단).
    def sniff(b):
        if b[:3] == b'\xff\xd8\xff': return 'image/jpeg'
        if b[:8] == b'\x89PNG\r\n\x1a\n': return 'image/png'
        if b[:6] in (b'GIF87a', b'GIF89a'): return 'image/gif'
        if b[:4] == b'RIFF' and b[8:12] == b'WEBP': return 'image/webp'
        return None
    real_mime = sniff(body)
    if real_mime is None:
        print(json.dumps({'ok': False, 'error': '이미지 내용이 아님(매직바이트 불일치 — 잘못된 파일/HTML?)'}, ensure_ascii=False)); sys.exit(1)
    mime = real_mime  # 확장자 추정 대신 실제 형식을 사용
    # Storage REST: POST /storage/v1/object/{bucket}/{key}. 버킷='images', key=obj_path(restaurants/...).
    url = f'{base}/storage/v1/object/images/{obj_path}'
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': anon,
        'Authorization': f'Bearer {anon}',
        'Content-Type': mime,
        'x-upsert': 'false',
        'cache-control': 'max-age=3600',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        print(json.dumps({'ok': False, 'error': f'HTTP {e.code}', 'body': e.read().decode('utf-8', 'replace')}, ensure_ascii=False)); sys.exit(1)
    except Exception as e:  # noqa
        print(json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False)); sys.exit(1)

    public_url = f'{base}/storage/v1/object/public/images/{obj_path}'
    print(json.dumps({'ok': True, 'public_url': public_url, 'path': obj_path}, ensure_ascii=False))


if __name__ == '__main__':
    main()
