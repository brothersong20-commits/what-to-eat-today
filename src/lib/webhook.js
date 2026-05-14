import { webhookUrl } from './config.js';

/**
 * Apps Script Web App에 투표 제출.
 * - Content-Type: text/plain → CORS preflight 회피 (Apps Script 표준 패턴)
 * - 본문은 JSON 문자열
 */
export async function submitVote({ pollId, voterName, attendance, choice1Id, choice2Id }) {
  const res = await fetch(webhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      pollId,
      voterName,
      attendance,
      choice1Id: choice1Id || '',
      choice2Id: choice2Id || ''
    })
  });
  if (!res.ok) {
    throw new Error(`Webhook HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok) {
    throw new Error(translateError(data.error));
  }
  return data;
}

function translateError(code) {
  switch (code) {
    case 'missing_required_fields':
      return '이름과 참석 여부는 필수입니다.';
    case 'invalid_attendance':
      return '참석 여부 값이 올바르지 않습니다.';
    case 'poll_not_found':
      return '존재하지 않는 투표입니다.';
    case 'poll_closed':
      return '이미 마감된 투표입니다.';
    case 'deadline_passed':
      return '투표 마감 시각이 지났습니다.';
    default:
      return code || '알 수 없는 오류가 발생했습니다.';
  }
}
