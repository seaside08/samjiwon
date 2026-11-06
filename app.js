// 삼중일기 — 1단계: 오늘 + 달력(월·주)
const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const DEMO = new URLSearchParams(location.search).has('demo');

// 근무지 — 기본 근무 시간(요일: [시작분, 끝분]), 일요일 0
const WORKPLACES = [
  { name: '언더워터', short: '워터', keys: ['언더워터', '워터'], shifts: { 1: [1020, 1350], 2: [1020, 1350] }, rate: 10320, payday: 10 },
  { name: '라운지돌돌', short: '돌돌', keys: ['라운지돌돌', '라운지', '돌돌'], shifts: { 4: [930, 1170], 5: [630, 1050] }, rate: 11000, payday: 25, juhu: true, holiday: '월요일' },
  { name: '다락', short: '다락', keys: ['다락'], shifts: { 6: [660, 840], 0: [660, 840] }, rate: 11000, payday: 0 }, // 0 = 말일
  // 보관함 (지금은 가지 않는 근무지)
  { name: '연우재', short: '연우재', keys: ['연우재'], shifts: { 1: [630, 870], 2: [630, 870], 3: [630, 870], 4: [630, 870], 5: [630, 870] }, rate: 11000, payday: null, archived: true },
];

const TABS = [
  ['today', '오늘'], ['cal', '달력'], ['projects', '프로젝트'], ['work', '근무'],
  ['diary', '일기'], ['plants', '식물'], ['stats', '통계'],
];
const SOON = {
  projects: 'PROJECTS / 프로젝트', work: 'WORK / 근무', diary: 'DIARY / 일기',
  plants: 'PLANTS / 식물', stats: 'STATS / 통계',
};
// 좁은 칸에서 쓰는 줄임말
const PROJ_SHORT = { 'toss 안정감 프로젝트': '피보테' };
const shortName = (t) => PROJ_SHORT[String(t || '').trim()] || PROJ_SHORT[String(t || '').trim().toLowerCase()] || t;
// 출근 시각 줄여 쓰기: 15:00→15, 16:30→163, 8:00→08, 9:20→920
function workCode(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (h >= 10) return m ? `${h}${Math.floor(m / 10)}` : `${h}`;
  return m ? `${h}${String(m).padStart(2, '0')}` : `0${h}`;
}
const WD_EN = ['日', '月', '火', '水', '木', '金', '土'];
const WD_HJ = ['日', '月', '火', '水', '木', '金', '土'];
const wdh = (i) => `<i class="hj">${WD_EN[i]}</i>`;

// ───────── 날짜 도우미
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayStr = () => ymd(new Date());
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const hm = (m) => { if (m > 1440) m -= 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const hShort = (m) => (m % 60 ? hm(m) : String(Math.floor(m / 60)));
const dur = (m) => { const h = Math.floor(m / 60), r = m % 60; return r ? `${h}H ${r}M` : `${h}H`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ───────── 상태
const S = {
  view: 'today', calMode: 'month',
  sel: todayStr(), month: null, week: null,
  todos: [], events: [], days: {},
  projects: [], sessions: [], plants: [], plogs: [], recent: [],
  proj: null, projArchive: false,
  addKind: 'task', addProj: null, addWp: null,
  diaryDay: todayStr(),
  plantEnd: todayStr(), plant: null, plantDay: todayStr(), plantGone: false, plantAdd: false,
  statDay: todayStr(),
  user: null, loaded: [null, null],
};
const PLANT_SEED = [
  ['스테파니아 에렉타', '괴근이', true], ['아레카 야자', '비쩍이'], ['둥지파초일엽', '둥지'], ['줄무늬페페로미아', '줄리아'],
  ['필레아 모리스 문밸리', '오마이갓비상사태', true], ['해마리아', '부들부들', true], ['솜사탕고사리', '솜고'], ['바질', '산바'],
  ['뱅갈고무나무', '영무고무'], ['금전수', '인천사는 아빠친구'], ['해피트리', '조정묵 꿈과 인생'], ['립살리스 미크란타', '박쥐'],
  ['금전수', '큰금'], ['금전수', '작은금'], ['보틀트리', '우살'],
].map(([species, name, gone], i) => ({ species, name, gone: !!gone, pos: i + 1 }));
S.month = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
S.week = mondayOf(new Date());

// ───────── 저장소 (Supabase / 데모)
let sb = null;
const api = DEMO ? demoApi() : {
  async list(table, from, to) {
    const { data, error } = await sb.from(table).select('*').gte('day', from).lte('day', to);
    if (error) throw error; return data;
  },
  async insert(table, row) {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw error; return data;
  },
  async update(table, id, patch) {
    const { error } = await sb.from(table).update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },
  async saveDay(day, patch) {
    const { error } = await sb.from('days').upsert({ user_id: S.user.id, day, ...patch, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
  async all(table) {
    let out = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from(table).select('*').range(i, i + 999);
      if (error) throw error;
      out = out.concat(data); if (data.length < 1000) return out;
    }
  },
  async insertMany(table, rows) {
    const { data, error } = await sb.from(table).insert(rows).select();
    if (error) throw error; return data;
  },
  async recentDiary() {
    const { data, error } = await sb.from('days').select('day,diary').not('diary', 'is', null).neq('diary', '').order('day', { ascending: false }).limit(8);
    if (error) throw error; return data;
  },
  async upsertLog(plant_id, day, patch) {
    const { data, error } = await sb.from('plant_logs').upsert({ user_id: S.user.id, plant_id, day, ...patch }, { onConflict: 'plant_id,day' }).select().single();
    if (error) throw error; return data;
  },
};

function demoApi() {
  const t = new Date(), d = (n) => ymd(addDays(t, n));
  const id = () => Math.random().toString(36).slice(2);
  const db = {
    todos: [
      { id: id(), day: d(0), text: '19:00까지 한 컷 스케치 끝내기', tag: '도굴꾼 워크', done: false, pos: 1 },
      { id: id(), day: d(0), text: '피보테 배경 2장 선화 정리', tag: '피보테', done: true, pos: 2 },
      { id: id(), day: d(0), text: '오리엉덩이 zine 표지 레이아웃', tag: 'zine', done: false, pos: 3 },
      { id: id(), day: d(1), text: '클래스 자료 메일', tag: null, done: false, pos: 1 },
    ],
    events: [
      { id: id(), day: d(0), start_min: 930, end_min: null, title: '성수 미팅', kind: 'event' },
      { id: id(), day: d(0), start_min: 780, end_min: 900, title: '피보테 배경', kind: 'event' },
      { id: id(), day: d(1), start_min: 930, end_min: 1170, title: '라운지돌돌', kind: 'work', place: '라운지돌돌' },
      { id: id(), day: d(2), start_min: 630, end_min: 1050, title: '라운지돌돌', kind: 'work', place: '라운지돌돌' },
      { id: id(), day: d(3), start_min: 660, end_min: 840, title: '다락', kind: 'work', place: '다락' },
      { id: id(), day: d(4), start_min: 660, end_min: 840, title: '다락', kind: 'work', place: '다락' },
      { id: id(), day: d(5), start_min: 1020, end_min: 1350, title: '언더워터', kind: 'work', place: '언더워터' },
      { id: id(), day: d(16), start_min: null, end_min: null, title: '아트페어', kind: 'event' },
    ],
    days: [{ day: d(0), vow: '오늘은 한 장만 제대로.', diary: '오전에 피보테 배경 채색을 시작했다. 색을 두 번 갈아엎었는데 세 번째가 마음에 든다.' },
      { day: d(-1), diary: '언더워터 마감하고 늦게 귀가. 손이 피곤함.' }, { day: d(-2), diary: '선화 끝. 피보테 1차 전달.' }],
    projects: [
      { id: 'p1', name: '피보테 배경 외주', stages: ['선화', '채색', '납품'], stage: 1, start_day: d(-15), end_day: d(16), pay: 400000, programs: '클립스튜디오, 포토샵', link: 'https://youtu.be/', note: '단편에 들어갈 배경 두 장.', status: 'active', pos: 1 , category: '외주', people: '스튜디오 피보테 (담당 김OO)', output: '배경 일러스트 2장 · 3840×2160 · 디지털'},
      { id: 'p2', name: '오리엉덩이 zine', stages: ['원고', '레이아웃', '인쇄·제본', '판매'], stage: 1, pay: 160000, status: 'active', pos: 2 },
      { id: 'p3', name: '지난 외주', stages: ['작업'], stage: 1, status: 'done', pos: 3 },
    ],
    sessions: [
      { id: id(), project_id: 'p1', title: '피보테 배경 외주', day: d(0), start_at: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 13).toISOString(), end_at: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 15, 10).toISOString() },
      { id: id(), project_id: 'p2', title: '오리엉덩이 zine', day: d(-1), start_at: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 11).toISOString(), end_at: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 14).toISOString() },
      { id: id(), project_id: 'p1', title: '피보테 배경 외주', day: d(0), start_at: new Date(Date.now() - 4930000).toISOString(), end_at: null },
    ],
    plants: [],
    plant_logs: [],
  };
  return {
    async list(table, from, to) { return db[table].filter((r) => r.day >= from && r.day <= to).map((r) => ({ ...r })); },
    async insert(table, row) { const r = { id: id(), ...row }; db[table].push(r); return { ...r }; },
    async update(table, rid, patch) { Object.assign(db[table].find((r) => r.id === rid), patch); },
    async remove(table, rid) { db[table] = db[table].filter((r) => r.id !== rid); },
    async saveDay(day, patch) { const r = db.days.find((x) => x.day === day); r ? Object.assign(r, patch) : db.days.push({ day, ...patch }); },
    async all(table) { return db[table].map((r) => ({ ...r })); },
    async insertMany(table, rows) { const out = rows.map((r) => ({ id: id(), ...r })); db[table].push(...out); return out.map((r) => ({ ...r })); },
    async recentDiary() { return db.days.filter((r) => r.diary).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 8).map((r) => ({ ...r })); },
    async upsertLog(plant_id, day, patch) {
      let r = db.plant_logs.find((x) => x.plant_id === plant_id && x.day === day);
      if (r) Object.assign(r, patch); else db.plant_logs.push((r = { id: id(), plant_id, day, watered: false, memo: null, ...patch }));
      return { ...r };
    },
  };
}

// ───────── 불러오기
function wantedRange() {
  const gs = addDays(S.month, -S.month.getDay());
  const ge = addDays(gs, 41);
  const ws = S.week, we = addDays(S.week, 6);
  const t = new Date(); const tm = mondayOf(t); const te = addDays(tm, 6);
  const sel = parseYmd(S.sel), dd = parseYmd(S.diaryDay), sd = parseYmd(S.statDay);
  const dm = new Date(dd.getFullYear(), dd.getMonth(), 1), dme = new Date(dd.getFullYear(), dd.getMonth() + 1, 0);
  const all = [gs, ge, ws, we, tm, te, sel, dm, dme, sd];
  return [ymd(new Date(Math.min(...all))), ymd(new Date(Math.max(...all)))];
}
let loading = null;
async function load() {
  if (!S.user) return;
  const [from, to] = wantedRange();
  const job = (async () => {
    try {
      const [lf, lt] = plantRange();
      const [todos, events, days, projects, sessions, plants, plogs, recent] = await Promise.all([
        api.list('todos', from, to), api.list('events', from, to), api.list('days', from, to),
        api.all('projects'), api.all('sessions'), api.all('plants'), api.list('plant_logs', lf, lt), api.recentDiary(),
      ]);
      S.todos = todos; S.events = events;
      S.days = Object.fromEntries(days.map((r) => [r.day, r]));
      S.projects = projects; S.sessions = sessions; S.plants = plants; S.plogs = plogs; S.recent = recent;
      S.plogRange = [lf, lt];
      if (!plants.length && !S.seeded) { S.seeded = true; S.plants = await api.insertMany('plants', PLANT_SEED); }
      // 금전수는 매달 10일 물 (아직 물 주기를 안 정한 금전수만)
      for (const pl of S.plants.filter((x) => x.species === '금전수' && x.interval_days == null && !x.gone)) {
        pl.interval_days = -10; api.update('plants', pl.id, { interval_days: -10 }).catch(fail);
      }
      S.loaded = [from, to];
      waterTodo();
      render();
    } catch (e) { fail(e); }
  })();
  loading = job; return job;
}
function plantRange() {
  const e = parseYmd(S.plantEnd), t = new Date();
  return [ymd(new Date(Math.min(+addDays(e, -28), +addDays(t, -150)))), ymd(new Date(Math.max(+addDays(e, 28), +t)))];
}
function ensureLoaded() {
  const [from, to] = wantedRange(), [lf, lt] = plantRange();
  if (!S.loaded[0] || from < S.loaded[0] || to > S.loaded[1] || !S.plogRange || lf < S.plogRange[0] || lt > S.plogRange[1]) load();
}
function fail(e) {
  console.error(e);
  toast('저장하지 못했어요 · ' + (e?.message || e));
}
let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:absolute;left:78px;bottom:34px;font-size:13px;color:#e0352b;max-width:700px'; board.appendChild(el); }
  el.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 5000);
}

// ───────── 데이터 도우미
const todosOf = (day) => S.todos.filter((t) => t.day === day).sort((a, b) => a.pos - b.pos);
const eventsOf = (day) => S.events.filter((e) => e.day === day).sort((a, b) => (a.start_min ?? -1) - (b.start_min ?? -1));
const workMin = (e) => (e.kind === 'work' && e.start_min != null && e.end_min != null ? Math.max(0, e.end_min - e.start_min) : 0);
const wpOf = (e) => WORKPLACES.find((w) => w.name === e.place);
const sessMin = (s) => Math.max(0, Math.round(((s.end_at ? Date.parse(s.end_at) : Date.now()) - Date.parse(s.start_at)) / 60000));
const sessOf = (day) => S.sessions.filter((s) => s.day === day).sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
const running = () => S.sessions.find((s) => !s.end_at);
// 작업 일정 (kind: task)
const isWorkEv = (e) => e.kind === 'task';
const projOf = (id) => S.projects.find((p) => p.id === id);
const sessLabel = (s) => projOf(s.project_id)?.name || s.title || '작업';
const minOfDay = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const projMin = (p) => S.sessions.filter((s) => s.project_id === p.id).reduce((a, s) => a + sessMin(s), 0);
const dayWork = (day) => eventsOf(day).reduce((a, e) => a + workMin(e), 0);
const daySess = (day) => sessOf(day).reduce((a, s) => a + sessMin(s), 0);
const elapsed = (s) => { const sec = Math.max(0, Math.floor((Date.now() - Date.parse(s.start_at)) / 1000)); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`; };
const md = (ds) => { const d = parseYmd(ds); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; };
const firstLine = (t) => { const s = String(t || '').trim().split('\n')[0]; const m = s.match(/^.*?[.!?。](?=\s|$)/); return (m ? m[0] : s).slice(0, 44); };

function parseTodo(raw) {
  const s = raw.trim(); const i = s.indexOf('#');
  if (i < 0) return { text: s, tag: null };
  return { text: s.slice(0, i).trim() || s.slice(i + 1).trim(), tag: s.slice(i + 1).trim() || null };
}
const todoInput = (t) => t.text + (t.tag ? ` #${t.tag}` : '');

const T = '(\\d{1,2})(?::(\\d{2}))?시?';
const RANGE = T + '(?:\\s*[-~–—]\\s*' + T + ')?';
const toMin = (h, m) => { h = +h; m = +(m || 0); return h <= 24 && m < 60 ? h * 60 + m : null; };
function splitTime(raw) {
  let s = raw.trim(), start = null, end = null, m;
  if ((m = s.match(new RegExp('^' + RANGE + '(?=\\s|$)')))) {
    start = toMin(m[1], m[2]); end = m[3] ? toMin(m[3], m[4]) : null; s = s.slice(m[0].length).trim();
  } else if ((m = s.match(new RegExp('(?:^|\\s)' + RANGE + '$'))) && (m[2] || m[3])) {
    start = toMin(m[1], m[2]); end = m[3] ? toMin(m[3], m[4]) : null; s = s.slice(0, s.length - m[0].length).trim();
  }
  if (start == null) end = null;
  if (end != null && end <= start) end += 24 * 60;
  return { rest: s, start_min: start, end_min: end };
}
// 달력에서 고른 종류(작업·약속·근무)대로 일정 만들기
function buildEvent(raw, day, kind) {
  const t = splitTime(raw);
  if (kind === 'task') {
    const p = projOf(S.addProj) || activeProjects()[0];
    const title = t.rest || p?.name; if (!title) return null;
    return { title, start_min: t.start_min, end_min: t.end_min, kind: 'task', place: null, project_id: p?.id || null };
  }
  if (kind === 'work') {
    const w = WORKPLACES.find((x) => x.name === S.addWp) || WORKPLACES[0];
    let { start_min, end_min } = t;
    if (start_min == null) [start_min, end_min] = w.shifts[parseYmd(day).getDay()] || Object.values(w.shifts)[0];
    else if (end_min == null) return null;
    return { title: w.name, start_min, end_min, kind: 'work', place: w.name };
  }
  if (!t.rest) return null;
  return { title: t.rest, start_min: t.start_min, end_min: t.end_min, kind: 'event', place: null };
}
const activeProjects = () => S.projects.filter((p) => p.status === 'active').sort((a, b) => a.pos - b.pos);
const KINDS = [['task', '작업'], ['event', '약속'], ['work', '근무']];

function parseEvent(raw, day) {
  let s = raw.trim(), start = null, end = null, m;
  if ((m = s.match(new RegExp('^' + RANGE + '(?=\\s|$)')))) {
    start = toMin(m[1], m[2]); end = m[3] ? toMin(m[3], m[4]) : null; s = s.slice(m[0].length).trim();
  } else if ((m = s.match(new RegExp('(?:^|\\s)' + RANGE + '$'))) && (m[2] || m[3])) {
    start = toMin(m[1], m[2]); end = m[3] ? toMin(m[3], m[4]) : null; s = s.slice(0, s.length - m[0].length).trim();
  }
  if (start == null) end = null;
  if (end != null && end <= start) end += 24 * 60;
  let kind = 'event', place = null;
  const wp = WORKPLACES.find((w) => w.keys.some((k) => s === k || s.startsWith(k + ' ')));
  if (wp) {
    kind = 'work'; place = wp.name;
    const key = wp.keys.find((k) => s === k || s.startsWith(k + ' '));
    s = wp.name + s.slice(key.length);
    if (start == null) {
      const sh = wp.shifts[parseYmd(day).getDay()] || Object.values(wp.shifts)[0];
      [start, end] = sh;
    }
  }
  if (!s) return null;
  return { title: s, start_min: start, end_min: end, kind, place };
}
const eventInput = (e) => (e.start_min != null ? hm(e.start_min) + (e.end_min != null ? '-' + hm(e.end_min) : '') + ' ' : '') + e.title;

// ───────── 그리기
const board = document.getElementById('board');
const X = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0L10 10M10 0L0 10" stroke="#e0352b" stroke-width="2.2"/></svg>';

function header(sum) {
  const d = new Date();
  return `<header class="hd"><span id="date">${dateLabel(d)}</span><span id="clock" data-act="sync" role="button" aria-label="동기화">${clockLabel(d)}</span><span id="syncing" class="sync"${S.syncing ? '' : ' hidden'}>&#8635;</span><span class="sum">${sum || ''}</span></header>`;
}
const dateLabel = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${wdh(d.getDay())}`;
const clockLabel = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function nav() {
  return `<nav class="tabs" aria-label="화면">${TABS.map(([k, l]) =>
    `<a href="#${k}" class="${S.view === k ? 'on riso2' : ''}"${S.view === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
}

function todoRow(t) {
  return `<div class="todo${t.done ? ' done' : ''}" data-id="${t.id}">
    <button class="ck" data-act="toggle" aria-label="${t.done ? '완료 취소' : '완료로 표시'}">${t.done ? X : ''}</button>
    <span class="tx" data-act="edit-todo">${esc(t.text)}</span>
    ${t.tag ? `<span class="tag riso-t">#${esc(t.tag)}</span>` : ''}
  </div>`;
}
const addForm = (kind, label, style = '') =>
  `<form class="add" data-add="${kind}" style="${style}"><span class="plus" aria-hidden="true">+</span><input aria-label="${label}" autocomplete="off" enterkeyhint="done"></form>`;

function viewToday() {
  const day = todayStr();
  const todos = todosOf(day), done = todos.filter((t) => t.done).length;
  const evs = eventsOf(day);
  const work = evs.reduce((a, e) => a + workMin(e), 0);
  const mon = mondayOf(new Date());
  let weekSess = 0;
  for (let i = 0; i < 7; i++) weekSess += daySess(ymd(addDays(mon, i)));
  const vow = S.days[day]?.vow || '';
  const d = new Date();
  const sess = daySess(day), r = running();
  const items = [
    ...evs.map((e) => ({ k: e.start_min ?? -1, h: `<div class="e" data-act="edit-event" data-id="${e.id}"><span class="t">${e.start_min != null ? workCode(e.start_min) : ''}</span><span class="n">${esc(e.title)}</span><span class="x">${e.end_min != null ? '~' + workCode(e.end_min) : ''}</span></div>` })),
    ...sessOf(day).map((s) => ({ k: minOfDay(s.start_at), h: `<div class="e"${s.end_at ? ` data-act="edit-sess" data-id="${s.id}"` : ''}><span class="t">${workCode(minOfDay(s.start_at))}</span><span class="n">작업 &#183; ${esc(sessLabel(s))}</span><span class="x">${s.end_at ? '~' + workCode(minOfDay(s.end_at)) : 'REC'}</span></div>` })),
  ].sort((a, b) => a.k - b.k);
  const active = S.projects.filter((p) => p.status === 'active').sort((a, b) => a.pos - b.pos);
  // 지금 하는 작업: 돌고 있는 기록 → 가장 최근 기록 → 진행 중 첫 프로젝트
  const lastS = S.sessions.slice().sort((a, b) => (a.start_at < b.start_at ? 1 : -1))[0];
  const cur = (r && sessLabel(r)) || (lastS && projOf(lastS.project_id)?.status === 'active' && sessLabel(lastS)) || active[0]?.name;
  const now = `<button class="bk nowbtn" data-act="log-open" aria-label="작업시간 기록하기">NOW WORKING${cur ? ` &#8212; ${esc(cur)}` : ''}</button>`;
  if (PHONE) return `${header('')}
  <section class="ph">
    <div class="row"><span class="bk">TODAY / 오늘 할 일</span><span class="red" style="font-size:16px">[ ${done} / ${todos.length} ]</span></div>
    <div class="todos">${todos.map(todoRow).join('')}</div>
    ${addForm('todo', '할 일 추가', 'margin-top:12px')}
    ${now}
    ${items.length ? `<div class="sched riso">${items.map((x) => x.h.replace(' data-act="go-day"', '')).join('')}</div>` : ''}
    <div class="ph-sum">작업 ${dur(sess)} &#183; 근무 ${dur(work)} &#183; 이번 주 작업 ${dur(weekSess)}</div>
  </section>`;
  return `${header('')}
  <div class="main" style="gap:36px">
    <section class="left">
      <div class="row"><span class="bk">TODAY / 오늘 할 일</span><span class="red" style="font-size:15px">[ ${done} / ${todos.length} ]</span></div>
      <div class="todos">${todos.map(todoRow).join('')}</div>
      ${addForm('todo', '할 일 추가', 'margin-top:14px;width:75%')}
    </section>
    <section class="today-side">
      <div style="flex:2 1 0"></div>
      ${now}
      <div class="sched riso">
        
        ${items.map((x) => x.h).join('')}
      </div>
      <div style="flex:1 1 0"></div>
      <div class="mini">작업 ${dur(sess)}<br>근무 ${dur(work)}<br>이번 주 작업 ${dur(weekSess)}</div>
    </section>
  </div>`;
}

function calCtl(title, prevLabel, nextLabel) {
  return `<div class="ctl"><span class="ttl">${title}</span>
    <span class="sw"><span class="arr"><button data-act="prev" aria-label="${prevLabel}">&#8592;</button><button data-act="next" aria-label="${nextLabel}">&#8594;</button></span>
    <a href="#cal" data-act="mode" data-mode="month" class="${S.calMode === 'month' ? 'riso3' : ''}">월</a>
    <a href="#cal" data-act="mode" data-mode="week" class="${S.calMode === 'week' ? 'riso3' : ''}">주</a></span></div>`;
}

function daySide() {
  const day = S.sel, d = parseYmd(day);
  const evs = eventsOf(day), todos = todosOf(day), done = todos.filter((t) => t.done).length;
  return `<section class="side">
    <span class="bk" style="margin-bottom:8px">${pad(d.getMonth() + 1)} / ${pad(d.getDate())} ${wdh(d.getDay())}</span>
    ${evs.map((e) => `<div class="ev" data-id="${e.id}" data-act="edit-event"><span class="t">${e.start_min != null ? workCode(e.start_min) : ''}</span><span class="n"><span class="${e.kind === 'task' ? 'rzs riso' : ''}">${esc(e.title)}</span>${e.end_min != null ? ' ~' + workCode(e.end_min) : ''}</span></div>`).join('')}
    ${sessOf(day).filter((s) => s.end_at).map((s) => `<div class="ev" data-id="${s.id}" data-act="edit-sess"><span class="t">${workCode(minOfDay(s.start_at))}</span><span class="n">작업 &#183; ${esc(sessLabel(s))} ~${workCode(minOfDay(s.end_at))}</span></div>`).join('')}
    <div class="kinds">${KINDS.map(([k, l]) => `<button data-act="ak" data-k="${k}" class="${S.addKind === k ? 'riso3' : ''}">${l}</button>`).join('')}</div>
    ${S.addKind === 'task' ? `<div class="opts">${activeProjects().map((p, i) => `<button data-act="ap" data-id="${p.id}" class="${(S.addProj ? S.addProj === p.id : i === 0) ? 'on' : ''}">${esc(p.name)}</button>`).join('') || '<span class="mu">진행 중인 프로젝트 없음</span>'}</div>` : ''}
    ${S.addKind === 'work' ? `<div class="opts">${WORKPLACES.filter((w) => !w.archived).map((w, i) => `<button data-act="aw" data-n="${w.name}" class="${(S.addWp ? S.addWp === w.name : i === 0) ? 'on' : ''}">${w.name}</button>`).join('')}</div>` : ''}
    ${addForm('event', '일정 추가', 'margin-top:2px')}
    <span class="lbl red">할 일 [ ${done} / ${todos.length} ]</span>
    <div class="todos">${todos.map(todoRow).join('')}</div>
  </section>`;
}

function viewMonth() {
  const m = S.month, y = m.getFullYear(), mo = m.getMonth();
  const gs = addDays(m, -m.getDay());
  const last = new Date(y, mo + 1, 0);
  const rows = Math.ceil((m.getDay() + last.getDate()) / 7);
  const today = todayStr();
  let workDays = 0, workTotal = 0, sessTotal = 0;
  for (let i = 1; i <= last.getDate(); i++) {
    const w = dayWork(ymd(new Date(y, mo, i)));
    sessTotal += daySess(ymd(new Date(y, mo, i)));
    if (w) { workDays++; workTotal += w; }
  }
  let grid = '';
  for (let r = 0; r < rows; r++) {
    grid += '<div class="wk">';
    for (let c = 0; c < 7; c++) {
      const d = addDays(gs, r * 7 + c), ds = ymd(d), inMonth = d.getMonth() === mo;
      const evs = eventsOf(ds), todos = todosOf(ds), done = todos.filter((t) => t.done).length;
      const cls = ds === today ? 'now' : (ds === S.sel ? 'pick' : '') + (inMonth ? '' : ' dim');
      grid += `<div class="cell" data-act="sel" data-day="${ds}"><b class="${cls}">${d.getDate()}</b>
        ${evs.map((e, i) => e.kind === 'work'
          ? `<span class="ln">${workCode(e.start_min)} ${esc(wpOf(e)?.short || e.title)}</span>`
          : e.start_min == null
            ? `<span class="ln">${esc(e.title)}</span>`
            : `<span class="ln${isWorkEv(e) ? ` rz ${['riso', 'riso2', 'riso3'][(d.getDate() + i) % 3]}` : ''}"><em class="tm">${workCode(e.start_min)} </em>${esc(shortName(e.title))}</span>`).join('')}
        ${Object.entries(sessOf(ds).reduce((a, s) => { const k = shortName(sessLabel(s)); a[k] = (a[k] || 0) + sessMin(s); return a; }, {})).map(([k, v], j) => `<span class="ln rz ${['riso3', 'riso', 'riso2'][(d.getDate() + j) % 3]}">${esc(k)} ${dur(v)}</span>`).join('')}
      </div>`;
    }
    grid += '</div>';
  }
  return `${header(`${mo + 1}월 근무 ${workDays}일 &#183; ${dur(workTotal)} &#183; 작업 ${dur(sessTotal)}`)}
  <div class="main">
    <section class="left" style="--rowh:${rows > 5 ? 96 : 110}px">
      ${calCtl(`${y}. ${pad(mo + 1)}`, '이전 달', '다음 달')}
      <div class="wd">${WD_HJ.map((w) => `<span>${w}</span>`).join('')}</div>
      ${grid}
    </section>
    ${daySide()}
  </div>`;
}

function viewWeek() {
  const ws = S.week, we = addDays(ws, 6), today = todayStr();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const HH = document.body.classList.contains('phone') ? 26 : 40; // 1시간 높이 (휴대폰은 한 화면에 들어오게)
  const H0 = 10 * 60, PX = HH / 60; // 10시부터
  let weekWork = 0, weekSess = 0;
  const allday = days.map((d) => eventsOf(ymd(d)).filter((e) => e.start_min == null));
  const hasAll = allday.some((a) => a.length);
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = days.map((d, i) => {
    const ds = ymd(d);
    let k = 0;
    // 겹치는 칸은 나란히 놓기
    const items = [];
    eventsOf(ds).filter((e) => e.start_min != null).forEach((e) => {
      weekWork += workMin(e);
      const plain = e.end_min == null || (e.kind !== 'work' && !isWorkEv(e));
      const cls = plain ? '' : e.kind === 'work' ? 'work' : ['riso', 'riso2', 'riso3'][(k++ + i) % 3];
      const t = `${workCode(e.start_min)}${e.end_min != null ? '&#8211;' + workCode(e.end_min) : ''}`;
      const nm = e.kind === 'work' ? (wpOf(e)?.short || e.title) : shortName(e.title);
      items.push({ a: e.start_min, b: plain ? e.start_min + 45 : e.end_min, plain, cls, body: plain ? `${workCode(e.start_min)}<br>${esc(nm)}` : `${esc(nm)}<br>${t}` });
    });
    sessOf(ds).forEach((s, j) => {
      weekSess += sessMin(s);
      const a = minOfDay(s.start_at), b = s.end_at ? minOfDay(s.end_at) : nowMin;
      items.push({ a, b: Math.max(b, a + 1), cls: ['riso', 'riso2', 'riso3'][(j + i + 1) % 3], body: `${esc(shortName(sessLabel(s)))}<br>${workCode(a)}&#8211;${s.end_at ? workCode(b) : ''}` });
    });
    items.sort((x, y) => x.a - y.a || y.b - x.b);
    const lanesEnd = []; let cluster = [], clusterEnd = -1;
    const flush = () => { const n = Math.max(1, ...cluster.map((x) => x.lane + 1)); cluster.forEach((x) => (x.n = n)); cluster = []; };
    for (const it of items) {
      if (it.a >= clusterEnd) { flush(); lanesEnd.length = 0; }
      let l = lanesEnd.findIndex((end) => end <= it.a); if (l < 0) l = lanesEnd.length;
      lanesEnd[l] = it.b; it.lane = l; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.b);
    }
    flush();
    const blks = items.map((it) => {
      const top = Math.max(0, (it.a - H0) * PX);
      const h = it.plain ? null : Math.max(26, Math.min(HH * 14, (it.b - H0) * PX) - top);
      const pos = it.n > 1 ? `left:calc(${(it.lane / it.n) * 100}% + 2px);right:auto;width:calc(${100 / it.n}% - 4px);` : '';
      return `<div class="blk ${it.cls}" style="${pos}top:${top}px;${h ? `height:${h}px` : ''}">${it.body}</div>`;
    }).join('');
    const line = ds === today && nowMin >= H0 ? `<div class="nowline" style="top:${(nowMin - H0) * PX}px"></div><div class="nowsq" style="top:${(nowMin - H0) * PX - 3}px"></div>` : '';
    return `<div class="col" data-act="sel" data-day="${ds}">${blks}${line}</div>`;
  });
  const heads = days.map((d) => {
    const ds = ymd(d);
    return `<span class="dh" data-act="sel" data-day="${ds}">${WD_HJ[d.getDay()]} <span class="n ${ds === today ? 'now' : ds === S.sel ? 'pick' : ''}">${pad(d.getDate())}</span></span>`;
  });
  const hours = [10, 12, 14, 16, 18, 20, 22].map((h, i) => `<span style="top:${4 + i * HH * 2}px">${h}</span>`).join('');
  return `${header(`이번 주 작업 ${dur(weekSess)} &#183; 근무 ${dur(weekWork)}`)}
  <div class="main">
    <section class="left">
      ${calCtl(`${pad(ws.getMonth() + 1)}. ${pad(ws.getDate())} &#8212; ${pad(we.getMonth() + 1)}. ${pad(we.getDate())}`, '이전 주', '다음 주')}
      <div class="wgrid">
        <span></span>${heads.join('')}
        ${hasAll ? '<span></span>' + allday.map((a, i) => `<div class="allday" data-act="sel" data-day="${ymd(days[i])}">${a.map((e) => `<span class="adl">${esc(e.title)}</span>`).join('')}</div>`).join('') : ''}
        <div class="hours" style="height:${HH * 14}px">${hours}</div>${cols.join('')}
      </div>
    </section>
    ${daySide()}
  </div>`;
}

// ───────── 근무
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const paydayLabel = (w) => (w.payday == null ? '&#8212;' : w.payday ? `${w.payday}일` : '말일');
function routineLabel(w) {
  const groups = {};
  for (const [d, [a, b]] of Object.entries(w.shifts)) (groups[`${a}-${b}`] ||= { a, b, days: [] }).days.push(+d);
  return Object.values(groups).map((g) => g.days.sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map((d) => KDAY[d]).join('&#183;') + ` ${hm(g.a)}&#8211;${hm(g.b)}`).join(' &#183; ');
}
// 한 달 근무 집계 (until: 이 날짜까지만, 포함)
function workStats(w, until) {
  const m = S.month, y = m.getFullYear(), mo = m.getMonth(), last = new Date(y, mo + 1, 0).getDate();
  let mins = 0, count = 0; const weeks = {};
  for (let i = 1; i <= last; i++) {
    const d = new Date(y, mo, i), ds = ymd(d);
    if (until && ds > until) break;
    for (const e of eventsOf(ds)) {
      if (e.kind !== 'work' || e.place !== w.name) continue;
      const mm = workMin(e); if (!mm) continue;
      mins += mm; count++;
      const wk = ymd(mondayOf(d)); weeks[wk] = (weeks[wk] || 0) + mm;
    }
  }
  const base = (mins / 60) * w.rate;
  // 주휴수당: 주마다 (주 근무시간 ÷ 40) × 8시간 × 시급, 최대 8시간
  const juhu = w.juhu ? Object.values(weeks).reduce((a, wm) => a + Math.min(8, (wm / 60 / 40) * 8) * w.rate, 0) : 0;
  return { mins, count, base, juhu, total: base + juhu };
}

function viewWork() {
  const m = S.month, mo = m.getMonth(), today = todayStr();
  const every = WORKPLACES.map((w) => ({ w, s: workStats(w), sofar: workStats(w, today) }));
  const sum = every.reduce((a, r) => ({ mins: a.mins + r.s.mins, total: a.total + r.s.total, sofar: a.sofar + r.sofar.total }), { mins: 0, total: 0, sofar: 0 });
  // 보관함이 아니면: 다니는 곳 + 이 달에 기록이 있는 보관 근무지
  const all = every.filter((r) => (S.wpArchive ? r.w.archived : !r.w.archived || r.s.mins > 0));
  const nArch = WORKPLACES.filter((w) => w.archived).length;
  const sel = (all.find((r) => r.w.name === S.wp) || all[0] || every[0]).w;
  const cur = every.find((r) => r.w === sel).s;
  const shown = all.reduce((a, r) => ({ mins: a.mins + r.s.mins, total: a.total + r.s.total }), { mins: 0, total: 0 });
  const isNow = m.getFullYear() === new Date().getFullYear() && mo === new Date().getMonth();
  const rows = all.map(({ w, s }) => `<div class="mr" data-act="wp" data-wp="${w.name}">
      <div style="display:flex;flex-direction:column"><span class="nm">${w === sel ? `<span class="riso-hl" style="padding:0 3px">${w.name}</span>` : w.name}</span>
      <span class="sub">${w.archived ? '그만둔 곳 &#183; ' : ''}${routineLabel(w)} &#183; ${won(w.rate)}${w.juhu ? ' &#183; 주휴' : ''}</span></div>
      <span class="r">${dur(s.mins)}</span><span class="r">${won(s.total)}</span><span class="r">${paydayLabel(w)}</span></div>`).join('');
  return `${header(`${mo + 1}월 ${isNow ? `지금까지 ${won(sum.sofar)} &#183; ` : ''}예상 ${won(sum.total)}`)}
  <div class="main">
    <section class="left">
      <div class="row"><span class="bk">WORK / ${S.wpArchive ? '보관함' : '근무'}</span><span style="font-size:15px">[ ${all.length} ]</span>
        <span style="margin-left:auto;font-size:22px;letter-spacing:-.01em">${m.getFullYear()}. ${pad(mo + 1)}</span>
        <span class="arr" style="display:flex;gap:8px;margin-left:10px;font-size:15px"><button data-act="prev" aria-label="이전 달">&#8592;</button><button data-act="next" aria-label="다음 달">&#8594;</button></span></div>
      <div class="mr hd2"><span>근무지 &#183; 기본 근무</span><span class="r">시간</span><span class="r">세전</span><span class="r">지급</span></div>
      ${rows}
      <div class="mr" style="border-top:3px solid #141414;border-bottom:1.5px solid #141414;cursor:default">
        <span class="nm">${mo + 1}월 합계</span><span class="r">${dur(shown.mins)}</span><span class="r">${won(shown.total)}</span><span class="r"></span></div>
      <button class="lk" data-act="wp-archive">${S.wpArchive ? '&#8592; 다니는 곳' : `보관함 [ ${nArch} ] &#8594;`}</button>
    </section>
    <section class="side">
      <span class="bk" style="margin-bottom:8px">${sel.name}</span>
      <div class="kv"><span>시급</span><span>${won(sel.rate)}</span></div>
      <div class="kv"><span>근무</span><span>${cur.count}회 &#183; ${dur(cur.mins)}</span></div>
      <div class="kv"><span>기본급</span><span>${won(cur.base)}</span></div>
      ${sel.juhu ? `<div class="kv"><span>주휴수당</span><span>${won(cur.juhu)}</span></div><div class="kv" style="font-size:13px"><span>주휴일</span><span>${sel.holiday}</span></div>` : ''}
      <span style="margin-top:14px;font-size:13px">${mo + 1}월 세전</span>
      <span style="font-size:34px;letter-spacing:-.01em">${won(cur.total)}</span>
      ${sel.payday === null ? '' : `<span style="font-size:13px">매월 ${paydayLabel(sel)} 지급</span>`}
      ${sel.archived ? '' : `<button class="btn" style="margin-top:18px" data-act="fill" data-wp="${sel.name}">${mo + 1}월 기본 근무 채우기</button>`}
    </section>
  </div>`;
}

async function fillRoutine(w) {
  const m = S.month, y = m.getFullYear(), mo = m.getMonth(), last = new Date(y, mo + 1, 0).getDate();
  const today = todayStr(); let n = 0;
  const rows = [];
  for (let i = 1; i <= last; i++) {
    const d = new Date(y, mo, i), ds = ymd(d), sh = w.shifts[d.getDay()];
    if (!sh || ds < today) continue;
    if (eventsOf(ds).some((e) => e.kind === 'work' && e.place === w.name)) continue;
    rows.push({ day: ds, start_min: sh[0], end_min: sh[1], title: w.name, kind: 'work', place: w.name });
  }
  for (const r of rows) {
    try { S.events.push(await api.insert('events', r)); n++; } catch (e) { fail(e); break; }
  }
  render();
  toast(n ? `${w.name} ${n}회를 달력에 넣었어요` : `${mo + 1}월에 더 넣을 ${w.name} 근무가 없어요`);
}

// ───────── 근무표 가져오기 (#import=… 링크)
// { from, to, work: [[day, 근무지, 시작분, 끝분], …] } — 기간 안의 기존 근무는 지우고 바꿔 넣음
// 가져올 일정 목록으로 정리: [{ day, kind, title, start_min, end_min, place }]
function impItems(I) {
  if (I.events) return I.events.map(([day, kind, title, a, b]) => ({ day, kind, title, start_min: a ?? null, end_min: b ?? null, place: kind === 'work' ? title : null }));
  return (I.work || []).map(([day, place, a, b]) => ({ day, kind: 'work', title: place, start_min: a, end_min: b, place }));
}
const impHit = (I, e) => (I.replace === 'all' ? true : e.kind === 'work' && (!I.places || I.places.includes(e.place)));
function viewImport() {
  const I = S.imp || { work: [] }, items = impItems(I);
  const old = S.events.filter((e) => impHit(I, e) && e.day >= I.from && e.day <= I.to).length;
  const rows = items.map((e) => {
    const d = parseYmd(e.day);
    const t = e.start_min == null ? '' : `${hm(e.start_min)}${e.end_min != null ? '&#8211;' + hm(e.end_min) : ''}`;
    return `<div class="ir"><span>${md(e.day)} ${wdh(d.getDay())}</span><span>${e.kind === 'work' ? '' : `<span class="mu">${KIND_KO[e.kind]}</span> `}${esc(e.title)}</span><span>${t}</span><span class="r">${e.kind === 'work' && e.end_min != null ? dur(e.end_min - e.start_min) : ''}</span></div>`;
  }).join('');
  const work = items.filter((e) => e.kind === 'work'), total = work.reduce((x, w) => x + (w.end_min - w.start_min), 0);
  return `${header(`일정 ${items.length}개 &#183; 근무 ${work.length}회 ${dur(total)}`)}
  <div class="main"><section class="left">
    <div class="row"><span class="bk">IMPORT / 일정 가져오기</span><span style="font-size:15px">${md(I.from)} &#8212; ${md(I.to)}</span></div>
    <div class="ilist">${rows}</div>
    <span style="margin-top:14px;font-size:13px">${old ? `이 기간에 이미 있는 ${I.replace === 'all' ? '일정' : (I.places ? I.places.join('·') + ' ' : '') + '근무'} ${old}개는 지우고 바꿔 넣어요` : ''}</span>
    <div style="display:flex;gap:16px;align-items:center;margin-top:14px"><button class="btn" data-act="imp-ok">달력에 넣기</button><button class="ul" data-act="imp-no">취소</button></div>
  </section></div>`;
}
async function runImport() {
  const I = S.imp; if (!I) return;
  const items = impItems(I);
  try {
    const cur = await api.list('events', I.from, I.to);
    for (const e of cur.filter((x) => impHit(I, x))) await api.remove('events', e.id);
    for (let k = 0; k < items.length; k += 200) await api.insertMany('events', items.slice(k, k + 200));
    S.imp = null; S.loaded = [null, null];
    S.month = new Date(parseYmd(I.from).getFullYear(), parseYmd(I.from).getMonth(), 1);
    S.sel = I.from; location.hash = I.events ? '#cal' : '#work';
    toast(`일정 ${items.length}개를 달력에 넣었어요`);
  } catch (e) { fail(e); }
}

// ───────── 백업 (zip: CSV · 일기 · 캘린더 · JSON)
const csvCell = (v) => { if (v == null) return ''; const t = Array.isArray(v) ? v.join(' > ') : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function toCSV(rows, cols) {
  return '\ufeff' + [cols.map((c) => c[1]).join(','), ...rows.map((r) => cols.map(([k, , f]) => csvCell(f ? f(r) : r[k])).join(','))].join('\r\n');
}
const isoLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${ymd(d)} ${hm(d.getHours() * 60 + d.getMinutes())}`; };
const icsEsc = (t) => String(t || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
function toICS(events, projects) {
  const dt = (day, min) => { const d = parseYmd(day); d.setMinutes(min); return `${ymd(d).replace(/-/g, '')}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//samjung//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:삼중일기', 'X-WR-TIMEZONE:Asia/Seoul'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@samjung`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (e.start_min == null) {
      lines.push(`DTSTART;VALUE=DATE:${e.day.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymd(addDays(parseYmd(e.day), 1)).replace(/-/g, '')}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Seoul:${dt(e.day, e.start_min)}`, `DTEND;TZID=Asia/Seoul:${dt(e.day, e.end_min ?? e.start_min + 60)}`);
    }
    const p = projects.find((x) => x.id === e.project_id);
    lines.push(`SUMMARY:${icsEsc((e.kind === 'work' ? '근무 · ' : e.kind === 'task' ? '작업 · ' : '') + e.title)}`);
    if (p) lines.push(`DESCRIPTION:${icsEsc('프로젝트: ' + p.name)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
async function backup(btn) {
  btn.disabled = true; btn.textContent = '모으는 중…';
  try {
    const [todos, events, days, sessions, projects, plants, plogs] = await Promise.all(
      ['todos', 'events', 'days', 'sessions', 'projects', 'plants', 'plant_logs'].map((t) => api.all(t)));
    const byDay = (a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
    const pname = (id) => projects.find((p) => p.id === id)?.name || '';
    const plname = (id) => plants.find((p) => p.id === id)?.name || '';
    const KO = { task: '작업', event: '약속', work: '근무' };
    const ST = { active: '진행 중', done: '완료', archived: '보관', stopped: '중단' };
    const diary = days.filter((d) => d.diary && d.diary.trim()).sort(byDay)
      .map((d) => `## ${d.day} ${WD_EN[parseYmd(d.day).getDay()]}\n\n${d.diary.trim()}\n`).join('\n');
    if (!window.JSZip) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'vendor/jszip.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    const JSZip = window.JSZip;
    const z = new JSZip(), stamp = todayStr().replace(/-/g, '');
    const f = z.folder(`삼중일기-백업-${stamp}`);
    f.file('할일.csv', toCSV(todos.sort(byDay), [['day', '날짜'], ['text', '할 일'], ['tag', '태그'], ['done', '완료', (r) => (r.done ? 'O' : '')], ['done_at', '완료 시각', (r) => isoLocal(r.done_at)]]));
    f.file('일정.csv', toCSV(events.sort(byDay), [['day', '날짜'], ['kind', '종류', (r) => KO[r.kind] || r.kind], ['title', '제목'], ['start_min', '시작', (r) => (r.start_min == null ? '' : hm(r.start_min))], ['end_min', '끝', (r) => (r.end_min == null ? '' : hm(r.end_min))], ['place', '근무지'], ['project_id', '프로젝트', (r) => pname(r.project_id)]]));
    f.file('작업기록.csv', toCSV(sessions.sort(byDay), [['day', '날짜'], ['project_id', '프로젝트', (r) => pname(r.project_id) || r.title], ['start_at', '시작', (r) => isoLocal(r.start_at)], ['end_at', '끝', (r) => isoLocal(r.end_at)], ['min', '분', (r) => (r.end_at ? sessMin(r) : '')]]));
    f.file('프로젝트.csv', toCSV(projects, [['name', '이름'], ['status', '상태', (r) => ST[r.status] || r.status], ['category', '분류'], ['people', '함께한 사람'], ['output', '결과물'], ['stages', '단계'], ['start_day', '시작'], ['end_day', '끝'], ['pay', '보수'], ['programs', '프로그램'], ['link', '링크'], ['note', '작가 노트'], ['min', '작업 분', (r) => sessions.filter((x) => x.project_id === r.id).reduce((a, x) => a + (x.end_at ? sessMin(x) : 0), 0)]]));
    f.file('식물.csv', toCSV(plants, [['species', '종류'], ['name', '이름'], ['interval_days', '물 주기(일)'], ['gone', '추억의 전당', (r) => (r.gone ? 'O' : '')], ['gone_day', '보낸 날']]));
    f.file('식물기록.csv', toCSV(plogs.sort(byDay), [['day', '날짜'], ['plant_id', '식물', (r) => plname(r.plant_id)], ['watered', '물', (r) => (r.watered ? 'O' : '')], ['memo', '메모']]));
    f.file('일기.md', `# 삼중일기 · 일기\n\n${diary}`);
    f.file('일정.ics', toICS(events, projects));
    f.file('전체.json', JSON.stringify({ exported_at: new Date().toISOString(), todos, events, days, sessions, projects, plants, plant_logs: plogs }, null, 1));
    const blob = await z.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `삼중일기-백업-${stamp}.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    btn.textContent = '백업 받았어요';
  } catch (e) { fail(e); btn.textContent = '백업 받기'; }
  btn.disabled = false;
}

function viewSoon() {
  return `${header('')}
  <div class="main"><section class="left">
    <div class="row"><span class="bk">${SOON[S.view]}</span><span class="soon">준비 중</span></div>
  </section></div>`;
}

function viewLogin(msg = '') {
  board.innerHTML = `${header('')}
  <div class="main"><section class="left">
    <div class="row"><span class="bk">삼중일기</span></div>
    <form class="login" id="login">
      <input type="email" name="email" aria-label="이메일" autocomplete="username" required>
      <input type="password" name="pw" aria-label="비밀번호" autocomplete="current-password" required>
      <button class="btn">들어가기</button>
      <span class="red" style="font-size:13px">${esc(msg)}</span>
    </form>
  </section></div>`;
  board.querySelector('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value });
    if (error) viewLogin('이메일이나 비밀번호를 다시 확인해 주세요');
  });
}

function render(force) {
  if (!S.user) return;
  if (S.sheet && !force) { pendingRender = true; return; }
  // 편집 중이면 다시 그리지 않음
  const a = document.activeElement;
  if (!force && a && board.contains(a) && (a.tagName === 'INPUT' || a.isContentEditable) && (a.value || a.textContent)) { pendingRender = true; return; }
  if (dialDrag) { pendingRender = true; return; }
  pendingRender = false;
  let html;
  if (S.view === 'today') html = viewToday();
  else if (S.view === 'cal') html = S.calMode === 'month' ? viewMonth() : viewWeek();
  else if (S.view === 'work') html = viewWork();
  else if (S.view === 'projects') html = viewProjects();
  else if (S.view === 'diary') html = viewDiary();
  else if (S.view === 'plants') html = viewPlants();
  else if (S.view === 'stats') html = viewStats();
  else if (S.view === 'import') html = viewImport();
  else html = viewSoon();
  const focusAdd = a && a.closest && a.closest('form[data-add]')?.dataset.add;
  board.innerHTML = html + nav() + sheetHTML();
  tilt();
  plantScroll();
  if (S.sheet) initWheels();
  else if (focusAdd) board.querySelector(`form[data-add="${focusAdd}"] input`)?.focus();
}
let pendingRender = false;

// 식물 타임라인: 처음엔 오늘이 가운데, 그 뒤로는 보던 자리 그대로
let plantX = null;
function plantScroll() {
  const g = board.querySelector('.tl-sc'); if (!g) return;
  const t = g.querySelector('.tday');
  if (plantX == null && t) plantX = t.offsetLeft - g.clientWidth / 2;
  g.scrollLeft = plantX ?? 0;
  g.addEventListener('scroll', () => { plantX = g.scrollLeft; }, { passive: true });
}

// 초록 상자를 살짝, 상자마다 다른 각도로 기울이기 (글자로 정해서 다시 그려도 같은 각도)
function tilt() {
  board.querySelectorAll('.sched, .ptitle, .ctl .sw a.riso3, .kinds button.riso3, .sh-tg button.riso3').forEach((el) => {
    let h = 7; for (const ch of el.textContent.trim()) h = (h * 31 + ch.charCodeAt(0)) % 997;
    const deg = ((h % 9) - 4) * 0.45 || 0.9;          // -1.8° ~ 1.8°
    el.style.transform = `rotate(${deg}deg)`;
  });
}

// ───────── 동작
async function addTodo(day, raw) {
  const p = parseTodo(raw); if (!p.text) return;
  const pos = Math.max(0, ...todosOf(day).map((t) => t.pos)) + 1;
  const tmp = { id: 'tmp' + Date.now(), day, ...p, done: false, pos };
  S.todos.push(tmp); render();
  try { Object.assign(tmp, await api.insert('todos', { day, ...p, pos })); } catch (e) { fail(e); S.todos = S.todos.filter((t) => t !== tmp); }
  render();
}
async function addEvent(day, raw) {
  const p = buildEvent(raw, day, S.addKind);
  if (!p) { toast(S.addKind === 'work' ? '근무는 시작과 끝 시간을 함께 적어 주세요 (예: 12-18)' : '제목을 적어 주세요'); return; }
  const tmp = { id: 'tmp' + Date.now(), day, ...p };
  S.events.push(tmp); render();
  try { Object.assign(tmp, await api.insert('events', { day, ...p })); } catch (e) { fail(e); S.events = S.events.filter((x) => x !== tmp); }
  render();
}

board.addEventListener('submit', (e) => {
  if (e.target.closest('form[data-sh]')) { e.preventDefault(); sheetDo('save-edit'); return; }
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const input = f.querySelector('input'), v = input.value.trim();
  const k = f.dataset.add;
  if (k === 'pmemo') { input.blur(); return; }
  input.value = '';
  if (k === 'event' && !v && S.addKind !== 'event') { addEvent(S.sel, ''); return; }
  if (!v) return;
  if (k === 'plant') { handleAddMore(k, v); return; }
  if (k === 'todo') addTodo(todayStr(), v);
  else if (k === 'todo-sel') addTodo(S.sel, v);
  else if (k === 'event') addEvent(S.sel, v);
});

// 이전 / 다음 (달력·근무·일기·식물·통계)
function step(k) {
  if (S.view === 'diary') {
    S.diaryDay = ymd(addDays(parseYmd(S.diaryDay), k));
  } else if (S.view === 'plants') {
    S.plantEnd = ymd(addDays(parseYmd(S.plantEnd), (PHONE ? 14 : 28) * k));
  } else if (S.calMode === 'month' || S.view === 'work' || S.view === 'stats') {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + k, 1);
    const t = new Date();
    S.sel = S.month.getMonth() === t.getMonth() && S.month.getFullYear() === t.getFullYear() ? todayStr() : ymd(S.month);
    S.statDay = S.sel;
  } else {
    S.week = addDays(S.week, 7 * k);
    const t = todayStr();
    S.sel = t >= ymd(S.week) && t <= ymd(addDays(S.week, 6)) ? t : ymd(S.week);
  }
  render(); ensureLoaded();
}

board.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'toggle') {
    const t = S.todos.find((x) => x.id === el.closest('.todo').dataset.id); if (!t) return;
    t.done = !t.done; t.done_at = t.done ? new Date().toISOString() : null; render();
    waterFromTodo(t);
    try { await api.update('todos', t.id, { done: t.done, done_at: t.done_at }); } catch (er) { fail(er); }
  } else if (act === 'edit-todo') {
    openSheet('todo', el.closest('.todo').dataset.id);
  } else if (act === 'edit-event') {
    openSheet('event', el.dataset.id);
  } else if (act === 'sh') {
    sheetDo(el.dataset.do);
  } else if (act === 'sh-close') {
    closeSheet();
  } else if (act === 'ak') {
    S.addKind = el.dataset.k; render(); board.querySelector('form[data-add="event"] input')?.focus();
  } else if (act === 'ap') {
    S.addProj = el.dataset.id; render(); board.querySelector('form[data-add="event"] input')?.focus();
  } else if (act === 'aw') {
    S.addWp = el.dataset.n; render(); board.querySelector('form[data-add="event"] input')?.focus();
  } else if (act === 'sel') {
    S.sel = el.dataset.day; render();
  } else if (act === 'go-day') {
    S.sel = el.dataset.day; location.hash = '#cal';
  } else if (act === 'mode') {
    e.preventDefault();
    S.calMode = el.dataset.mode;
    if (S.calMode === 'week') S.week = mondayOf(parseYmd(S.sel));
    else { const d = parseYmd(S.sel); S.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    render(); ensureLoaded();
  } else if (act === 'prev' || act === 'next') {
    step(act === 'prev' ? -1 : 1);
  } else if (act === 'wp-archive') {
    S.wpArchive = !S.wpArchive; S.wp = null; render();
  } else if (act === 'wp') {
    S.wp = el.dataset.wp; render();
  } else if (act === 'fill') {
    fillRoutine(WORKPLACES.find((w) => w.name === el.dataset.wp));
  } else if (handleMore(act, el, e)) {
    // 처리됨
  } else if (act === 'sync') {
    // 시계를 누르면: 새 버전이 있으면 새로고침, 아니면 데이터 새로 받기 (받는 동안 시계가 흐려짐)
    if (S.syncing) return;
    S.syncing = true; board.querySelector('#syncing')?.removeAttribute('hidden');
    if (await newVersion()) { location.reload(); return; }
    const t0 = Date.now();
    await load();
    await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - t0))));
    S.syncing = false;
    board.querySelector('#syncing')?.setAttribute('hidden', '');
  } else if (act === 'logout') {
    await sb.auth.signOut();
  }
});

function inlineEdit(span, value, save, area = false) {
  const f = document.createElement('form');
  f.style.cssText = 'flex-grow:1;min-width:0;display:flex';
  f.innerHTML = area ? '<textarea class="edit" rows="5"></textarea>' : '<input class="edit" autocomplete="off" enterkeyhint="done">';
  const input = f.firstChild; input.value = value;
  span.replaceWith(f); input.focus();
  let done = false;
  const finish = () => { if (done) return; done = true; save(input.value.trim()); };
  f.addEventListener('submit', (e) => { e.preventDefault(); input.blur(); });
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { done = true; render(); } });
}

// 다짐
addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });
board.addEventListener('keydown', (e) => {
  if (e.target.dataset?.vow && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); }
});
board.addEventListener('input', (e) => {
  const day = e.target.dataset?.diary; if (!day) return;
  clearTimeout(diaryTimer);
  diaryTimer = setTimeout(() => saveDiary(day, e.target.innerText.trim()), 1500);
});
board.addEventListener('focusout', async (e) => {
  if (e.target.dataset?.diary) { clearTimeout(diaryTimer); saveDiary(e.target.dataset.diary, e.target.innerText.trim()); }
  if (e.target.classList?.contains('pmemo')) { const v = e.target.value.trim(); const pl = S.plants.find((p) => p.id === S.plant) || S.plants.filter((p) => !p.gone).sort((a, b) => a.pos - b.pos)[0]; if (pl && (logOf(pl.id, S.plantDay)?.memo || '') !== v) handleAddMore('pmemo', v); }
  const day = e.target.dataset?.vow;
  if (day) {
    const v = e.target.textContent.trim();
    if ((S.days[day]?.vow || '') !== v) {
      S.days[day] = { ...(S.days[day] || { day }), vow: v };
      try { await api.saveDay(day, { vow: v }); } catch (er) { fail(er); }
    }
  }
  setTimeout(() => { if (pendingRender && !board.contains(document.activeElement)) render(); }, 0);
});

// ───────── 다이얼로 작업 시간 기록
// 한 바퀴 = 60분, 5분 단위, 여러 바퀴 돌리면 시간이 쌓임 (최대 12시간)
S.dialMin = 0; S.dialRaw = 0;
const TEXU = 'tex.jpg';
function dialArc(min) {
  const m = min % 60, full = min > 0 && m === 0, a = (m / 60) * Math.PI * 2;
  if (full) return 'M100 100 m-86 0 a86 86 0 1 0 172 0 a86 86 0 1 0 -172 0';
  if (!min) return '';
  const x = 100 + 86 * Math.sin(a), y = 100 - 86 * Math.cos(a);
  return `M100 100 L100 14 A86 86 0 ${m > 30 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}
function dialKnob(min) {
  const a = ((min % 60) / 60) * Math.PI * 2;
  return [100 + 86 * Math.sin(a), 100 - 86 * Math.cos(a)];
}
const dialLabel = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
function dialHTML(size, projId = '') {
  const [kx, ky] = dialKnob(S.dialMin);
  const ticks = [...Array(12)].map((_, i) => { const a = (i / 12) * Math.PI * 2, r1 = i % 3 ? 78 : 72; return `<line x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + 86 * Math.sin(a)}" y2="${100 - 86 * Math.cos(a)}" stroke="#141414" stroke-width="${i % 3 ? 2 : 3}"/>`; }).join('');
  return `<div class="dialbox" data-proj="${projId}">
    <div class="dial" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 200 200" width="${size}" height="${size}" aria-label="작업 시간 다이얼">
        <defs><pattern id="dtx" patternUnits="userSpaceOnUse" width="160" height="160"><image href="${TEXU}" width="160" height="160"/></pattern></defs>
        <circle cx="100" cy="100" r="86" fill="#fff"/>
        <path id="dial-arc" d="${dialArc(S.dialMin)}" fill="url(#dtx)"/>
        ${ticks}
        <circle cx="100" cy="100" r="86" fill="none" stroke="#141414" stroke-width="3"/>
        <rect id="dial-knob" x="${kx - 7}" y="${ky - 7}" width="14" height="14" fill="#141414"/>
      </svg>
      <span class="dial-t" id="dial-t">${dialLabel(S.dialMin)}</span>
    </div>
    <div class="dial-acts"><button class="btn" data-act="dial-save">기록</button><button class="ul" data-act="dial-reset">지우기</button><button class="ul" data-act="start" data-id="${projId}" data-dialstart="1">타이머</button></div>
  </div>`;
}
function dialSet(min) {
  S.dialMin = Math.max(0, Math.min(720, min));
  const arc = document.getElementById('dial-arc'), knob = document.getElementById('dial-knob'), t = document.getElementById('dial-t');
  if (arc) arc.setAttribute('d', dialArc(S.dialMin));
  if (knob) { const [x, y] = dialKnob(S.dialMin); knob.setAttribute('x', x - 7); knob.setAttribute('y', y - 7); }
  if (t) t.textContent = dialLabel(S.dialMin);
}
let dialDrag = null;
const dialAngle = (svg, e) => { const r = svg.getBoundingClientRect(); const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360; };
board.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest('.dial svg'); if (!svg) return;
  e.preventDefault(); svg.setPointerCapture(e.pointerId);
  dialDrag = { svg, prev: dialAngle(svg, e) };
  S.dialRaw = S.dialMin;
});
board.addEventListener('pointermove', (e) => {
  if (!dialDrag) return;
  const a = dialAngle(dialDrag.svg, e); let d = a - dialDrag.prev; if (d > 180) d -= 360; if (d < -180) d += 360;
  dialDrag.prev = a; S.dialRaw = Math.max(0, Math.min(720, S.dialRaw + (d / 360) * 60));
  dialSet(Math.round(S.dialRaw / 5) * 5);
});
const dialEnd = () => { if (!dialDrag) return; dialDrag = null; if (pendingRender) render(); };
board.addEventListener('pointerup', dialEnd); board.addEventListener('pointercancel', dialEnd);

async function dialSave(projId) {
  const p = projOf(projId || S.dialProj) || activeProjects()[0];
  if (!p) return false;
  const m = S.dialMin; if (!m) { toast('다이얼을 돌려 시간을 정해 주세요'); return false; }
  const end = new Date(), start = new Date(end - m * 60000);   // 지금 끝난 것으로, 시작한 날에 기록
  const row = { project_id: p.id, title: p.name, day: ymd(start), start_at: start.toISOString(), end_at: end.toISOString() };
  const tmp = { id: 'tmp' + Date.now(), ...row };
  S.sessions.push(tmp); S.dialMin = 0; render();
  toast(`${p.name} ${dur(m)} 기록했어요`);
  try { Object.assign(tmp, await api.insert('sessions', row)); } catch (e) { fail(e); S.sessions = S.sessions.filter((x) => x !== tmp); render(); }
  return true;
}

// ───────── 타이머
async function startWork(p) {
  const r = running(); if (r) await stopWork(r);
  const row = { project_id: p?.id || null, title: p?.name || '작업', day: todayStr(), start_at: new Date().toISOString() };
  const tmp = { id: 'tmp' + Date.now(), ...row, end_at: null };
  S.sessions.push(tmp); render();
  try { Object.assign(tmp, await api.insert('sessions', row)); } catch (e) { fail(e); S.sessions = S.sessions.filter((x) => x !== tmp); }
  render();
}
async function stopWork(s) {
  s.end_at = new Date().toISOString(); render();
  try { await api.update('sessions', s.id, { end_at: s.end_at }); } catch (e) { fail(e); }
}
async function discardWork(s) {
  S.sessions = S.sessions.filter((x) => x !== s); render();
  try { await api.remove('sessions', s.id); } catch (e) { fail(e); }
}

// ───────── 프로젝트
const STATUS = { done: '완료', archived: '보관', stopped: '중단' };
function stageChain(p) {
  const st = p.stages || [], cur = p.status === 'done' ? st.length : p.stage || 0;
  return st.map((x, i) => `<span data-act="stage" data-id="${p.id}" data-i="${i}" class="${i < cur ? 'dn' : i === cur ? 'cur' : 'mu'}">${esc(x)}</span>`).join('<span>&#8594;</span>');
}
const periodLabel = (p) => (p.start_day || p.end_day ? `${p.start_day ? md(p.start_day) : ''}&#8211;${p.end_day ? md(p.end_day) : ''}` : '<span class="mu">&#8212;</span>');
function parsePeriod(v) {
  const m = [...v.matchAll(/(?:(\d{4})[./-])?(\d{1,2})[./](\d{1,2})/g)];
  const y0 = new Date().getFullYear();
  const mk = (x, fallbackY) => x ? ymd(new Date(x[1] ? +x[1] : fallbackY, +x[2] - 1, +x[3])) : null;
  const a = mk(m[0], y0); let b = mk(m[1], a ? parseYmd(a).getFullYear() : y0);
  if (a && b && b < a && !m[1][1]) b = ymd(new Date(parseYmd(b).getFullYear() + 1, +m[1][2] - 1, +m[1][3]));
  return { start_day: a, end_day: b };
}
function projField(p, f) {
  if (f === 'period') return p.start_day || p.end_day ? `${p.start_day ? md(p.start_day) : ''}-${p.end_day ? md(p.end_day) : ''}` : '';
  if (f === 'stages') return (p.stages || []).join(' > ');
  if (f === 'pay') return p.pay ? String(p.pay) : '';
  return p[f] || '';
}
function parseProjField(f, v) {
  if (f === 'period') return parsePeriod(v);
  if (f === 'stages') return { stages: v.split(/\s*(?:>|→|,)\s*/).map((x) => x.trim()).filter(Boolean) };
  if (f === 'pay') { const n = parseInt(v.replace(/[^\d]/g, ''), 10); return { pay: Number.isFinite(n) ? n : null }; }
  if (f === 'name') return v ? { name: v } : null;
  return { [f]: v || null };
}
async function saveProj(p, patch) {
  Object.assign(p, patch);
  if (p.stages && p.stage > p.stages.length) p.stage = p.stages.length;
  render();
  try { await api.update('projects', p.id, patch); } catch (e) { fail(e); }
}

function viewProjects() {
  const active = S.projects.filter((p) => p.status === 'active');
  const archived = S.projects.filter((p) => p.status !== 'active');
  const list = S.projects.slice().sort((a, b) => a.pos - b.pos);
  const sel = list.find((p) => p.id === S.proj) || list[0];
  const rows = list.map((p, i) => `<div class="pl${p === sel ? ' on' : ''}${i === list.length - 1 ? ' last' : ''}" data-act="proj" data-id="${p.id}">
      <span class="nm">${esc(p.name)}${p.status === 'active' ? '<i class="live"></i>' : ''}</span></div>`).join('');
  const none = '<span class="mu">&#8212;</span>';
  const row = (label, key, val) => `<div class="pv" data-act="pf" data-f="${key}"><span class="pk">${label}</span><span class="pval">${val || none}</span></div>`;
  const link = sel?.link ? `<a class="lnk" href="${esc(/^https?:/.test(sel.link) ? sel.link : 'https://' + sel.link)}" target="_blank" rel="noopener">${esc(sel.link.replace(/^https?:\/\//, ''))}</a>` : '';
  const detail = sel ? `<section class="pdet">
      <span class="ptitle riso" data-act="pf" data-f="name">${esc(sel.name)}</span>
      <div class="pv" data-act="pstate"><span class="pk">상태</span><span class="pval">${sel.status === 'active' ? '진행 중' : '끝남'}</span></div>
      ${row('분류', 'category', sel.category && esc(sel.category))}
      ${row('기간', 'period', (sel.start_day || sel.end_day) && periodLabel(sel))}
      ${row('보수', 'pay', sel.pay && won(sel.pay))}
      ${row('함께한 사람', 'people', sel.people && esc(sel.people))}
      ${row('결과물', 'output', sel.output && esc(sel.output))}
      ${row('프로그램', 'programs', sel.programs && esc(sel.programs))}
      ${row('링크', 'link', link)}
      <div class="pv note-row" data-act="pf" data-f="note"><span class="pk">노트</span><p class="note pval">${sel.note ? esc(sel.note) : none}</p></div>
    </section>` : '<section class="pdet"></section>';
  return `${header(`진행 중 ${active.length}`)}
  <div class="main">
    <section class="plist">
      <div class="row"><span class="bk">PROJECTS</span><span style="font-size:15px">[ ${list.length} ]</span>
        <button aria-label="프로젝트 추가" data-act="proj-add" style="margin-left:auto;font-size:20px;padding:0 2px">+</button></div>
      <div class="scroll">${rows}</div>
    </section>
    ${detail}
  </div>`;
}

// ───────── 기록 (일기)
function viewDiary() {
  const day = S.diaryDay, d = parseYmd(day), mo = d.getMonth();
  const prefix = `${d.getFullYear()}-${pad(mo + 1)}-`;
  const count = Object.values(S.days).filter((r) => r.day.startsWith(prefix) && r.diary && r.diary.trim()).length;
  const todos = todosOf(day), done = todos.filter((t) => t.done).length;
  const work = dayWork(day), sess = daySess(day);
  const evs = eventsOf(day).filter((e) => e.kind !== 'work');
  const watered = S.plogs.filter((l) => l.day === day && l.watered).map((l) => S.plants.find((p) => p.id === l.plant_id)?.name).filter(Boolean);
  const rec = S.days[day] || {};
  const strip = [
    `<span>작업 ${dur(sess)}</span>`, `<span>${work ? '근무 ' + dur(work) : '근무 없음'}</span>`,
    ...evs.map((e) => `<span>${e.start_min != null ? workCode(e.start_min) + ' ' : ''}${esc(e.title)}</span>`),
    watered.length ? `<span>물 &#183; ${esc(watered.join(', '))}</span>` : '',
  ].join('');
  const recent = S.recent.filter((r) => r.day !== day).slice(0, 6);
  return `${header(`${mo + 1}월 일기 ${count}편`)}
  <div class="main">
    <section class="left" style="gap:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="bk">DIARY / 일기</span>
        <span style="margin-left:18px;font-size:22px;letter-spacing:-.01em">${pad(mo + 1)}. ${pad(d.getDate())} ${wdh(d.getDay())}</span>
        ${day !== todayStr() ? '<button class="ul" data-act="diary-today" style="margin-left:8px;font-size:13px">오늘</button>' : ''}
      </div>
      <div class="strip">${strip}</div>
      <div style="display:flex;flex-direction:column;min-height:0;flex-grow:1">
        <div style="display:flex;align-items:baseline;gap:14px;min-height:0;flex-grow:1">
          <p class="diary" contenteditable="plaintext-only" data-diary="${day}" spellcheck="false">${esc(rec.diary || '')}</p>
        </div>
        <div style="border-bottom:1.5px solid var(--ink);height:24px;flex:none"></div>
      </div>
    </section>
    <section class="side" style="gap:0">
      <span class="bk" style="margin-bottom:14px">지난 기록</span>
      ${recent.map((r, i) => `<div class="ent${i === recent.length - 1 ? ' last' : ''}" data-act="diary-go" data-day="${r.day}"><b>${md(r.day)} ${wdh(parseYmd(r.day).getDay())}</b><span>${esc(firstLine(r.diary))}</span></div>`).join('')}
    </section>
  </div>`;
}
let diaryTimer;
async function saveDiary(day, text) {
  if ((S.days[day]?.diary || '') === text) return;
  S.days[day] = { ...(S.days[day] || { day }), diary: text };
  try {
    await api.saveDay(day, { diary: text });
    S.recent = await api.recentDiary();
  } catch (e) { fail(e); }
}

// ───────── 식물
function plantStats(p) {
  const logs = S.plogs.filter((l) => l.plant_id === p.id);
  const lastW = logs.filter((l) => l.watered).map((l) => l.day).sort().pop();
  const lastM = logs.filter((l) => l.memo).sort((a, b) => (a.day < b.day ? -1 : 1)).pop();
  let next = null;
  if (p.interval_days < 0) {
    // 매달 n일: 마지막으로 물 준 다음 날(없으면 이번 달 1일)부터 처음 오는 n일
    const n = -p.interval_days, t = new Date();
    let d = lastW ? addDays(parseYmd(lastW), 1) : new Date(t.getFullYear(), t.getMonth(), 1);
    for (let k = 0; k < 3; k++) {
      const c = new Date(d.getFullYear(), d.getMonth() + k, Math.min(n, new Date(d.getFullYear(), d.getMonth() + k + 1, 0).getDate()));
      if (c >= d) { next = ymd(c); break; }
    }
  } else if (lastW && p.interval_days) next = ymd(addDays(parseYmd(lastW), p.interval_days));
  return { lastW, lastM, next };
}
// 물 줄 날이 된 식물은 오늘 할 일에 '물 주기 · 이름들'로 넣기 (하루 한 번)
const WATER = '물 주기 · ';
async function waterTodo() {
  const day = todayStr();
  if (S.waterTodoDay === day || DEMO && S.waterTodoDay) return;
  if (todosOf(day).some((t) => t.text.startsWith(WATER))) { S.waterTodoDay = day; return; }
  const due = S.plants.filter((p) => !p.gone && !logOf(p.id, day)?.watered && (plantStats(p).next || '9') <= day);
  if (!due.length) return;
  S.waterTodoDay = day;
  const row = { day, text: WATER + due.map((p) => p.name).join(', '), tag: '식물', pos: -1 };
  try { S.todos.push(await api.insert('todos', row)); render(); } catch (e) { fail(e); }
}
// 그 할 일을 체크하면 적힌 식물들에 물 줬음 기록
function waterFromTodo(t) {
  if (!t.text.startsWith(WATER)) return;
  for (const name of t.text.slice(WATER.length).split(', ')) {
    const p = S.plants.find((x) => x.name === name && !x.gone);
    if (p && !!logOf(p.id, t.day)?.watered !== t.done) saveLog(p, t.day, { watered: t.done });
  }
}

// 물 주기 표시: 7 → 7일 / -10 → 매달 10일
const waterLabel = (p) => (p.interval_days < 0 ? `매달 ${-p.interval_days}일` : p.interval_days ? `${p.interval_days}일` : '');
const logOf = (pid, day) => S.plogs.find((l) => l.plant_id === pid && l.day === day);
async function saveLog(p, day, patch) {
  let l = logOf(p.id, day);
  if (l) Object.assign(l, patch); else S.plogs.push((l = { id: 'tmp' + Date.now(), plant_id: p.id, day, watered: false, memo: null, ...patch }));
  render();
  try { Object.assign(l, await api.upsertLog(p.id, day, patch)); } catch (e) { fail(e); }
}

function viewPlants() {
  const alive = S.plants.filter((p) => !p.gone).sort((a, b) => a.pos - b.pos);
  const gone = S.plants.filter((p) => p.gone).sort((a, b) => a.pos - b.pos);
  const today = todayStr();
  const header_ = header(`함께 사는 식물 ${alive.length}`);
  if (S.plantGone) {
    const sel = gone.find((p) => p.id === S.plant) || gone[0];
    return `${header_}
    <div class="main">
      <section class="left">
        <div class="row"><span class="bk">추억의 전당</span><span style="font-size:15px">[ ${gone.length} ]</span></div>
        ${gone.map((p, i) => `<div class="gr${i === gone.length - 1 ? ' last' : ''}" data-act="plant" data-id="${p.id}"><b class="${p === sel ? 'pick' : ''}" style="padding:0 4px;margin-left:-4px">${esc(p.name)}</b><span>${esc(p.species || '')}</span><span>${p.gone_day ? md(p.gone_day) : ''}</span></div>`).join('')}
        <button class="lk" data-act="plant-gone">&#8592; 함께 사는 식물</button>
      </section>
      <section class="side">${sel ? `<span class="bk" style="margin-bottom:8px">${esc(sel.name)}</span><span style="font-size:13px">${esc(sel.species || '')}</span>
        <button class="ul" style="align-self:flex-start;margin-top:16px;font-size:13px" data-act="plant-back">다시 함께 살기</button>` : ''}</section>
    </div>`;
  }
  // 150일 전부터 4주 뒤까지 한 줄로 길게 — 옆으로 밀어서 본다
  const start = addDays(parseYmd(today), -150), N = 150 + 28 + 1, CW = 20;
  const days = [...Array(N)].map((_, i) => ymd(addDays(start, i)));
  const sel = alive.find((p) => p.id === S.plant) || alive[0];
  const selDay = days.includes(S.plantDay) || S.plantDay === today ? S.plantDay : today;
  const hd = days.map((ds, i) => {
    const d = parseYmd(ds), n = d.getDate();
    if (ds === today) return `<span class="tday">${n}<i></i></span>`;
    return `<span>${(150 - i) % 7 === 0 ? `${d.getMonth() + 1}/${n}` : ''}</span>`;
  }).join('');
  const rows = alive.map((p) => {
    const cells = days.map((ds) => {
      const l = logOf(p.id, ds);
      const on = p === sel && ds === selDay;
      return `<i data-act="pcell" data-id="${p.id}" data-day="${ds}" class="${l?.watered ? 'riso w' : ''}${l?.memo ? ' m' : ''}${on ? ' on' : ''}"></i>`;
    }).join('');
    return `<div class="tl-row" style="--n:${N};--cw:${CW}px">${cells}</div>`;
  }).join('');
  const names = alive.map((p) => `<span class="nm${p === sel ? ' sel' : ''}" data-act="plant" data-id="${p.id}"><b>${esc(p.name)}</b></span>`).join('');
  let side = '<section class="side"></section>';
  if (sel) {
    const st = plantStats(sel), l = logOf(sel.id, selDay);
    side = `<section class="side">
      <span class="bk" style="margin-bottom:8px" data-act="pl-name">${esc(sel.name)}</span>
      <span style="font-size:13px" data-act="pl-name">${esc(sel.species || '')}</span>
      <div class="kv" style="margin-top:8px" data-act="pl-int"><span>물 주기</span><span>${waterLabel(sel) || '<span class="mu">&#8212;</span>'}</span></div>
      <div class="kv"><span>마지막 물</span><span>${st.lastW ? md(st.lastW) : '<span class="mu">&#8212;</span>'}</span></div>
      <div class="kv"><span>다음 물</span><span class="${st.next && st.next <= today ? 'red' : ''}">${st.next ? md(st.next) : '<span class="mu">&#8212;</span>'}</span></div>
      <button class="btn" style="margin-top:12px" data-act="water">${selDay === today ? '' : md(selDay) + ' '}${l?.watered ? '물 취소' : '물 줬음'}</button>
      ${st.lastM ? `<span style="margin-top:18px;font-size:13px">최근 메모 &#183; ${md(st.lastM.day)}</span><span style="font-size:14px;font-weight:600;line-height:1.3">${esc(st.lastM.memo)}</span>` : ''}
      <span style="margin-top:14px;font-size:13px">${md(selDay)} 메모</span>
      <form data-add="pmemo"><input class="pmemo" aria-label="${md(selDay)} 메모" autocomplete="off" enterkeyhint="done" value="${esc(l?.memo || '')}"></form>
      <button class="ul" style="align-self:flex-start;margin-top:auto;font-size:12px" data-act="plant-bye">추억의 전당으로</button>
    </section>`;
  }
  return `${header_}
  <div class="main">
    <section class="left">
      <div class="row"><span class="bk">PLANTS / 식물</span><span style="font-size:15px">[ ${alive.length} ]</span>
        <button aria-label="식물 추가" data-act="plant-add" style="font-size:20px;padding:0 2px;margin-left:auto">+</button></div>
      ${S.plantAdd ? addForm('plant', '식물 추가', 'width:60%;margin:-4px 0 10px') : ''}
      <div class="tlg">
        <div class="tl-names"><span class="tl-h">이름</span>${names}</div>
        <div class="tl-sc"><div class="tl-in"><b class="tl-now" style="left:${days.indexOf(today) * CW + CW / 2}px"></b><div class="tl-hd" style="--n:${N};--cw:${CW}px">${hd}</div>
        ${rows}</div></div>
      </div>
      <button class="lk" data-act="plant-gone">추억의 전당 [ ${gone.length} ] &#8594;</button>
    </section>
    ${side}
  </div>`;
}

// ───────── 통계
function viewStats() {
  const m = S.month, y = m.getFullYear(), mo = m.getMonth(), last = new Date(y, mo + 1, 0).getDate();
  const days = [...Array(last)].map((_, i) => ymd(new Date(y, mo, i + 1)));
  const per = days.map((ds) => ({ ds, s: daySess(ds), w: dayWork(ds) }));
  const tS = per.reduce((a, x) => a + x.s, 0), tW = per.reduce((a, x) => a + x.w, 0);
  let td = 0, tn = 0, appt = 0;
  for (const ds of days) { const t = todosOf(ds); tn += t.length; td += t.filter((x) => x.done).length; appt += eventsOf(ds).filter((e) => e.kind === 'event').length; }
  const max = Math.max(240, ...per.map((x) => x.s + x.w)), px = 140 / max;
  const statDay = days.includes(S.statDay) ? S.statDay : days[0];
  const bars = per.map((x, i) => `<div class="dy${x.ds === statDay ? ' sel' : ''}" data-act="stat-day" data-day="${x.ds}"><i class="riso" style="height:${x.s * px}px"></i><i class="jb" style="height:${x.w * px}px"></i><span>${x.ds !== statDay && ([0, 4, 9, 14, 19, 24, 29].includes(i) || i === last - 1 && last === 31) ? i + 1 : ''}</span></div>`).join('');
  // 시간대 (8~24시)
  const hrs = Array(16).fill(0);
  const monthSess = S.sessions.filter((s) => days.includes(s.day));
  for (const s of monthSess) {
    const a = minOfDay(s.start_at), b = a + sessMin(s);
    for (let h = 0; h < 16; h++) { const h0 = (h + 8) * 60, h1 = h0 + 60; hrs[h] += Math.max(0, Math.min(b, h1) - Math.max(a, h0)); }
  }
  const hmax = Math.max(60, ...hrs);
  // 프로젝트별
  const byP = {};
  for (const s of monthSess) { const k = sessLabel(s); byP[k] = (byP[k] || 0) + sessMin(s); }
  const pl = Object.entries(byP).sort((a, b) => b[1] - a[1]).slice(0, 6), pmax = Math.max(1, ...pl.map((x) => x[1]));
  const sd = parseYmd(statDay), rec = S.days[statDay] || {}, st = todosOf(statDay);
  return `${header(`${mo + 1}월 작업 ${dur(tS)} &#183; 근무 ${dur(tW)}`)}
  <div class="main">
    <section class="left" style="gap:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="bk">STATS / 통계</span>
        <span style="margin-left:18px;font-size:22px;letter-spacing:-.01em">${y}. ${pad(mo + 1)}</span>
        <button data-act="prev" aria-label="이전 달" style="font-size:15px;padding:0 2px">&#8592;</button>
        <button data-act="next" aria-label="다음 달" style="font-size:15px;padding:0 2px">&#8594;</button>
      </div>
      <div class="big">
        <div><b>${Math.round(tS / 60)}H</b><span>작업 ${dur(tS)}</span></div>
        <div><b>${Math.round(tW / 60)}H</b><span>근무 ${dur(tW)}</span></div>
        <div><b>${tn ? Math.round((td / tn) * 100) + '%' : '&#8212;'}</b><span>할 일 ${td} / ${tn}</span></div>
        <div><b>${appt}</b><span>약속</span></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;gap:14px;font-size:12px"><span>하루하루</span><span style="margin-left:auto;display:flex;align-items:center;gap:5px"><i class="riso" style="display:inline-block;width:10px;height:10px"></i>작업</span><span style="display:flex;align-items:center;gap:5px"><i style="display:inline-block;width:10px;height:10px;background:#141414"></i>근무</span></div>
        <div class="chart">${bars}</div>
      </div>
      <div style="display:flex;gap:28px;margin-top:18px">
        <div style="flex:1 1 0;display:flex;flex-direction:column;gap:6px;min-width:0">
          <span style="font-size:12px">작업한 시간대</span>
          <div class="hb">${hrs.map((v) => `<i class="${v ? 'riso' : ''}" style="height:${(v / hmax) * 60}px"></i>`).join('')}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px"><span>8</span><span>12</span><span>16</span><span>20</span><span>24</span></div>
        </div>
        <div style="flex:1 1 0;display:flex;flex-direction:column;gap:7px;min-width:0">
          <span style="font-size:12px">프로젝트별</span>
          ${pl.map(([k, v], i) => `<div class="pb"><span class="ln">${esc(k)}</span><i class="${['riso', 'riso2', 'riso3'][i % 3]}" style="width:${(v / pmax) * 100}%"></i><span style="text-align:right">${Math.round(v / 60) || '&lt;1'}H</span></div>`).join('')}
        </div>
      </div>
      <button class="ul" data-act="backup" style="margin-top:auto;font-size:13px">백업 받기</button>
    </section>
    <section class="side">
      <span class="bk" style="margin-bottom:8px">${pad(sd.getMonth() + 1)} / ${pad(sd.getDate())} ${wdh(sd.getDay())}</span>
      <div class="kv"><span>작업</span><span>${dur(daySess(statDay))}</span></div>
      <div class="kv"><span>근무</span><span>${dur(dayWork(statDay))}</span></div>
      <div class="kv"><span>할 일</span><span class="red">[ ${st.filter((t) => t.done).length} / ${st.length} ]</span></div>
      ${rec.diary ? `<span class="lb" data-act="diary-go" data-day="${statDay}">일기</span><span data-act="diary-go" data-day="${statDay}">${esc(firstLine(rec.diary))}</span>` : ''}
      <span class="lb">한 일</span>
      ${sessOf(statDay).map((s) => `<span style="font-size:13px">${esc(sessLabel(s))} ${dur(sessMin(s))}</span>`).join('')}
      ${eventsOf(statDay).filter((e) => e.kind === 'work').map((e) => `<span style="font-size:13px">${esc(e.title)} ${hm(e.start_min)}&#8211;${hm(e.end_min)}</span>`).join('')}
    </section>
  </div>`;
}

// ───────── 추가 동작
function handleMore(act, el, ev) {
  if (act === 'imp-ok') { el.disabled = true; el.textContent = '넣는 중…'; runImport(); return true; }
  if (act === 'imp-no') { S.imp = null; location.hash = '#work'; return true; }
  if (act === 'start') { if (S.sheet?.type === 'log') S.sheet = null; startWork(projOf(el.dataset.id || S.dialProj) || activeProjects()[0]); return true; }
  if (act === 'dial-p') { S.dialProj = el.dataset.id; render(true); return true; }
  if (act === 'dial-save') { dialSave(el.closest('.dialbox')?.dataset.proj).then((ok) => { if (ok && S.sheet?.type === 'log') closeSheet(); }); return true; }
  if (act === 'log-open') { S.sheet = { type: 'log', mode: 'log', day: todayStr(), v: logVals(), proj: el.dataset.id || null }; render(true); return true; }
  if (act === 'log-p') { S.sheet.proj = el.dataset.id; render(true); return true; }
  if (act === 'log-save') { logSave(); return true; }
  if (act === 'dial-reset') { dialSet(0); return true; }
  if (act === 'stop') { const r = running(); if (r) stopWork(r); return true; }
  if (act === 'discard') { const r = running(); if (r) discardWork(r); return true; }
  if (act === 'edit-sess') { openSheet('sess', el.dataset.id); return true; }
  // 프로젝트
  if (act === 'proj') { S.proj = el.dataset.id; render(); return true; }
  if (act === 'proj-archive') { S.projArchive = !S.projArchive; S.proj = null; render(); return true; }
  if (act === 'proj-add') {
    (async () => {
      const row = { name: '새 프로젝트', stages: [], stage: 0, status: 'active', pos: Date.now() };
      try {
        const p = await api.insert('projects', row); S.projects.push(p); S.proj = p.id; render();
        board.querySelector('.side [data-f="name"]')?.click();
      } catch (er) { fail(er); }
    })();
    return true;
  }
  if (act === 'stage') {
    ev.stopPropagation();
    const p = projOf(el.dataset.id), i = +el.dataset.i; if (!p || p.status !== 'active') return true;
    S.proj = p.id; saveProj(p, { stage: p.stage === i ? i + 1 : i }); return true;
  }
  if (act === 'pstate') {
    const p = projOf(S.proj) || S.projects.slice().sort((a, b) => a.pos - b.pos)[0]; if (!p) return true;
    S.proj = p.id; saveProj(p, { status: p.status === 'active' ? 'done' : 'active' }); return true;
  }
  if (act === 'pf') {
    const p = projOf(S.proj) || S.projects.slice().sort((a, b) => a.pos - b.pos)[0];
    if (!p) return true;
    const fld = el.dataset.f;
    if (ev.target.closest('a.lnk')) return true;   // 링크는 열기
    let target = el.classList.contains('kv') ? el.lastElementChild : el.classList.contains('pv') ? el.querySelector('.pval') : el;
    if (el.classList.contains('lb')) target = el.nextElementSibling;
    if (el.classList.contains('pv') && target.tagName === 'P') { const sp = document.createElement('span'); target.replaceWith(sp); target = sp; }
    inlineEdit(target, projField(p, fld), (v) => { const patch = parseProjField(fld, v); patch ? saveProj(p, patch) : render(); }, fld === 'note');
    return true;
  }
  if (act === 'pstatus') {
    const p = projOf(S.proj) || viewList()[0]; if (!p) return true;
    const s = el.dataset.s; saveProj(p, s === 'done' ? { status: s, stage: (p.stages || []).length } : { status: s });
    if (s === 'done' || s === 'archived' || s === 'stopped') { const r = running(); if (r && r.project_id === p.id) stopWork(r); }
    S.proj = null; return true;
  }
  if (act === 'pdel') {
    const p = projOf(S.proj) || viewList()[0]; if (!p) return true;
    if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = '정말 삭제'; el.classList.add('red'); return true; }
    S.projects = S.projects.filter((x) => x !== p); S.proj = null; render();
    api.remove('projects', p.id).catch(fail); return true;
  }
  // 기록
  if (act === 'diary-go') { S.diaryDay = el.dataset.day; location.hash = '#diary'; render(); ensureLoaded(); return true; }
  if (act === 'diary-today') { S.diaryDay = todayStr(); render(); return true; }
  // 식물
  if (act === 'plant') { S.plant = el.dataset.id; render(); return true; }
  if (act === 'pcell') { S.plant = el.dataset.id; S.plantDay = el.dataset.day; render(); return true; }
  if (act === 'plant-gone') { S.plantGone = !S.plantGone; S.plant = null; render(); return true; }
  if (act === 'plant-add') { S.plantAdd = !S.plantAdd; render(); if (S.plantAdd) board.querySelector('form[data-add="plant"] input')?.focus(); return true; }
  const plant = S.plants.find((p) => p.id === S.plant) || S.plants.filter((p) => p.gone === S.plantGone).sort((a, b) => a.pos - b.pos)[0];
  if (act === 'water' && plant) { const day = S.plantDay, l = logOf(plant.id, day); saveLog(plant, day, { watered: !l?.watered }); return true; }
  if (act === 'pl-name' && plant) {
    inlineEdit(el, `${plant.species || ''} - ${plant.name}`, async (v) => {
      const [a, b] = v.includes(' - ') ? v.split(' - ').map((x) => x.trim()) : [plant.species, v];
      if (!b) return render();
      plant.species = a || null; plant.name = b; render();
      try { await api.update('plants', plant.id, { species: plant.species, name: plant.name }); } catch (er) { fail(er); }
    });
    return true;
  }
  if (act === 'pl-int' && plant) {
    inlineEdit(el.lastElementChild, waterLabel(plant), async (v) => {
      const mo = v.match(/매달\s*(\d{1,2})/), n = parseInt(v, 10);
      plant.interval_days = mo ? -Math.min(31, +mo[1]) : n > 0 ? n : null; render();
      try { await api.update('plants', plant.id, { interval_days: plant.interval_days }); } catch (er) { fail(er); }
    });
    return true;
  }
  if (act === 'plant-bye' && plant) {
    if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = '정말 보내기'; el.classList.add('red'); return true; }
    plant.gone = true; plant.gone_day = todayStr(); S.plant = null; render();
    api.update('plants', plant.id, { gone: true, gone_day: plant.gone_day }).catch(fail); return true;
  }
  if (act === 'plant-back' && plant) {
    plant.gone = false; plant.gone_day = null; S.plant = null; render();
    api.update('plants', plant.id, { gone: false, gone_day: null }).catch(fail); return true;
  }
  // 통계
  if (act === 'backup') { backup(el); return true; }
  if (act === 'stat-day') { S.statDay = el.dataset.day; render(); return true; }
  return false;
}
const viewList = () => S.projects.filter((x) => (S.projArchive ? x.status !== 'active' : x.status === 'active')).sort((a, b) => a.pos - b.pos);

async function handleAddMore(k, v) {
  if (k === 'plant') {
    if (!v) return;
    const [a, b] = v.includes(' - ') ? v.split(' - ').map((x) => x.trim()) : [null, v];
    const row = { species: a, name: b || a, gone: false, pos: Date.now() };
    try { const p = await api.insert('plants', row); S.plants.push(p); S.plant = p.id; S.plantAdd = false; render(); } catch (e) { fail(e); }
  } else if (k === 'pmemo') {
    const plant = S.plants.find((p) => p.id === S.plant) || S.plants.filter((p) => !p.gone).sort((a, b) => a.pos - b.pos)[0];
    if (plant) saveLog(plant, S.plantDay, { memo: v || null });
  }
}

// ───────── 누르면 뜨는 창 (할 일 · 일정 · 작업 기록)
const KIND_KO = { task: '작업', event: '약속', work: '근무' };
const WH = 28; // 바퀴 한 칸 높이
function sheetItem() {
  const sh = S.sheet; if (!sh) return null;
  return sh.type === 'todo' ? S.todos.find((x) => x.id === sh.id)
    : sh.type === 'event' ? S.events.find((x) => x.id === sh.id)
    : S.sessions.find((x) => x.id === sh.id);
}
const dayLabel = (ds) => `${md(ds)} ${wdh(parseYmd(ds).getDay())}`;
function openSheet(type, id) {
  const it = (type === 'todo' ? S.todos : type === 'event' ? S.events : S.sessions).find((x) => x.id === id);
  if (!it) return;
  S.sheet = { type, id, mode: 'menu' };
  render(true);
}
function closeSheet() { S.sheet = null; render(true); }
function sheetVals(it, type) {
  let a, b;
  if (type === 'sess') { a = minOfDay(it.start_at); b = it.end_at ? minOfDay(it.end_at) : a + 60; }
  else if (type === 'event' && it.start_min != null) { a = it.start_min; b = it.end_min ?? a + 60; }
  else { const n = new Date(); a = Math.min(23, n.getHours() + 1) * 60; b = a + 60; }
  const r5 = (m) => Math.round(m / 5) * 5;
  a = r5(a) % 1440; b = r5(b) % 1440;
  return { sh: Math.floor(a / 60), sm: a % 60, eh: Math.floor(b / 60), em: b % 60,
    noEnd: type === 'event' && it.start_min != null && it.end_min == null,
    allDay: type === 'event' && it.start_min == null, kind: 'task', proj: activeProjects()[0]?.id || null };
}
function wheel(key, n, step, val) {
  const items = [...Array(n)].map((_, i) => `<div class="wi${i * step === val ? ' on' : ''}">${pad(i * step)}</div>`).join('');
  return `<div class="wheel" data-w="${key}" data-step="${step}" data-i="${Math.round(val / step)}"><div class="wpad"></div>${items}<div class="wpad"></div></div>`;
}
function wheelsHTML(v, { end = true } = {}) {
  return `<div class="wheels">
    <div class="wgrp"><div class="wrow">${wheel('sh', 24, 1, v.sh)}<span class="wc">:</span>${wheel('sm', 12, 5, v.sm)}</div></div>
    ${end ? `<span class="wt${v.noEnd ? ' off' : ''}">~</span><div class="wgrp${v.noEnd ? ' off' : ''}"><div class="wrow">${wheel('eh', 24, 1, v.eh)}<span class="wc">:</span>${wheel('em', 12, 5, v.em)}</div></div>` : ''}
  </div>`;
}
// 작업시간 기록하기: 날짜 + 시작~끝 바퀴 + 프로젝트
function logVals() {
  const n = new Date(), e = Math.floor((n.getHours() * 60 + n.getMinutes()) / 5) * 5, st = Math.max(0, e - 60);
  return { sh: Math.floor(st / 60), sm: st % 60, dh: 1, dm: 0 };
}
function logSheetHTML() {
  const ap = activeProjects(), sh = S.sheet;
  const pid = sh.proj || S.dialProj || ap[0]?.id;
  return `<div class="sh-bg" data-act="sh-close"></div>
  <div class="sheet" role="dialog" aria-label="작업시간 기록하기">
    <div class="sh-head"><span>작업시간 기록하기</span><button class="sh-x" data-act="sh-close" aria-label="닫기">&#215;</button></div>
    ${ap.length ? `<div class="opts" style="font-size:15px;gap:6px 14px;margin:2px 0 4px">${ap.map((p) => `<button data-act="log-p" data-id="${p.id}" class="${pid === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
    <input type="date" class="sh-date log-date" value="${sh.day}">
    <div class="wheels">
      <div class="wrow">${wheel('sh', 24, 1, sh.v.sh)}<span class="wc">:</span>${wheel('sm', 12, 5, sh.v.sm)}</div>
      <span class="wt">부터</span>
      <div class="wrow">${wheel('dh', 13, 1, sh.v.dh)}<span class="wu">h</span>${wheel('dm', 12, 5, sh.v.dm)}<span class="wu">m</span></div>
    </div>
    <div class="sh-acts"><button class="btn" data-act="log-save">기록</button></div>` : '<span class="mu" style="font-size:14px">진행 중인 프로젝트가 없어요</span>'}
  </div>`;
}
async function logSave() {
  const sh = S.sheet, p = projOf(sh.proj || S.dialProj) || activeProjects()[0]; if (!p) return;
  const day = board.querySelector('.log-date')?.value || sh.day, v = sh.v;
  const a = v.sh * 60 + v.sm, b = a + v.dh * 60 + v.dm;
  if (b === a) { toast('작업한 시간을 정해 주세요'); return; }
  const base = parseYmd(day), at = (mm) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, mm).toISOString();
  const row = { project_id: p.id, title: p.name, day, start_at: at(a), end_at: at(b) };
  const tmp = { id: 'tmp' + Date.now(), ...row };
  S.sessions.push(tmp); S.dialProj = p.id; closeSheet();
  toast(`${p.name} ${hm(a)}부터 ${dur(b - a)} 기록했어요`);
  try { Object.assign(tmp, await api.insert('sessions', row)); } catch (e) { fail(e); S.sessions = S.sessions.filter((x) => x !== tmp); render(); }
}
function sheetHTML() {
  const sh = S.sheet; if (!sh) return '';
  if (sh.type === 'log') return logSheetHTML();
  const it = sheetItem(); if (!it) { S.sheet = null; return ''; }
  const t = sh.type;
  let head, title;
  if (t === 'todo') { head = `할 일 &#183; ${dayLabel(it.day)}`; title = esc(it.text) + (it.tag ? ` <span class="riso-t" style="font-size:14px">#${esc(it.tag)}</span>` : ''); }
  else if (t === 'event') {
    const tm = it.start_min != null ? ` &#183; ${hm(it.start_min)}${it.end_min != null ? '&#8211;' + hm(it.end_min) : ''}` : ' &#183; 하루 종일';
    head = `${KIND_KO[it.kind]} &#183; ${dayLabel(it.day)}${tm}`; title = esc(it.title);
  } else { head = `작업 기록 &#183; ${dayLabel(it.day)} &#183; ${hm(minOfDay(it.start_at))}&#8211;${it.end_at ? hm(minOfDay(it.end_at)) : ''}`; title = esc(sessLabel(it)); }
  const row = (d, l) => `<button class="sh-row" data-act="sh" data-do="${d}">${l}</button>`;
  let body = '';
  if (sh.mode === 'menu') {
    if (t === 'todo') body = row('edit', '수정하기') + row('tomorrow', '내일 하기') + row('date', '날짜 바꾸기') + row('toEvent', '일정으로 바꾸기') + row('del', '지우기');
    else if (t === 'event') body = (it.kind !== 'work' ? row('edit', '수정하기') : '') + row('time', '시간 바꾸기') + row('date', '날짜 바꾸기') + row('tomorrow', '내일 하기') + (it.kind !== 'work' ? row('kind', it.kind === 'task' ? '약속으로 바꾸기' : '작업으로 바꾸기') + row('toTodo', '할 일로 바꾸기') : '') + row('del', '지우기');
    else body = row('time', '시간 바꾸기') + row('del', '지우기');
  } else if (sh.mode === 'edit') {
    body = `<form class="sh-form" data-sh="edit"><input class="edit" autocomplete="off" enterkeyhint="done" value="${esc(t === 'todo' ? todoInput(it) : it.title)}"></form>
      <div class="sh-acts"><button class="btn" data-act="sh" data-do="save-edit">저장</button><button class="ul" data-act="sh" data-do="menu">뒤로</button></div>`;
  } else if (sh.mode === 'date') {
    body = `<input type="date" class="sh-date" value="${it.day}">
      <div class="sh-acts"><button class="btn" data-act="sh" data-do="save-date">저장</button><button class="ul" data-act="sh" data-do="menu">뒤로</button></div>`;
  } else if (sh.mode === 'time') {
    const v = sh.v; const isEv = t === 'event', isWork = isEv && it.kind === 'work';
    body = `${v.allDay ? '' : wheelsHTML(v)}
      ${isEv && !isWork ? `<div class="sh-tg"><button class="${v.allDay ? 'riso3' : ''}" data-act="sh" data-do="tg-all">하루 종일</button>${v.allDay ? '' : `<button class="${v.noEnd ? 'riso3' : ''}" data-act="sh" data-do="tg-end">끝 시간 없음</button>`}</div>` : ''}
      <div class="sh-acts"><button class="btn" data-act="sh" data-do="save-time">저장</button><button class="ul" data-act="sh" data-do="menu">뒤로</button></div>`;
  } else if (sh.mode === 'toEvent') {
    const v = sh.v, ap = activeProjects();
    body = `<div class="kinds" style="margin-top:0">${['task', 'event'].map((k) => `<button data-act="sh" data-do="k-${k}" class="${v.kind === k ? 'riso3' : ''}">${KIND_KO[k]}</button>`).join('')}</div>
      ${v.kind === 'task' ? `<div class="opts">${ap.map((p) => `<button data-act="sh" data-do="p-${p.id}" class="${v.proj === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('') || '<span class="mu">진행 중인 프로젝트 없음</span>'}</div>` : ''}
      ${v.allDay ? '' : wheelsHTML(v)}
      <div class="sh-tg"><button class="${v.allDay ? 'riso3' : ''}" data-act="sh" data-do="tg-all">하루 종일</button>${v.allDay ? '' : `<button class="${v.noEnd ? 'riso3' : ''}" data-act="sh" data-do="tg-end">끝 시간 없음</button>`}</div>
      <div class="sh-acts"><button class="btn" data-act="sh" data-do="save-toEvent">일정으로 바꾸기</button><button class="ul" data-act="sh" data-do="menu">뒤로</button></div>`;
  }
  return `<div class="sh-bg" data-act="sh-close"></div>
  <div class="sheet" role="dialog" aria-label="${t === 'todo' ? '할 일' : '일정'}">
    <div class="sh-head"><span>${head}</span><button class="sh-x" data-act="sh-close" aria-label="닫기">&#215;</button></div>
    <div class="sh-title">${title}</div>
    <div class="sh-body">${body}</div>
  </div>`;
}
function initWheels() {
  board.querySelectorAll('.wheel').forEach((w) => { w.scrollTop = +w.dataset.i * WH; });
  const inp = board.querySelector('.sh-form input'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
// 바퀴 돌리기 — 손가락은 기본 스크롤, 마우스는 끌기
const wheelTimers = new Map();
board.addEventListener('scroll', (e) => {
  const w = e.target; if (!w.classList || !w.classList.contains('wheel')) return;
  clearTimeout(wheelTimers.get(w));
  wheelTimers.set(w, setTimeout(() => {
    const i = Math.max(0, Math.min(w.querySelectorAll('.wi').length - 1, Math.round(w.scrollTop / WH)));
    const v = S.sheet?.v;
    if (v) {
      v[w.dataset.w] = i * +w.dataset.step;
      // 시작을 바꿨는데 끝이 시작보다 앞이면 끝을 1시간 뒤로
      if ((w.dataset.w === 'sh' || w.dataset.w === 'sm') && vMin(v.eh, v.em) <= vMin(v.sh, v.sm)) {
        const b = (vMin(v.sh, v.sm) + 60) % 1440; v.eh = Math.floor(b / 60); v.em = b % 60;
        for (const [k, val, st] of [['eh', v.eh, 1], ['em', v.em, 5]]) {
          const x = board.querySelector(`.wheel[data-w="${k}"]`); if (x) x.scrollTo({ top: (val / st) * WH, behavior: 'smooth' });
        }
      }
    }
    w.querySelectorAll('.wi').forEach((x, k) => x.classList.toggle('on', k === i));
  }, 60));
}, true);
let wDrag = null;
board.addEventListener('pointerdown', (e) => {
  const w = e.target.closest('.wheel'); if (!w || e.pointerType !== 'mouse') return;
  e.preventDefault(); wDrag = { w, y: e.clientY, top: w.scrollTop }; w.style.scrollSnapType = 'none';
});
addEventListener('pointermove', (e) => { if (wDrag) wDrag.w.scrollTop = wDrag.top - (e.clientY - wDrag.y); });
addEventListener('pointerup', () => {
  if (!wDrag) return; const w = wDrag.w; wDrag = null;
  w.style.scrollSnapType = ''; w.scrollTo({ top: Math.round(w.scrollTop / WH) * WH, behavior: 'smooth' });
});
board.addEventListener('wheel', (e) => {
  const w = e.target.closest('.wheel'); if (!w) return;
  e.preventDefault(); w.scrollTop += Math.sign(e.deltaY) * WH;
}, { passive: false });

const vMin = (h, m) => h * 60 + m;
async function sheetDo(d) {
  const sh = S.sheet, it = sheetItem(); if (!sh || !it) return closeSheet();
  const t = sh.type, table = t === 'todo' ? 'todos' : t === 'event' ? 'events' : 'sessions';
  const upd = async (patch) => { Object.assign(it, patch); closeSheet(); try { await api.update(table, it.id, patch); } catch (e) { fail(e); } };
  if (d === 'menu') { sh.mode = 'menu'; return render(true); }
  if (['edit', 'date'].includes(d)) { sh.mode = d; return render(true); }
  if (d === 'time' || d === 'toEvent') { sh.mode = d; sh.v = sheetVals(it, t); return render(true); }
  if (d === 'tg-all') { sh.v.allDay = !sh.v.allDay; return render(true); }
  if (d === 'tg-end') { sh.v.noEnd = !sh.v.noEnd; return render(true); }
  if (d.startsWith('k-')) { sh.v.kind = d.slice(2); return render(true); }
  if (d.startsWith('p-')) { sh.v.proj = d.slice(2); return render(true); }
  if (d === 'tomorrow') return upd({ day: ymd(addDays(parseYmd(it.day), 1)) });
  if (d === 'save-date') { const v = board.querySelector('.sh-date')?.value; if (v) return upd({ day: v }); return; }
  if (d === 'save-edit') {
    const v = board.querySelector('.sh-form input')?.value.trim(); if (!v) return;
    return upd(t === 'todo' ? parseTodo(v) : { title: v });
  }
  if (d === 'kind') return upd({ kind: it.kind === 'task' ? 'event' : 'task', project_id: it.kind === 'task' ? null : (it.project_id || activeProjects()[0]?.id || null) });
  if (d === 'save-time') {
    const v = sh.v, a = vMin(v.sh, v.sm); let b = vMin(v.eh, v.em); if (b <= a) b += 1440;
    if (t === 'sess') {
      const base = parseYmd(it.day), at = (mm) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, mm).toISOString();
      return upd({ start_at: at(a), end_at: at(b) });
    }
    if (v.allDay) return upd({ start_min: null, end_min: null });
    return upd({ start_min: a, end_min: v.noEnd && it.kind !== 'work' ? null : b });
  }
  if (d === 'del') {
    if (t === 'todo') S.todos = S.todos.filter((x) => x !== it);
    else if (t === 'event') S.events = S.events.filter((x) => x !== it);
    else S.sessions = S.sessions.filter((x) => x !== it);
    closeSheet(); try { await api.remove(table, it.id); } catch (e) { fail(e); } return;
  }
  if (d === 'save-toEvent') {
    const v = sh.v, a = vMin(v.sh, v.sm); let b = vMin(v.eh, v.em); if (b <= a) b += 1440;
    const p = projOf(v.proj);
    const row = { day: it.day, title: it.text, kind: v.kind, place: null, project_id: v.kind === 'task' ? p?.id || null : null,
      start_min: v.allDay ? null : a, end_min: v.allDay || v.noEnd ? null : b };
    S.todos = S.todos.filter((x) => x !== it); closeSheet();
    try { S.events.push(await api.insert('events', row)); await api.remove('todos', it.id); render(); } catch (e) { fail(e); }
    return;
  }
  if (d === 'toTodo') {
    const pos = Math.max(0, ...todosOf(it.day).map((x) => x.pos)) + 1;
    S.events = S.events.filter((x) => x !== it); closeSheet();
    try { S.todos.push(await api.insert('todos', { day: it.day, text: it.title, tag: null, pos })); await api.remove('events', it.id); render(); } catch (e) { fail(e); }
  }
}

// ───────── 새로 배포된 버전이 있는지 (동기화 버튼 · 앱으로 돌아올 때)
const MY_VER = (document.querySelector('script[src*="app.js"]')?.getAttribute('src').match(/v=(\w+)/) || [])[1] || '';
async function newVersion() {
  if (DEMO || !MY_VER) return false;
  try {
    const r = await fetch(`index.html?check=${Date.now()}`, { cache: 'no-store' });
    const v = ((await r.text()).match(/app\.js\?v=(\w+)/) || [])[1];
    return !!v && v !== MY_VER;
  } catch (e) { return false; }
}
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && !S.sheet && (await newVersion())) location.reload();
});

// ───────── 휴대폰: 옆으로 쓸어서 탭 넘기기
let swipe = null;
addEventListener('touchstart', (e) => {
  if (!PHONE || S.sheet || e.touches.length !== 1) { swipe = null; return; }
  const t = e.touches[0], el = e.target;
  if (t.clientX < 24 || t.clientX > innerWidth - 24) { swipe = null; return; }   // 화면 가장자리는 브라우저 뒤로가기 몫
  if (el.closest('input,textarea,.wheel,.dial') || (el.closest('[contenteditable]') && el.closest('[contenteditable]') === document.activeElement)) { swipe = null; return; }   // 글 쓰는 중엔 막기
  swipe = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });
addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.t;
  swipe = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 700) return;
  if (!['cal', 'work', 'diary', 'stats'].includes(S.view)) return;
  step(dx < 0 ? 1 : -1);
  board.animate([{ transform: `translateX(${dx < 0 ? 28 : -28}px)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 180, easing: 'ease-out' });
}, { passive: true });

// ───────── 화면 맞춤 · 시계 · 동기화
// 휴대폰 세로 화면이면 '오늘'만 따로 그린다
var PHONE = false;
function fit() {
  const phone = innerWidth < 760 && innerHeight > innerWidth;
  document.body.classList.toggle('phone', phone);
  if (phone) board.style.transform = 'none';
  else board.style.transform = `scale(${Math.min(innerWidth / 1180, innerHeight / 820)})`;
  if (phone !== PHONE) { PHONE = phone; render(); }
}
addEventListener('resize', fit); fit();

let lastDay = todayStr();
setInterval(() => {
  const d = new Date();
  const c = document.getElementById('clock'); if (c) c.textContent = clockLabel(d);
  const dt = document.getElementById('date'); if (dt) dt.innerHTML = dateLabel(d);
  const el = document.getElementById('elapsed'), r = running(); if (el && r) el.textContent = elapsed(r);
  if (ymd(d) !== lastDay) { lastDay = ymd(d); S.sel = S.diaryDay = S.plantDay = S.plantEnd = S.statDay = lastDay; render(); load(); }
}, 1000);

function route() {
  const k = location.hash.slice(1);
  if (k.startsWith('import=')) {
    try {
      const b = k.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      const json = new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
      S.imp = JSON.parse(json); S.view = 'import'; render(); return;
    } catch (e) { toast('가져올 내용을 읽지 못했어요'); }
  }
  S.view = TABS.some(([t]) => t === k) ? k : 'today';
  if (S.view === 'cal') {
    const d = parseYmd(S.sel);
    S.month = new Date(d.getFullYear(), d.getMonth(), 1); S.week = mondayOf(d);
  }
  render(); ensureLoaded();
}
addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
addEventListener('focus', () => load());
setInterval(() => { if (!document.hidden) load(); }, 60000);

// ───────── 시작
async function start() {
  if (DEMO) { S.user = { id: 'demo' }; route(); await load(); return; }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
  sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  const setUser = (u) => {
    const was = S.user?.id; S.user = u;
    if (!u) { S.todos = []; S.events = []; S.days = {}; S.loaded = [null, null]; viewLogin(); return; }
    if (was !== u.id) { route(); load(); }
  };
  setUser(data.session?.user || null);
  sb.auth.onAuthStateChange((_ev, session) => setUser(session?.user || null));
}
start();
