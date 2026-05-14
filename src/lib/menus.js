/**
 * "갈비살(45000)/냉면(12000)/육회(28000)" 형태의 텍스트를
 * [{ name, price }] 배열로 파싱.
 * - 구분자: `/`
 * - 가격이 없으면 price = null
 */
export function parseMenusText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  return raw
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const match = token.match(/^(.*?)\s*\(\s*([\d,]+)\s*\)\s*$/);
      if (match) {
        return {
          name: match[1].trim(),
          price: parseInt(match[2].replace(/,/g, ''), 10) || null
        };
      }
      return { name: token, price: null };
    })
    .filter((m) => m.name);
}

export function formatPrice(price) {
  if (price == null) return '';
  return price.toLocaleString('ko-KR') + '원';
}
