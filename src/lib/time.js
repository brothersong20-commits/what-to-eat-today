/**
 * "2026-05-19 17:00" 또는 ISO 문자열을 Date로 파싱.
 * 한국 로컬 타임존 기준으로 해석.
 */
export function parseDeadline(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;

  // "YYYY-MM-DD HH:mm" → ISO-ish "YYYY-MM-DDTHH:mm"
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : trimmed;

  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

export function isPastDeadline(deadlineText, now = new Date()) {
  const d = parseDeadline(deadlineText);
  if (!d) return false;
  return now > d;
}

/**
 * 마감까지 남은 시간을 사람이 읽을 수 있는 형식으로.
 * 음수면 "마감됨" 반환.
 */
export function formatRemaining(deadlineText, now = new Date()) {
  const d = parseDeadline(deadlineText);
  if (!d) return '';
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return '마감됨';

  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);

  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${mins}분 남음`;
  if (mins > 0) return `${mins}분 남음`;
  return `${sec % 60}초 남음`;
}

export function formatEventDateTime(dateText, timeText) {
  const datePart = (dateText || '').trim();
  const timePart = (timeText || '').trim();
  if (!datePart) return '';
  return timePart ? `${datePart} ${timePart}` : datePart;
}
