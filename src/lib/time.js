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
 * 투표 마감 시각이 행사 시작(날짜+시간)보다 늦은지 검사.
 * deadlineText: "YYYY-MM-DD HH:mm" 또는 "YYYY-MM-DDTHH:mm"
 * eventDate: "YYYY-MM-DD", eventTime: "HH:mm"
 * 비교 불가(행사 날짜·시간 누락/무효, 마감 무효)면 false → 경고하지 않음.
 */
export function isDeadlineAfterEvent(deadlineText, eventDate, eventTime) {
  const dl = parseDeadline(deadlineText);
  if (!dl) return false;
  const d = (eventDate || '').trim();
  const t = (eventTime || '').trim();
  if (!d || !t) return false;
  const ev = new Date(`${d}T${t}:00`);
  if (isNaN(ev.getTime())) return false;
  return dl.getTime() > ev.getTime();
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

/**
 * 마감까지 남은 시간을 자릿수 단위로 분해.
 * 파싱 실패 또는 마감(diff<=0)이면 expired:true, 나머지 0.
 */
export function clockParts(deadlineText, now = new Date()) {
  const d = parseDeadline(deadlineText);
  if (!d) return { expired: true, days: 0, h: 0, m: 0, s: 0 };
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return { expired: true, days: 0, h: 0, m: 0, s: 0 };

  const sec = Math.floor(diff / 1000);
  return {
    expired: false,
    days: Math.floor(sec / 86400),
    h: Math.floor((sec % 86400) / 3600),
    m: Math.floor((sec % 3600) / 60),
    s: sec % 60
  };
}

// 마감 임박 임계값(초) — flip 시계 색·관리자 배지가 공유하는 단일 출처.
export const URGENCY_WARN_SEC = 10800; // 3시간
export const URGENCY_DANGER_SEC = 3600; // 1시간

/**
 * clockParts() 결과에서 임박 단계 파생: 1h 이하 'danger', 3h 이하 'warn', 그 외/만료 null.
 */
export function urgencyFromParts(p) {
  if (!p || p.expired) return null;
  const total = (((p.days || 0) * 24 + p.h) * 60 + p.m) * 60 + p.s;
  if (total <= URGENCY_DANGER_SEC) return 'danger';
  if (total <= URGENCY_WARN_SEC) return 'warn';
  return null;
}

/**
 * 마감 텍스트에서 직접 임박 단계 산출('danger' | 'warn' | null).
 */
export function deadlineUrgency(deadlineText, now = new Date()) {
  return urgencyFromParts(clockParts(deadlineText, now));
}

/**
 * 디지털 시계 스타일: "4일 22:35:12" 또는 "05:30:12". 음수면 "마감됨".
 */
export function formatClock(deadlineText, now = new Date()) {
  const d = parseDeadline(deadlineText);
  if (!d) return '';
  const p = clockParts(deadlineText, now);
  if (p.expired) return '마감됨';

  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`;
  return p.days > 0 ? `${p.days}일 ${clock}` : clock;
}

/**
 * 마감 시각이 지났지만 '마감 날짜' 당일 자정(다음날 00:00) 이전이면 true.
 * 마감 전이면 false (이 함수의 관심사 아님 — 호출부에서 isPastDeadline로 먼저 가드).
 */
export function withinDeadlineDay(deadlineText, now = new Date()) {
  const d = parseDeadline(deadlineText);
  if (!d) return false;
  if (now <= d) return false;
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return now < endOfDay;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * "YYYY-MM-DD..." 에서 한국어 요일 한 글자. 로컬 기준(타임존 오프셋 회피).
 */
export function weekdayKo(dateText) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateText || '').trim());
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
}

export function formatEventDateTime(dateText, timeText) {
  const datePart = (dateText || '').trim();
  const timePart = (timeText || '').trim();
  if (!datePart) return '';
  const wd = weekdayKo(datePart);
  const dateStr = wd ? `${datePart} (${wd})` : datePart;
  return timePart ? `${dateStr} ${timePart}` : dateStr;
}

/**
 * 마감 절대 일시를 우측 패널용으로 분해. 파싱 실패면 null.
 * { date: "M/D (요일)", time: "HH:mm" }
 */
export function formatDeadlineParts(deadlineText) {
  const d = parseDeadline(deadlineText);
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
