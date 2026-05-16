export const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '회', '고기', '기타'];

// 회사 주변 지역. CATEGORIES와 동일하게 안내용 고정 목록 — 실제 칩은 DB값에서 동적 추출.
export const AREAS = ['아트포레', '송해원', '푸르지오시티', 'IBS타워', '커낼워크', '인천대입구'];

// 카페 카테고리 폴백 (DB app_options의 cafe_category 로딩 실패 시). schema.sql 시드와 동일 순서.
export const CAFE_CATEGORIES = ['프랜차이즈', '개인카페', '베이커리', '디저트', '로스터리', '브런치', '기타'];

export const CATEGORY_SLUGS = {
  '한식': 'han',
  '중식': 'jung',
  '일식': 'il',
  '양식': 'yang',
  '분식': 'bun',
  '회': 'hoe',
  '고기': 'gogi',
  '기타': 'etc'
};

// DB에 정의 외 카테고리가 올 수 있어 미매칭은 중립색(etc)으로 폴백한다.
export function categorySlug(category) {
  return CATEGORY_SLUGS[category] || 'etc';
}

export const ATTENDANCE = {
  YES: '참석',
  NO: '불참석',
  HOLD: '보류'
};
