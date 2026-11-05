/**
 * 삼중일기 ↔ 구글  (Google Apps Script)
 *
 * 1) 달력 연동: 삼중일기 일정·근무·작업 기록 → 구글 캘린더 '삼중일기' (5분마다)
 * 2) 자동 백업: 매일 새벽 4시 → 구글 드라이브 '삼중일기 백업' 폴더(JSON) + 구글 시트 '삼중일기 기록'
 * 3) 도굴꾼 코워크 근무표 → 삼중일기 라운지돌돌 근무 (30분마다, 스크립트 속성 COWORK_JSON 이 있을 때)
 *
 * 처음 한 번: 프로젝트 설정에서 스크립트 속성 SB_EMAIL, SB_PASSWORD 를 넣고 setup 을 실행.
 */

const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const CAL_NAME = '삼중일기';
const FOLDER_NAME = '삼중일기 백업';
const SHEET_NAME = '삼중일기 기록';
const KEEP_DAYS = 90;               // 드라이브에 남길 백업 개수(일)
const PAST_DAYS = 60, FUTURE_DAYS = 365;  // 캘린더에 맞출 기간
const SHORT = { 언더워터: '워터', 라운지돌돌: '돌돌', 다락: '다락', 연우재: '연우재' };

// ───────── 처음 한 번 실행
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SB_EMAIL') || !p.getProperty('SB_PASSWORD')) throw new Error('프로젝트 설정 > 스크립트 속성에 SB_EMAIL, SB_PASSWORD 를 먼저 넣어 주세요.');
  token_(true);                     // 로그인 확인
  calendar_(); folder_(); sheet_();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCalendar').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('backup').timeBased().everyDays(1).atHour(4).inTimezone('Asia/Seoul').create();
  if (p.getProperty('COWORK_JSON')) { ScriptApp.newTrigger('syncCowork').timeBased().everyMinutes(30).create(); syncCowork(); }
  syncCalendar();
  backup();
  Logger.log('준비 끝! 캘린더 "%s", 드라이브 폴더 "%s", 시트 "%s"', CAL_NAME, FOLDER_NAME, SHEET_NAME);
}

// ───────── Supabase
function token_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) { const t = cache.get('sb_token'); if (t) return t; }
  const p = PropertiesService.getScriptProperties();
  const r = UrlFetchApp.fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_KEY },
    payload: JSON.stringify({ email: p.getProperty('SB_EMAIL'), password: p.getProperty('SB_PASSWORD') }),
  });
  const j = JSON.parse(r.getContentText());
  if (!j.access_token) throw new Error('삼중일기 로그인 실패: ' + (j.error_description || j.msg || r.getContentText()));
  cache.put('sb_token', j.access_token, Math.min(3000, (j.expires_in || 3600) - 300));
  return j.access_token;
}
function all_(table, query) {
  const tk = token_();
  let out = [];
  for (let off = 0; ; off += 1000) {
    const r = UrlFetchApp.fetch(`${SB_URL}/rest/v1/${table}?select=*${query ? '&' + query : ''}&limit=1000&offset=${off}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${tk}` }, muteHttpExceptions: true,
    });
    const j = JSON.parse(r.getContentText());
    if (!Array.isArray(j)) throw new Error(`${table} 불러오기 실패: ${r.getContentText()}`);
    out = out.concat(j);
    if (j.length < 1000) return out;
  }
}

function rest_(method, path, body) {
  const r = UrlFetchApp.fetch(`${SB_URL}/rest/v1/${path}`, {
    method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token_()}`, Prefer: 'return=minimal' },
    payload: body ? JSON.stringify(body) : undefined,
  });
  if (r.getResponseCode() >= 300) throw new Error(`${method} ${path} 실패: ${r.getContentText()}`);
}

// ───────── 날짜 도우미 (모두 한국 시간)
const pad_ = (n) => String(n).padStart(2, '0');
const ymd_ = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
const kst_ = (day, min) => { const d = new Date(`${day}T00:00:00+09:00`); return new Date(d.getTime() + min * 60000); };
const hm_ = (m) => `${pad_(Math.floor((m % 1440) / 60))}:${pad_(m % 60)}`;

// ───────── 1) 구글 캘린더 맞추기
function calendar_() {
  const found = CalendarApp.getCalendarsByName(CAL_NAME);
  const cal = found.length ? found[0] : CalendarApp.createCalendar(CAL_NAME, { timeZone: 'Asia/Seoul', color: CalendarApp.Color.GREEN });
  return cal;
}
function syncCalendar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const cal = calendar_();
    const now = new Date();
    const from = ymd_(new Date(now.getTime() - PAST_DAYS * 864e5)), to = ymd_(new Date(now.getTime() + FUTURE_DAYS * 864e5));
    const events = all_('events', `day=gte.${from}&day=lte.${to}`);
    const sessions = all_('sessions', `day=gte.${from}&day=lte.${to}`).filter((s) => s.end_at);
    const projects = all_('projects');
    const pname = (id) => (projects.find((p) => p.id === id) || {}).name;

    // 삼중일기 쪽에서 만들어야 할 모양
    const want = {};
    for (const e of events) {
      const title = e.kind === 'work' ? (SHORT[e.place] || e.title) : e.kind === 'task' ? `작업 · ${e.title}` : e.title;
      const allDay = e.start_min == null;
      const start = allDay ? null : kst_(e.day, e.start_min);
      const end = allDay ? null : kst_(e.day, e.end_min != null ? e.end_min : e.start_min + 60);
      want['e:' + e.id] = { title, allDay, day: e.day, start, end, color: e.kind === 'work' ? '8' : e.kind === 'task' ? '10' : '',
        desc: e.kind === 'task' && pname(e.project_id) ? '프로젝트: ' + pname(e.project_id) : '' };
    }
    for (const s of sessions) {
      want['s:' + s.id] = { title: `작업 기록 · ${pname(s.project_id) || s.title || '작업'}`, allDay: false, day: s.day,
        start: new Date(s.start_at), end: new Date(s.end_at), color: '2', desc: '' };
    }
    const sig = (w) => [w.title, w.allDay, w.day, w.start && w.start.getTime(), w.end && w.end.getTime(), w.color, w.desc].join('|');

    // 구글 캘린더에 이미 있는 것
    const have = {};
    for (const ev of cal.getEvents(kst_(from, 0), kst_(to, 1440))) {
      const k = ev.getTag('sj');
      if (!k) continue;
      if (have[k]) { ev.deleteEvent(); continue; }      // 혹시 생긴 중복 정리
      have[k] = ev;
    }

    let made = 0, changed = 0, removed = 0;
    for (const [k, w] of Object.entries(want)) {
      const s = sig(w);
      let ev = have[k];
      if (ev && ev.getTag('sjsig') === s) { delete have[k]; continue; }
      if (ev) { ev.deleteEvent(); delete have[k]; changed++; } else made++;
      ev = w.allDay ? cal.createAllDayEvent(w.title, new Date(`${w.day}T12:00:00+09:00`), { description: w.desc })
        : cal.createEvent(w.title, w.start, w.end, { description: w.desc });
      if (w.color) ev.setColor(w.color);
      ev.setTag('sj', k); ev.setTag('sjsig', s);
      Utilities.sleep(150);
    }
    for (const ev of Object.values(have)) { ev.deleteEvent(); removed++; Utilities.sleep(100); }
    if (made || changed || removed) Logger.log('캘린더: 새로 %s · 바뀜 %s · 지움 %s', made, changed, removed);
  } finally { lock.releaseLock(); }
}

// ───────── 2) 백업
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function sheet_() {
  const it = DriveApp.getFilesByName(SHEET_NAME);
  while (it.hasNext()) { const f = it.next(); if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId()); }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder_());
  return ss;
}
function backup() {
  const tables = ['todos', 'events', 'days', 'sessions', 'projects', 'plants', 'plant_logs'];
  const data = {};
  for (const t of tables) data[t] = all_(t);
  const stamp = ymd_(new Date());

  // 드라이브: 날짜별 JSON (오래된 것은 정리)
  const folder = folder_();
  const name = `삼중일기-${stamp}.json`;
  const old = folder.getFilesByName(name); while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(name, JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 1), MimeType.PLAIN_TEXT);
  const files = []; const all = folder.getFiles();
  while (all.hasNext()) { const f = all.next(); if (/^삼중일기-\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) files.push(f); }
  files.sort((a, b) => (a.getName() < b.getName() ? 1 : -1)).slice(KEEP_DAYS).forEach((f) => f.setTrashed(true));

  // 구글 시트: 지금 상태를 표로
  const pname = (id) => (data.projects.find((p) => p.id === id) || {}).name || '';
  const plname = (id) => (data.plants.find((p) => p.id === id) || {}).name || '';
  const KO = { task: '작업', event: '약속', work: '근무' }, ST = { active: '진행 중', done: '완료', archived: '보관', stopped: '중단' };
  const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  const iso = (v) => (v ? Utilities.formatDate(new Date(v), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : '');
  const mins = (s) => (s.end_at ? Math.round((new Date(s.end_at) - new Date(s.start_at)) / 60000) : '');
  const tabs = {
    '할 일': [['날짜', '할 일', '태그', '완료', '완료 시각'], ...data.todos.sort(byDay).map((r) => [r.day, r.text, r.tag || '', r.done ? 'O' : '', iso(r.done_at)])],
    '일정': [['날짜', '종류', '제목', '시작', '끝', '근무지', '프로젝트'], ...data.events.sort(byDay).map((r) => [r.day, KO[r.kind] || r.kind, r.title, r.start_min == null ? '' : hm_(r.start_min), r.end_min == null ? '' : hm_(r.end_min), r.place || '', pname(r.project_id)])],
    '작업 기록': [['날짜', '프로젝트', '시작', '끝', '분'], ...data.sessions.sort(byDay).map((r) => [r.day, pname(r.project_id) || r.title || '', iso(r.start_at), iso(r.end_at), mins(r)])],
    '일기': [['날짜', '일기'], ...data.days.filter((d) => d.diary && d.diary.trim()).sort(byDay).map((d) => [d.day, d.diary.trim()])],
    '프로젝트': [['이름', '상태', '분류', '함께한 사람', '결과물', '단계', '시작', '끝', '보수', '프로그램', '링크', '작가 노트'], ...data.projects.map((r) => [r.name, ST[r.status] || r.status, r.category || '', r.people || '', r.output || '', (r.stages || []).join(' > '), r.start_day || '', r.end_day || '', r.pay || '', r.programs || '', r.link || '', r.note || ''])],
    '식물': [['종류', '이름', '물 주기(일)', '추억의 전당', '보낸 날'], ...data.plants.map((r) => [r.species || '', r.name, r.interval_days || '', r.gone ? 'O' : '', r.gone_day || ''])],
    '식물 기록': [['날짜', '식물', '물', '메모'], ...data.plant_logs.sort(byDay).map((r) => [r.day, plname(r.plant_id), r.watered ? 'O' : '', r.memo || ''])],
  };
  const ss = sheet_();
  for (const [name, rows] of Object.entries(tabs)) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    sh.getRange(1, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows.map((r) => r.map((v) => String(v))));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  }
  const first = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  Logger.log('백업 끝: %s', name);
}

// ───────── 3) 도굴꾼 코워크 근무표 → 삼중일기 (라운지돌돌)
// 근무표가 기준: 근무표에 있는 날짜 범위(~ 오늘+31일)의 라운지돌돌 근무를 근무표와 똑같이 맞춤
const COWORK_PLACE = '라운지돌돌';
function coworkItems_() {
  const url = PropertiesService.getScriptProperties().getProperty('COWORK_JSON');
  if (!url) return null;
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error(`근무표를 못 불러왔어요 (${r.getResponseCode()}): ${r.getContentText().slice(0, 200)}`);
  const j = JSON.parse(r.getContentText());
  const list = Array.isArray(j) ? j : j.shifts || j.data || j.items || j.events || [];
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  return list.map((x) => {
    let day = x.date || x.day, s = x.start || x.start_time || x.startTime || x.from, e = x.end || x.end_time || x.endTime || x.to;
    if (s && /T/.test(s)) { const d = new Date(s); day = day || ymd_(d); s = Utilities.formatDate(d, 'Asia/Seoul', 'HH:mm'); }
    if (e && /T/.test(e)) e = Utilities.formatDate(new Date(e), 'Asia/Seoul', 'HH:mm');
    if (!day || !s || !e) return null;
    const a = toMin(s); let b = toMin(e); if (b <= a) b += 1440;
    return { day: String(day).slice(0, 10), start_min: a, end_min: b };
  }).filter(Boolean);
}
function syncCowork() {
  const items = coworkItems_();
  if (!items) return;
  if (!items.length) { Logger.log('근무표에 근무가 없어요'); return; }
  const days = items.map((x) => x.day).sort();
  const from = days[0], to = [days[days.length - 1], ymd_(new Date(Date.now() + 31 * 864e5))].sort()[1];
  const cur = all_('events', `kind=eq.work&place=eq.${encodeURIComponent(COWORK_PLACE)}&day=gte.${from}&day=lte.${to}`);
  const key = (x) => `${x.day}|${x.start_min}|${x.end_min}`;
  const want = new Set(items.map(key)), have = new Set(cur.map(key));
  const gone = cur.filter((x) => !want.has(key(x)));
  const add = items.filter((x, i, arr) => !have.has(key(x)) && arr.findIndex((y) => key(y) === key(x)) === i);
  if (gone.length) rest_('delete', `events?id=in.(${gone.map((x) => x.id).join(',')})`);
  if (add.length) rest_('post', 'events', add.map((x) => ({ ...x, title: COWORK_PLACE, kind: 'work', place: COWORK_PLACE })));
  if (gone.length || add.length) Logger.log('코워크 근무표: 새로 %s · 지움 %s (%s ~ %s)', add.length, gone.length, from, to);
}
// 근무표가 어떻게 읽히는지 보기만 (아무것도 바꾸지 않음)
function testCowork() {
  const items = coworkItems_();
  if (!items) { Logger.log('스크립트 속성에 COWORK_JSON 이 없어요'); return; }
  Logger.log('근무 %s개', items.length);
  items.slice(0, 10).forEach((x) => Logger.log('%s  %s–%s', x.day, hm_(x.start_min), hm_(x.end_min)));
}
