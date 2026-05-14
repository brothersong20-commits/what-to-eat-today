/**
 * what-to-eat-today
 * - setupSheets():    restaurants / polls / votes 3개 시트와 헤더 생성
 * - seedDummyData():  더미 식당 + 더미 폴 1개 삽입 (선택, 한 번만 실행)
 * - doPost(e):        투표 제출 Webhook (이름 기준 upsert + 마감 검증)
 *
 * 배포: 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 배포(웹앱, 모든 사용자)
 * 자세한 가이드: ../APPS_SCRIPT_SETUP.md
 */

const SHEETS = {
  restaurants: [
    'id', 'name', 'category', 'address', 'walking_minutes',
    'capacity', 'menus_text', 'note', 'active'
  ],
  polls: [
    'id', 'title', 'meal_type', 'event_date', 'event_time',
    'deadline', 'status', 'description', 'created_at'
  ],
  votes: [
    'poll_id', 'voter_name', 'attendance',
    'choice_1_id', 'choice_2_id', 'voted_at'
  ]
};

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  for (const [name, headers] of Object.entries(SHEETS)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
           .setFontWeight('bold')
           .setBackground('#1E3932')
           .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }
  }

  ['Sheet1', '시트1'].forEach(function (legacy) {
    const s = ss.getSheetByName(legacy);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  SpreadsheetApp.getUi().alert('✅ 3개 시트(restaurants, polls, votes) 헤더 세팅 완료');
}

function seedDummyData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const restaurants = ss.getSheetByName('restaurants');
  const restaurantsRows = [
    ['R001', '청담옥',     '한식', '강남구 테헤란로 123', 5, '룸 4~12인 / 단체 30명', '한우갈비살(45000)/평양냉면(12000)/육회(28000)', '주차 가능, 흡연실 있음', true],
    ['R002', '스시조',     '일식', '강남구 역삼동 456',   8, '단체석 가능 / 룸 1개',   '런치오마카세(60000)/디너오마카세(120000)',          '예약 필수',                true],
    ['R003', '딘타이펑',   '중식', '강남구 강남대로 789',  6, '단체 20명 가능',         '샤오롱바오(13000)/볶음밥(11000)/마파두부(16000)',     '대기 길음',                true],
    ['R004', '에이오씨',   '양식', '강남구 도산대로 12',   10, '룸 8인 / 홀 단체 가능', '파스타런치(22000)/스테이크(48000)/하우스와인(9000)','분위기 좋음',              true],
    ['R005', '교대이층집', '고기', '서초구 서초대로 33',   12, '단체 40명 / 룸 다수',    '한우꽃등심(58000)/된장찌개(8000)/공기밥(2000)',       '회식 단골',                true]
  ];
  if (restaurants.getLastRow() === 1) {
    restaurants.getRange(2, 1, restaurantsRows.length, restaurantsRows[0].length)
               .setValues(restaurantsRows);
  }

  const polls = ss.getSheetByName('polls');
  const today = new Date();
  const eventDate = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);
  const deadline  = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);
  const pollsRows = [
    [
      'P' + Utilities.formatDate(today, 'Asia/Seoul', 'yyyyMMdd'),
      '5월 부서 저녁회식',
      '저녁',
      Utilities.formatDate(eventDate, 'Asia/Seoul', 'yyyy-MM-dd'),
      '18:30',
      Utilities.formatDate(deadline,  'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      'active',
      '5월 정기 회식입니다. 참석 부탁드려요.',
      Utilities.formatDate(today, 'Asia/Seoul', 'yyyy-MM-dd HH:mm')
    ]
  ];
  if (polls.getLastRow() === 1) {
    polls.getRange(2, 1, pollsRows.length, pollsRows[0].length)
         .setValues(pollsRows);
  }

  SpreadsheetApp.getUi().alert('✅ 더미 식당 5개 + 더미 폴 1개 삽입 완료');
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const pollId     = (body.pollId     || '').toString().trim();
    const voterName  = (body.voterName  || '').toString().trim();
    const attendance = (body.attendance || '').toString().trim();
    const choice1Id  = (body.choice1Id  || '').toString().trim();
    const choice2Id  = (body.choice2Id  || '').toString().trim();

    if (!pollId || !voterName || !attendance) {
      return jsonResponse({ ok: false, error: 'missing_required_fields' });
    }
    if (['참석', '불참석', '보류'].indexOf(attendance) === -1) {
      return jsonResponse({ ok: false, error: 'invalid_attendance' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const polls = ss.getSheetByName('polls');
    const pollsData = polls.getDataRange().getValues();
    const pollsHeaders = pollsData[0];
    const pIdCol     = pollsHeaders.indexOf('id');
    const pDeadCol   = pollsHeaders.indexOf('deadline');
    const pStatusCol = pollsHeaders.indexOf('status');

    let pollDeadline = null;
    let pollStatus = null;
    for (let i = 1; i < pollsData.length; i++) {
      if (pollsData[i][pIdCol] === pollId) {
        pollDeadline = pollsData[i][pDeadCol];
        pollStatus   = pollsData[i][pStatusCol];
        break;
      }
    }
    if (pollDeadline === null) {
      return jsonResponse({ ok: false, error: 'poll_not_found' });
    }
    if (pollStatus === 'closed') {
      return jsonResponse({ ok: false, error: 'poll_closed' });
    }
    const now = new Date();
    const deadlineDate = (pollDeadline instanceof Date) ? pollDeadline : new Date(pollDeadline);
    if (now > deadlineDate) {
      return jsonResponse({ ok: false, error: 'deadline_passed' });
    }

    const votes = ss.getSheetByName('votes');
    const data = votes.getDataRange().getValues();
    const headers = data[0];
    const pollIdCol    = headers.indexOf('poll_id');
    const voterNameCol = headers.indexOf('voter_name');

    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][pollIdCol] === pollId && data[i][voterNameCol] === voterName) {
        targetRow = i + 1;
        break;
      }
    }

    const row = [
      pollId,
      voterName,
      attendance,
      attendance === '참석' ? choice1Id : '',
      attendance === '참석' ? choice2Id : '',
      now
    ];

    if (targetRow > 0) {
      votes.getRange(targetRow, 1, 1, row.length).setValues([row]);
    } else {
      votes.appendRow(row);
    }

    return jsonResponse({ ok: true, updated: targetRow > 0 });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, app: 'what-to-eat-today' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
