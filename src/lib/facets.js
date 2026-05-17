// 목록에서 특정 키의 고유 값만 입력 순서대로 추출. 필터 칩(카테고리·지역) 생성에 사용.
export function uniq(items, key) {
  return [...new Set((items || []).map((i) => i[key]).filter(Boolean))];
}
