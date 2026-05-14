const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

const GIDS = {
  restaurants: import.meta.env.VITE_RESTAURANTS_GID,
  polls: import.meta.env.VITE_POLLS_GID,
  votes: import.meta.env.VITE_VOTES_GID
};

export function csvUrl(sheetName) {
  const gid = GIDS[sheetName];
  if (!SHEET_ID || !gid) {
    throw new Error(`환경변수 누락: SHEET_ID 또는 ${sheetName} gid`);
  }
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

export function webhookUrl() {
  if (!APPS_SCRIPT_URL) {
    throw new Error('환경변수 누락: VITE_APPS_SCRIPT_URL');
  }
  return APPS_SCRIPT_URL;
}

export const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '회', '고기', '기타'];

export const ATTENDANCE = {
  YES: '참석',
  NO: '불참석',
  HOLD: '보류'
};
