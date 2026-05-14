import Papa from 'papaparse';
import { csvUrl } from './config.js';
import { parseMenusText } from './menus.js';

async function fetchCsv(sheetName) {
  const res = await fetch(csvUrl(sheetName), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`시트 로딩 실패 (${sheetName}): HTTP ${res.status}`);
  }
  return res.text();
}

function parse(csvText) {
  const { data } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim()
  });
  return data;
}

function asBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'y' || s === 'yes';
}

function asInt(v, fallback = 0) {
  const n = parseInt(String(v ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function loadRestaurants() {
  const rows = parse(await fetchCsv('restaurants'));
  return rows
    .map((r) => ({
      id: String(r.id || '').trim(),
      name: String(r.name || '').trim(),
      category: String(r.category || '').trim(),
      address: String(r.address || '').trim(),
      walkingMinutes: asInt(r.walking_minutes, null),
      capacity: String(r.capacity || '').trim(),
      menusText: String(r.menus_text || '').trim(),
      menus: parseMenusText(r.menus_text),
      note: String(r.note || '').trim(),
      active: asBool(r.active)
    }))
    .filter((r) => r.id && r.name && r.active);
}

export async function loadPolls() {
  const rows = parse(await fetchCsv('polls'));
  return rows
    .map((r) => ({
      id: String(r.id || '').trim(),
      title: String(r.title || '').trim(),
      mealType: String(r.meal_type || '').trim(),
      eventDate: String(r.event_date || '').trim(),
      eventTime: String(r.event_time || '').trim(),
      deadline: String(r.deadline || '').trim(),
      status: String(r.status || '').trim() || 'active',
      description: String(r.description || '').trim(),
      createdAt: String(r.created_at || '').trim()
    }))
    .filter((p) => p.id && p.title);
}

export async function loadPoll(pollId) {
  const polls = await loadPolls();
  return polls.find((p) => p.id === pollId) || null;
}

export async function loadVotes(pollId) {
  const rows = parse(await fetchCsv('votes'));
  return rows
    .map((r) => ({
      pollId: String(r.poll_id || '').trim(),
      voterName: String(r.voter_name || '').trim(),
      attendance: String(r.attendance || '').trim(),
      choice1Id: String(r.choice_1_id || '').trim(),
      choice2Id: String(r.choice_2_id || '').trim(),
      votedAt: String(r.voted_at || '').trim()
    }))
    .filter((v) => v.pollId === pollId && v.voterName);
}
