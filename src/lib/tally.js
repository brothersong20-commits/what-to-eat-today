import { ATTENDANCE } from './config.js';

const FIRST_CHOICE_WEIGHT = 2;
const SECOND_CHOICE_WEIGHT = 1;

/**
 * 투표 결과 집계.
 * - 참석/불참석/보류 카운트
 * - 식당별 가중치 점수 (1순위=2, 2순위=1)
 * - 식당별 1순위/2순위 카운트 분리도 함께 보관
 */
export function tally(votes, restaurants) {
  const counts = {
    [ATTENDANCE.YES]: 0,
    [ATTENDANCE.NO]: 0,
    [ATTENDANCE.HOLD]: 0
  };

  const byRestaurant = new Map();
  for (const r of restaurants) {
    byRestaurant.set(r.id, {
      restaurant: r,
      first: 0,
      second: 0,
      score: 0
    });
  }

  for (const v of votes) {
    if (counts[v.attendance] !== undefined) counts[v.attendance] += 1;

    if (v.attendance === ATTENDANCE.YES) {
      const r1 = v.choice1Id && byRestaurant.get(v.choice1Id);
      if (r1) {
        r1.first += 1;
        r1.score += FIRST_CHOICE_WEIGHT;
      }
      const r2 = v.choice2Id && byRestaurant.get(v.choice2Id);
      if (r2) {
        r2.second += 1;
        r2.score += SECOND_CHOICE_WEIGHT;
      }
    }
  }

  const ranking = [...byRestaurant.values()]
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.first !== a.first) return b.first - a.first;
      return b.second - a.second;
    });

  return {
    totalVotes: votes.length,
    attendance: counts,
    ranking
  };
}
