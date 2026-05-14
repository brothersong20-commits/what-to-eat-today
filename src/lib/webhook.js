import { webhookUrl } from './config.js';

/**
 * Apps Script Web App에 투표 제출.
 * - Content-Type: text/plain → CORS preflight 회피 (Apps Script 표준 패턴)
 * - 본문은 JSON 문자열
 */
export async function submitVote({ pollId, voterName, attendance, choice1Id, choice2Id }) {
  return postWebhook({
    action: 'vote',
    pollId,
    voterName,
    attendance,
    choice1Id: choice1Id || '',
    choice2Id: choice2Id || ''
  });
}

export async function createPoll({ adminKey, title, mealType, eventDate, eventTime, deadline, description, restaurantIds }) {
  return postWebhook({
    action: 'create_poll',
    adminKey: adminKey || '',
    title,
    mealType,
    eventDate,
    eventTime,
    deadline,
    description: description || '',
    restaurantIds: Array.isArray(restaurantIds) ? restaurantIds.join(',') : ''
  });
}

async function postWebhook(payload) {
  const res = await fetch(webhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Webhook HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(translateError(data.error));
    err.code = data.error;
    throw err;
  }
  return data;
}

function translateError(code) {
  switch (code) {
    case 'missing_required_fields':
      return '필수 항목이 입력되지 않았습니다.';
    case 'invalid_attendance':
      return '참석 여부 값이 올바르지 않습니다.';
    case 'poll_not_found':
      return '존재하지 않는 투표입니다.';
    case 'poll_closed':
      return '이미 마감된 투표입니다.';
    case 'deadline_passed':
      return '투표 마감 시각이 지났습니다.';
    case 'unauthorized':
      return '관리자 키가 올바르지 않습니다.';
    case 'invalid_deadline':
      return '마감 시각이 올바르지 않습니다.';
    case 'id_collision_exhausted':
      return '같은 날짜에 너무 많은 투표가 생성되었습니다. 잠시 후 다시 시도해주세요.';
    default:
      return code || '알 수 없는 오류가 발생했습니다.';
  }
}
