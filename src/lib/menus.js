/**
 * "갈비살(45000)/냉면(12000)/육회(28000)" 형태의 텍스트를
 * [{ name, price, representative }] 배열로 파싱.
 * - 구분자: `/`
 * - 가격이 없으면 price = null
 * - 토큰 선두가 `*`이면 대표 메뉴 (representative = true)
 */
export function parseMenusText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  return raw
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      let representative = false;
      let body = token;
      if (body.startsWith('*')) {
        representative = true;
        body = body.slice(1).trim();
      }
      const match = body.match(/^(.*?)\s*\(\s*([\d,]+)\s*\)\s*$/);
      if (match) {
        return {
          name: match[1].trim(),
          price: parseInt(match[2].replace(/,/g, ''), 10) || null,
          representative
        };
      }
      return { name: body, price: null, representative };
    })
    .filter((m) => m.name);
}

/**
 * [{ name, price, representative }] 배열을
 * "*이름(가격)/이름(가격)" 형태의 텍스트로 직렬화.
 * - 이름 trim, 빈 이름 행 제외
 * - price 가 빈 값이면 괄호 생략
 * - representative 면 선두에 `*`
 */
export function serializeMenus(rows) {
  return (rows || [])
    .map((r) => ({
      name: String(r?.name ?? '').trim(),
      price: r?.price === '' || r?.price == null ? null : Number(r.price),
      representative: !!r?.representative
    }))
    .filter((r) => r.name)
    .map((r) => {
      const prefix = r.representative ? '*' : '';
      const price = r.price != null && !Number.isNaN(r.price) ? `(${r.price})` : '';
      return `${prefix}${r.name}${price}`;
    })
    .join('/');
}

export function formatPrice(price) {
  if (price == null) return '';
  return price.toLocaleString('ko-KR') + '원';
}
