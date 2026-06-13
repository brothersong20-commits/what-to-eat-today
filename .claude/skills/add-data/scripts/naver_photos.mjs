// 네이버 플레이스 '사진' 탭에서 실제 지점 사진 URL을 수집한다 (Playwright 헤드리스).
//
// add-data 스킬의 이미지 수집용. 네이버 지도(map.naver.com)는 일반 fetch로 못 읽지만, 실제 브라우저를
// 띄우는 Playwright로는 사진탭이 읽힌다(헤드리스 차단 안 됨 — 2026-06 확인). 수집한 사진은 그대로 쓰지 말고
// 다운로드→`upload_image.py`로 우리 Storage에 호스팅하고, image_source(네이버 플레이스 링크)를 함께 저장한다.
//
// ⚠️ 일괄 대량 수집은 네이버 ToS·저작권(점주/방문자 사진) 부담이 크다. 빈 곳 보강·신규 등록 위주로 절제해서 쓸 것.
//
// 사용:
//   node .claude/skills/add-data/scripts/naver_photos.mjs "<naver_url 또는 place id>"
// 출력(JSON): { input, place_id, type, photoCount, photos: [highres url ...] }
//
// 전제: devDependency `playwright` + `npx playwright install chromium`.

import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function extractId(url) {
  const m = url.match(/(?:place|restaurant|cafe|hairshop|hospital|attraction)\/(\d+)/) || url.match(/place\/(\d+)/);
  return m ? m[1] : null;
}
function extractType(url) {
  const m = url.match(/m\.place\.naver\.com\/(\w+)\/\d+/);
  return m ? m[1] : null;
}

async function scrapePhotos(page, photoUrl) {
  await page.goto(photoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const imgs = await page.$$eval('img', els => els.map(e => e.currentSrc || e.src).filter(Boolean));
  // search.pstatic 프록시(phinf=실제 사진)만, 프로필 아이콘 제외. 원본 src 기준 dedup.
  const seen = new Set();
  const out = [];
  for (const u of imgs) {
    if (!/phinf|blogfiles\.pstatic|review-phinf/.test(u)) continue;
    if (/icon_default_profile|\/assets\//.test(u)) continue;
    const key = (u.match(/src=([^&]+)/) || [, u])[1];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

const input = process.argv[2];
if (!input) {
  console.log(JSON.stringify({ error: 'usage: node naver_photos.mjs "<naver_url 또는 place id>"' }));
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ userAgent: UA, viewport: { width: 390, height: 844 } });

  let placeId = /^\d+$/.test(input) ? input : null;
  let type = null;
  if (!placeId) {
    // naver.me 단축/지도 URL → 최종 URL에서 place id·type 추출
    await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const finalUrl = page.url();
    placeId = extractId(finalUrl);
    type = extractType(finalUrl);
  }
  if (!placeId) {
    console.log(JSON.stringify({ input, error: 'place id를 찾지 못함(주소/링크 확인 필요)' }));
  } else {
    // 타입 자동 감지: 알면 그걸로, 모르면 restaurant→cafe→place 순으로 사진이 잡히는 것 채택.
    const candidates = type ? [type, 'restaurant', 'cafe', 'place'] : ['restaurant', 'cafe', 'place'];
    let photos = [], usedType = null;
    for (const t of [...new Set(candidates)]) {
      try {
        const found = await scrapePhotos(page, `https://m.place.naver.com/${t}/${placeId}/photo`);
        if (found.length >= 3) { photos = found; usedType = t; break; }
        if (found.length > photos.length) { photos = found; usedType = t; }
      } catch { /* 다음 타입 시도 */ }
    }
    console.log(JSON.stringify({ input, place_id: placeId, type: usedType, photoCount: photos.length, photos: photos.slice(0, 20) }, null, 2));
  }
} catch (e) {
  console.log(JSON.stringify({ input, error: String(e).slice(0, 200) }));
} finally {
  await browser.close();
}
