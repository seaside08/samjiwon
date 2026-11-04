// 삼중일기 — 1단계: 오늘 + 달력(월·주)
const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const DEMO = new URLSearchParams(location.search).has('demo');

// 근무지 — 기본 근무 시간(요일: [시작분, 끝분]), 일요일 0
const WORKPLACES = [
  { name: '언더워터', short: '언더워터', keys: ['언더워터'], shifts: { 1: [1020, 1350], 2: [1020, 1350] }, rate: 10320, payday: 10 },
  { name: '라운지돌돌', short: '라운지', keys: ['라운지돌돌', '라운지'], shifts: { 4: [930, 1170], 5: [630, 1050] }, rate: 11000, payday: 25, juhu: true, holiday: '월요일' },
  { name: '다락', short: '다락', keys: ['다락'], shifts: { 6: [660, 840], 0: [660, 840] }, rate: 11000, payday: 0 }, // 0 = 말일
];

const TABS = [
  ['today', '오늘'], ['cal', '달력'], ['projects', '프로젝트'], ['work', '근무'],
  ['diary', '기록'], ['plants', '식물'], ['stats', '통계'],
];
const SOON = {
  projects: 'PROJECTS / 프로젝트', work: 'WORK / 근무', diary: 'DIARY / 기록',
  plants: 'PLANTS / 식물', stats: 'STATS / 통계',
};
const WD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ───────── 날짜 도우미
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayStr = () => ymd(new Date());
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
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
      { id: 'p1', name: '피보테 배경 외주', stages: ['선화', '채색', '납품'], stage: 1, start_day: d(-15), end_day: d(16), pay: 400000, programs: '클립스튜디오, 포토샵', link: 'https://youtu.be/', note: '단편에 들어갈 배경 두 장.', status: 'active', pos: 1 },
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
      S.loaded = [from, to];
      render();
    } catch (e) { fail(e); }
  })();
  loading = job; return job;
}
function plantRange() {
  const e = parseYmd(S.plantEnd), t = new Date();
  return [ymd(new Date(Math.min(+addDays(e, -27), +addDays(t, -150)))), ymd(new Date(Math.max(+e, +t)))];
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
// 작업 일정: 프로젝트 이름과 겹치는 일정 (예: '피보테 배경' ↔ '피보테 배경 외주')
const isWorkEv = (e) => e.kind !== 'work' && S.projects.some((p) => p.name && e.title && p.name.length > 1 && e.title.length > 1 && (e.title.includes(p.name) || p.name.includes(e.title)));
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
  return `<header class="hd"><span id="date">${dateLabel(d)}</span><span id="clock">${clockLabel(d)}</span><span class="sum">${sum || ''}</span></header>`;
}
const dateLabel = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}. ${WD_EN[d.getDay()]}`;
const clockLabel = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function nav() {
  return `<nav class="tabs" aria-label="화면">${TABS.map(([k, l]) =>
    `<a href="#${k}" class="${S.view === k ? 'on riso2' : ''}"${S.view === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${DEMO ? '' : '<button class="out" data-act="logout">나가기</button>'}`;
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
    ...evs.map((e) => ({ k: e.start_min ?? -1, h: `<div class="e" data-act="go-day" data-day="${day}"><span class="t">${e.start_min != null ? hm(e.start_min) : ''}</span><span class="n">${e.kind === 'work' ? '<i class="sq"></i>' : ''}${esc(e.title)}</span><span class="x">${e.end_min != null ? '~' + hm(e.end_min) : ''}</span></div>` })),
    ...sessOf(day).map((s) => ({ k: minOfDay(s.start_at), h: `<div class="e"><span class="t">${hm(minOfDay(s.start_at))}</span><span class="n">작업 &#183; ${esc(sessLabel(s))}</span><span class="x">${s.end_at ? '~' + hm(minOfDay(s.end_at)) : 'REC'}</span></div>` })),
  ].sort((a, b) => a.k - b.k);
  const active = S.projects.filter((p) => p.status === 'active').sort((a, b) => a.pos - b.pos);
  const now = r ? `<div class="nw">
        <div style="display:flex;align-items:center;gap:12px"><span class="bk">NOW WORKING &#8212; ${esc(sessLabel(r))}</span><span class="red" style="font-size:12px;letter-spacing:.04em">&#9679; REC</span></div>
        <span id="elapsed" class="big-t">${elapsed(r)}</span>
        <div style="display:flex;gap:14px;align-items:center;margin-top:4px"><button class="btn" data-act="stop">멈추고 기록</button><button class="ul" data-act="discard">기록 안 함</button></div>
      </div>` : active.length ? `<div class="nw idle"><span style="font-size:13px">작업 시작</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px">${active.map((p) => `<button class="ul" data-act="start" data-id="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>` : '';
  if (PHONE) return `${header('')}
  <section class="ph">
    <div class="row"><span class="bk">TODAY / 오늘 할 일</span><span class="red" style="font-size:16px">[ ${done} / ${todos.length} ]</span></div>
    <div class="todos">${todos.map(todoRow).join('')}</div>
    ${addForm('todo', '할 일 추가', 'margin-top:12px')}
    <div class="vow"><span class="lb">다짐</span><span class="tx riso-hl" contenteditable="plaintext-only" data-vow="${day}" spellcheck="false">${esc(vow)}</span></div>
    ${items.length ? `<div class="sched riso"><div class="h"><span>SCHEDULE</span><span>${pad(d.getMonth() + 1)} / ${pad(d.getDate())}</span></div>${items.map((x) => x.h.replace(' data-act="go-day"', '')).join('')}</div>` : ''}
    ${now}
    <div class="ph-sum">작업 ${dur(sess)} &#183; 근무 ${dur(work)} &#183; 이번 주 작업 ${dur(weekSess)}</div>
  </section>`;
  return `${header(`할 일 ${done}/${todos.length} &#183; 작업 ${dur(sess)}`)}
  <div class="main" style="gap:36px">
    <section class="left">
      <div class="row"><span class="bk">TODAY / 오늘 할 일</span><span class="red" style="font-size:15px">[ ${done} / ${todos.length} ]</span></div>
      <div class="todos">${todos.map(todoRow).join('')}</div>
      ${addForm('todo', '할 일 추가', 'margin-top:14px;width:75%')}
      <div class="vow"><span class="lb">다짐</span><span class="tx riso-hl" contenteditable="plaintext-only" data-vow="${day}" spellcheck="false">${esc(vow)}</span></div>
    </section>
    <section class="today-side">
      <div class="sched riso">
        <div class="h"><span>SCHEDULE</span><span>${pad(d.getMonth() + 1)} / ${pad(d.getDate())}</span></div>
        ${items.map((x) => x.h).join('')}
      </div>
      <span class="cap">오늘의 일정 ${evs.length} &#183; ${work ? '근무 ' + dur(work) : '근무 없음'}</span>
      ${now}
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
    <span class="bk" style="margin-bottom:8px">${pad(d.getMonth() + 1)} / ${pad(d.getDate())} ${WD_EN[d.getDay()]}</span>
    ${evs.map((e) => `<div class="ev" data-id="${e.id}" data-act="edit-event"><span class="t">${e.start_min != null ? hm(e.start_min) : ''}</span><span class="n">${e.kind === 'work' ? '<i class="sq"></i>' : ''}${esc(e.title)}${e.end_min != null ? ' ~' + hm(e.end_min) : ''}</span></div>`).join('')}
    ${sessOf(day).filter((s) => s.end_at).map((s) => `<div class="ev" data-id="${s.id}" data-act="edit-sess"><span class="t">${hm(minOfDay(s.start_at))}</span><span class="n">작업 &#183; ${esc(sessLabel(s))} ~${hm(minOfDay(s.end_at))}</span></div>`).join('')}
    ${addForm('event', '일정 추가', 'margin-top:6px')}
    <span class="lbl red">할 일 [ ${done} / ${todos.length} ]</span>
    <div class="todos">${todos.map(todoRow).join('')}</div>
    ${addForm('todo-sel', '할 일 추가')}
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
      const cls = ds === today ? 'now' : (ds === S.sel ? 'riso3' : '') + (inMonth ? '' : ' dim');
      grid += `<div class="cell" data-act="sel" data-day="${ds}"><b class="${cls}">${d.getDate()}</b>
        ${evs.map((e, i) => e.kind === 'work'
          ? `<span class="ln"><i class="sq"></i>${esc(wpOf(e)?.short || e.title)}</span>`
          : e.start_min == null
            ? `<span class="ln">${esc(e.title)}</span>`
            : `<span class="ln${isWorkEv(e) ? ` rz ${['riso', 'riso2', 'riso3'][(d.getDate() + i) % 3]}` : ''}"><em class="tm">${hm(e.start_min)} </em>${esc(e.title)}</span>`).join('')}
        ${Object.entries(sessOf(ds).reduce((a, s) => { const k = sessLabel(s); a[k] = (a[k] || 0) + sessMin(s); return a; }, {})).map(([k, v], j) => `<span class="ln rz ${['riso3', 'riso', 'riso2'][(d.getDate() + j) % 3]}">${esc(k)} ${dur(v)}</span>`).join('')}
      </div>`;
    }
    grid += '</div>';
  }
  return `${header(`${mo + 1}월 근무 ${workDays}일 &#183; ${dur(workTotal)} &#183; 작업 ${dur(sessTotal)}`)}
  <div class="main">
    <section class="left" style="--rowh:${rows > 5 ? 96 : 110}px">
      ${calCtl(`${y}. ${pad(mo + 1)}`, '이전 달', '다음 달')}
      <div class="wd">${WD_EN.map((w) => `<span>${w}</span>`).join('')}</div>
      ${grid}
    </section>
    ${daySide()}
  </div>`;
}

function viewWeek() {
  const ws = S.week, we = addDays(ws, 6), today = todayStr();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const H0 = 10 * 60, PX = 40 / 60; // 10시부터, 1시간 40px
  let weekWork = 0, weekSess = 0;
  const allday = days.map((d) => eventsOf(ymd(d)).filter((e) => e.start_min == null));
  const hasAll = allday.some((a) => a.length);
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const cols = days.map((d, i) => {
    const ds = ymd(d);
    let k = 0;
    const blks = eventsOf(ds).filter((e) => e.start_min != null).map((e) => {
      weekWork += workMin(e);
      const top = Math.max(0, (e.start_min - H0) * PX);
      const t = `${hShort(e.start_min)}${e.end_min != null ? '&#8211;' + hShort(e.end_min) : ''}`;
      if (e.end_min == null) return `<div class="blk" style="top:${top}px">${hm(e.start_min)}<br>${esc(e.title)}</div>`;
      const h = Math.max(28, Math.min(560, (e.end_min - H0) * PX) - top);
      if (e.kind !== 'work' && !isWorkEv(e)) return `<div class="blk" style="top:${top}px">${hm(e.start_min)}<br>${esc(e.title)}</div>`;
      const cls = e.kind === 'work' ? 'work' : ['riso', 'riso2', 'riso3'][(k++ + i) % 3];
      return `<div class="blk ${cls}" style="top:${top}px;height:${h}px">${esc(e.title)}<br>${t}</div>`;
    }).join('') + sessOf(ds).map((s, j) => {
      weekSess += sessMin(s);
      const a = minOfDay(s.start_at), b = s.end_at ? minOfDay(s.end_at) : nowMin;
      const top = Math.max(0, (a - H0) * PX), h = Math.max(28, Math.min(560, (Math.max(b, a) - H0) * PX) - top);
      return `<div class="blk ${['riso', 'riso2', 'riso3'][(j + i + 1) % 3]}" style="top:${top}px;height:${h}px">${esc(sessLabel(s))}<br>${hShort(a)}&#8211;${s.end_at ? hShort(b) : ''}</div>`;
    }).join('');
    const line = ds === today && nowMin >= H0 ? `<div class="nowline" style="top:${(nowMin - H0) * PX}px"></div><div class="nowsq" style="top:${(nowMin - H0) * PX - 3}px"></div>` : '';
    return `<div class="col" data-act="sel" data-day="${ds}">${blks}${line}</div>`;
  });
  const heads = days.map((d) => {
    const ds = ymd(d);
    return `<span class="dh" data-act="sel" data-day="${ds}">${WD_EN[d.getDay()]} <span class="n ${ds === today ? 'now' : ds === S.sel ? 'riso3' : ''}">${pad(d.getDate())}</span></span>`;
  });
  const hours = [10, 12, 14, 16, 18, 20, 22].map((h, i) => `<span style="top:${4 + i * 80}px">${h}</span>`).join('');
  return `${header(`이번 주 작업 ${dur(weekSess)} &#183; 근무 ${dur(weekWork)}`)}
  <div class="main">
    <section class="left">
      ${calCtl(`${pad(ws.getMonth() + 1)}. ${pad(ws.getDate())} &#8212; ${pad(we.getMonth() + 1)}. ${pad(we.getDate())}`, '이전 주', '다음 주')}
      <div class="wgrid">
        <span></span>${heads.join('')}
        ${hasAll ? '<span></span>' + allday.map((a, i) => `<div class="allday" data-act="sel" data-day="${ymd(days[i])}">${a.map((e) => `<span class="adl">${esc(e.title)}</span>`).join('')}</div>`).join('') : ''}
        <div class="hours">${hours}</div>${cols.join('')}
      </div>
    </section>
    ${daySide()}
  </div>`;
}

// ───────── 근무
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
const paydayLabel = (w) => (w.payday ? `${w.payday}일` : '말일');
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
  const sel = WORKPLACES.find((w) => w.name === S.wp) || WORKPLACES[0];
  const all = WORKPLACES.map((w) => ({ w, s: workStats(w), sofar: workStats(w, today) }));
  const sum = all.reduce((a, r) => ({ mins: a.mins + r.s.mins, total: a.total + r.s.total, sofar: a.sofar + r.sofar.total }), { mins: 0, total: 0, sofar: 0 });
  const cur = all.find((r) => r.w === sel).s;
  const isNow = m.getFullYear() === new Date().getFullYear() && mo === new Date().getMonth();
  const rows = all.map(({ w, s }) => `<div class="mr" data-act="wp" data-wp="${w.name}">
      <div style="display:flex;flex-direction:column"><span class="nm">${w === sel ? `<span class="riso-hl" style="padding:0 3px">${w.name}</span>` : w.name}</span>
      <span class="sub">${routineLabel(w)} &#183; ${won(w.rate)}${w.juhu ? ' &#183; 주휴' : ''}</span></div>
      <span class="r">${dur(s.mins)}</span><span class="r">${won(s.total)}</span><span class="r">${paydayLabel(w)}</span></div>`).join('');
  return `${header(`${mo + 1}월 ${isNow ? `지금까지 ${won(sum.sofar)} &#183; ` : ''}예상 ${won(sum.total)}`)}
  <div class="main">
    <section class="left">
      <div class="row"><span class="bk">WORK / 근무</span><span style="font-size:15px">[ ${WORKPLACES.length} ]</span>
        <span style="margin-left:auto;font-size:22px;letter-spacing:-.01em">${m.getFullYear()}. ${pad(mo + 1)}</span>
        <span class="arr" style="display:flex;gap:8px;margin-left:10px;font-size:15px"><button data-act="prev" aria-label="이전 달">&#8592;</button><button data-act="next" aria-label="다음 달">&#8594;</button></span></div>
      <div class="mr hd2"><span>근무지 &#183; 기본 근무</span><span class="r">시간</span><span class="r">세전</span><span class="r">지급</span></div>
      ${rows}
      <div class="mr" style="border-top:3px solid #141414;border-bottom:1.5px solid #141414;cursor:default">
        <span class="nm">${mo + 1}월 합계</span><span class="r">${dur(sum.mins)}</span><span class="r">${won(sum.total)}</span><span class="r"></span></div>
    </section>
    <section class="side">
      <span class="bk" style="margin-bottom:8px">${sel.name}</span>
      <div class="kv"><span>시급</span><span>${won(sel.rate)}</span></div>
      <div class="kv"><span>근무</span><span>${cur.count}회 &#183; ${dur(cur.mins)}</span></div>
      <div class="kv"><span>기본급</span><span>${won(cur.base)}</span></div>
      ${sel.juhu ? `<div class="kv"><span>주휴수당</span><span>${won(cur.juhu)}</span></div><div class="kv" style="font-size:13px"><span>주휴일</span><span>${sel.holiday}</span></div>` : ''}
      <span style="margin-top:14px;font-size:13px">${mo + 1}월 세전</span>
      <span style="font-size:34px;letter-spacing:-.01em">${won(cur.total)}</span>
      <span style="font-size:13px">매월 ${paydayLabel(sel)} 지급</span>
      <button class="btn" style="margin-top:18px" data-act="fill" data-wp="${sel.name}">${mo + 1}월 기본 근무 채우기</button>
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
function viewImport() {
  const I = S.imp || { work: [] };
  const hit = (e) => e.kind === 'work' && (!I.places || I.places.includes(e.place));
  const old = S.events.filter((e) => hit(e) && e.day >= I.from && e.day <= I.to).length;
  const rows = I.work.map(([day, place, a, b]) => {
    const d = parseYmd(day);
    return `<div class="ir"><span>${md(day)} ${WD_EN[d.getDay()]}</span><span><i class="sq"></i>${esc(place)}</span><span>${hm(a)}&#8211;${hm(b)}</span><span class="r">${dur(b - a)}</span></div>`;
  }).join('');
  const total = I.work.reduce((x, w) => x + (w[3] - w[2]), 0);
  return `${header(`근무 ${I.work.length}회 &#183; ${dur(total)}`)}
  <div class="main"><section class="left">
    <div class="row"><span class="bk">IMPORT / 근무표 가져오기</span><span style="font-size:15px">${md(I.from)} &#8212; ${md(I.to)}</span></div>
    <div class="ilist">${rows}</div>
    <span style="margin-top:14px;font-size:13px">${old ? `이 기간에 이미 있는 ${I.places ? I.places.join('·') + ' ' : ''}근무 ${old}개는 지우고 바꿔 넣어요` : ''}</span>
    <div style="display:flex;gap:16px;align-items:center;margin-top:14px"><button class="btn" data-act="imp-ok">달력에 넣기</button><button class="ul" data-act="imp-no">취소</button></div>
  </section></div>`;
}
async function runImport() {
  const I = S.imp; if (!I) return;
  try {
    const cur = await api.list('events', I.from, I.to);
    for (const e of cur.filter((x) => x.kind === 'work' && (!I.places || I.places.includes(x.place)))) await api.remove('events', e.id);
    await api.insertMany('events', I.work.map(([day, place, a, b]) => ({ day, start_min: a, end_min: b, title: place, kind: 'work', place })));
    S.imp = null; S.loaded = [null, null];
    S.month = new Date(parseYmd(I.from).getFullYear(), parseYmd(I.from).getMonth(), 1);
    location.hash = '#work';
    toast(`근무 ${I.work.length}회를 달력에 넣었어요`);
  } catch (e) { fail(e); }
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

function render() {
  if (!S.user) return;
  // 편집 중이면 다시 그리지 않음
  const a = document.activeElement;
  if (a && board.contains(a) && (a.tagName === 'INPUT' || a.isContentEditable) && (a.value || a.textContent)) { pendingRender = true; return; }
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
  board.innerHTML = html + nav();
  if (focusAdd) board.querySelector(`form[data-add="${focusAdd}"] input`)?.focus();
}
let pendingRender = false;

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
  const p = parseEvent(raw, day); if (!p) return;
  const tmp = { id: 'tmp' + Date.now(), day, ...p };
  S.events.push(tmp); render();
  try { Object.assign(tmp, await api.insert('events', { day, ...p })); } catch (e) { fail(e); S.events = S.events.filter((x) => x !== tmp); }
  render();
}

board.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const input = f.querySelector('input'), v = input.value.trim();
  const k = f.dataset.add;
  if (k === 'pmemo') { input.blur(); return; }
  input.value = '';
  if (!v) return;
  if (k === 'plant') { handleAddMore(k, v); return; }
  if (k === 'todo') addTodo(todayStr(), v);
  else if (k === 'todo-sel') addTodo(S.sel, v);
  else if (k === 'event') addEvent(S.sel, v);
});

board.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'toggle') {
    const t = S.todos.find((x) => x.id === el.closest('.todo').dataset.id); if (!t) return;
    t.done = !t.done; t.done_at = t.done ? new Date().toISOString() : null; render();
    try { await api.update('todos', t.id, { done: t.done, done_at: t.done_at }); } catch (er) { fail(er); }
  } else if (act === 'edit-todo') {
    const row = el.closest('.todo'), t = S.todos.find((x) => x.id === row.dataset.id); if (!t) return;
    inlineEdit(el, todoInput(t), async (v) => {
      if (!v) { S.todos = S.todos.filter((x) => x !== t); render(); try { await api.remove('todos', t.id); } catch (er) { fail(er); } return; }
      Object.assign(t, parseTodo(v)); render();
      try { await api.update('todos', t.id, { text: t.text, tag: t.tag }); } catch (er) { fail(er); }
    });
  } else if (act === 'edit-event') {
    const ev = S.events.find((x) => x.id === el.dataset.id); if (!ev) return;
    inlineEdit(el, eventInput(ev), async (v) => {
      if (!v) { S.events = S.events.filter((x) => x !== ev); render(); try { await api.remove('events', ev.id); } catch (er) { fail(er); } return; }
      const p = parseEvent(v, ev.day); if (!p) return render();
      Object.assign(ev, p); render();
      try { await api.update('events', ev.id, p); } catch (er) { fail(er); }
    });
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
    const k = act === 'prev' ? -1 : 1;
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
  } else if (act === 'wp') {
    S.wp = el.dataset.wp; render();
  } else if (act === 'fill') {
    fillRoutine(WORKPLACES.find((w) => w.name === el.dataset.wp));
  } else if (handleMore(act, el, e)) {
    // 처리됨
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
  const list = (S.projArchive ? archived : active).sort((a, b) => a.pos - b.pos);
  const sel = list.find((p) => p.id === S.proj) || list[0];
  const r = running();
  const total = active.reduce((a, p) => a + projMin(p), 0);
  const rows = list.map((p, i) => `<div class="pr${i === list.length - 1 ? ' last' : ''}" data-act="proj" data-id="${p.id}">
      <div style="display:flex;flex-direction:column;min-width:0"><span class="nm">${p === sel ? `<span class="riso-hl" style="padding:0 3px">${esc(p.name)}</span>` : esc(p.name)}${r && r.project_id === p.id ? ' <span class="red" style="font-size:12px">&#9679; REC</span>' : ''}</span>
      <span class="st">${S.projArchive ? `<span>${STATUS[p.status]}</span>` : ''}${stageChain(p)}</span></div>
      <span class="r">${dur(projMin(p))}</span><span class="r${p.pay ? '' : ' mu'}">${p.pay ? won(p.pay) : '&#8212;'}</span></div>`).join('');
  const f = (label, key, val) => `<div class="kv" data-act="pf" data-f="${key}"><span>${label}</span><span>${val}</span></div>`;
  const side = sel ? `<section class="side">
      <span class="bk" style="margin-bottom:8px" data-act="pf" data-f="name">${esc(sel.name)}</span>
      ${f('기간', 'period', periodLabel(sel))}
      ${f('보수', 'pay', sel.pay ? won(sel.pay) : '<span class="mu">&#8212;</span>')}
      <div class="kv"><span>작업</span><span>${dur(projMin(sel))}</span></div>
      <span class="lb" data-act="pf" data-f="stages">단계</span><span data-act="pf" data-f="stages" style="font-size:14px">${(sel.stages || []).length ? esc(sel.stages.join(' → ')) : '<span class="mu">&#8212;</span>'}</span>
      <span class="lb" data-act="pf" data-f="programs">프로그램</span><span data-act="pf" data-f="programs">${sel.programs ? esc(sel.programs) : '<span class="mu">&#8212;</span>'}</span>
      <span class="lb" data-act="pf" data-f="link">링크</span>${sel.link ? `<a class="lnk" href="${esc(/^https?:/.test(sel.link) ? sel.link : 'https://' + sel.link)}" target="_blank" rel="noopener">${esc(sel.link.replace(/^https?:\/\//, ''))}</a>` : '<span data-act="pf" data-f="link" class="mu">&#8212;</span>'}
      <span class="lb" data-act="pf" data-f="note">작가 노트</span><p class="note" data-act="pf" data-f="note">${sel.note ? esc(sel.note) : '<span class="mu">&#8212;</span>'}</p>
      ${sel.status === 'active'
        ? `${r && r.project_id === sel.id ? '<button class="btn" style="margin-top:16px" data-act="stop">멈추고 기록</button>' : `<button class="btn" style="margin-top:16px" data-act="start" data-id="${sel.id}">작업 시작</button>`}
           <div class="acts"><button class="ul" data-act="pstatus" data-s="done">완료</button><button class="ul" data-act="pstatus" data-s="archived">보관</button><button class="ul" data-act="pstatus" data-s="stopped">중단</button></div>`
        : `<div class="acts" style="margin-top:16px"><button class="ul" data-act="pstatus" data-s="active">다시 진행</button><button class="ul" data-act="pdel">삭제</button></div>`}
    </section>` : '<section class="side"></section>';
  return `${header(`진행 중 ${active.length} &#183; 작업 ${dur(total)}`)}
  <div class="main">
    <section class="left">
      <div class="row"><span class="bk">PROJECTS / ${S.projArchive ? '보관함' : '진행 중'}</span><span style="font-size:15px">[ ${list.length} ]</span>
        ${S.projArchive ? '' : '<button aria-label="프로젝트 추가" data-act="proj-add" style="margin-left:auto;font-size:20px;padding:0 2px">+</button>'}</div>
      <div class="pr hd2"><span>이름 &#183; 단계</span><span class="r">작업</span><span class="r">보수</span></div>
      <div class="scroll">${rows}</div>
      <button class="lk" data-act="proj-archive">${S.projArchive ? '&#8592; 진행 중' : `보관함 [ ${archived.length} ] &#8594;`}</button>
    </section>
    ${side}
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
    ...evs.map((e) => `<span>${e.start_min != null ? hm(e.start_min) + ' ' : ''}${esc(e.title)}</span>`),
    todos.length ? `<span class="red">할 일 [ ${done} / ${todos.length} ]</span>` : '',
    watered.length ? `<span>물 &#183; ${esc(watered.join(', '))}</span>` : '',
  ].join('');
  const recent = S.recent.filter((r) => r.day !== day).slice(0, 6);
  return `${header(`${mo + 1}월 일기 ${count}편`)}
  <div class="main">
    <section class="left" style="gap:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="bk">DIARY / 기록</span>
        <span style="margin-left:18px;font-size:22px;letter-spacing:-.01em">${pad(mo + 1)}. ${pad(d.getDate())} ${WD_EN[d.getDay()]}</span>
        <button data-act="prev" aria-label="이전 날" style="font-size:15px;padding:0 2px">&#8592;</button>
        <button data-act="next" aria-label="다음 날" style="font-size:15px;padding:0 2px">&#8594;</button>
        ${day !== todayStr() ? '<button class="ul" data-act="diary-today" style="margin-left:8px;font-size:13px">오늘</button>' : ''}
      </div>
      <div class="strip">${strip}</div>
      <div style="display:flex;align-items:baseline;gap:14px">
        <span class="dlb">다짐</span>
        <span class="riso-hl vowtx" contenteditable="plaintext-only" data-vow="${day}" spellcheck="false">${esc(rec.vow || '')}</span>
      </div>
      <div style="display:flex;flex-direction:column;min-height:0;flex-grow:1">
        <div style="display:flex;align-items:baseline;gap:14px;min-height:0;flex-grow:1">
          <span class="dlb">일기</span>
          <p class="diary" contenteditable="plaintext-only" data-diary="${day}" spellcheck="false">${esc(rec.diary || '')}</p>
        </div>
        <div style="border-bottom:1.5px solid var(--ink);height:24px;flex:none"></div>
      </div>
    </section>
    <section class="side" style="gap:0">
      <span class="bk" style="margin-bottom:14px">지난 기록</span>
      ${recent.map((r, i) => `<div class="ent${i === recent.length - 1 ? ' last' : ''}" data-act="diary-go" data-day="${r.day}"><b>${md(r.day)} ${WD_EN[parseYmd(r.day).getDay()]}</b><span>${esc(firstLine(r.diary))}</span></div>`).join('')}
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
  const next = lastW && p.interval_days ? ymd(addDays(parseYmd(lastW), p.interval_days)) : null;
  return { lastW, lastM, next };
}
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
        ${gone.map((p, i) => `<div class="gr${i === gone.length - 1 ? ' last' : ''}" data-act="plant" data-id="${p.id}"><b class="${p === sel ? 'riso-hl' : ''}" style="padding:0 3px;margin-left:-3px">${esc(p.name)}</b><span>${esc(p.species || '')}</span><span>${p.gone_day ? md(p.gone_day) : ''}</span></div>`).join('')}
        <button class="lk" data-act="plant-gone">&#8592; 함께 사는 식물</button>
      </section>
      <section class="side">${sel ? `<span class="bk" style="margin-bottom:8px">${esc(sel.name)}</span><span style="font-size:13px">${esc(sel.species || '')}</span>
        <button class="ul" style="align-self:flex-start;margin-top:16px;font-size:13px" data-act="plant-back">다시 함께 살기</button>` : ''}</section>
    </div>`;
  }
  const N = PHONE ? 14 : 28;
  const end = parseYmd(S.plantEnd), start = addDays(end, -(N - 1));
  const days = [...Array(N)].map((_, i) => ymd(addDays(start, i)));
  const sel = alive.find((p) => p.id === S.plant) || alive[0];
  const selDay = days.includes(S.plantDay) || S.plantDay === today ? S.plantDay : today;
  const hd = days.map((ds, i) => {
    const n = parseYmd(ds).getDate();
    if (ds === today) return `<span class="tday">${n}<i></i></span>`;
    return `<span>${i % 7 === 0 ? n : ''}</span>`;
  }).join('');
  const rows = alive.map((p) => {
    const cells = days.map((ds) => {
      const l = logOf(p.id, ds);
      const on = p === sel && ds === selDay;
      return `<i data-act="pcell" data-id="${p.id}" data-day="${ds}" class="${l?.watered ? 'riso w' : ''}${l?.memo ? ' m' : ''}${on ? ' on' : ''}"></i>`;
    }).join('');
    let pop = '';
    if (p === sel) {
      const l = logOf(p.id, selDay), idx = days.indexOf(selDay);
      if (l?.memo && idx >= 0) pop = `<div class="pop" style="left:calc(var(--nw) + (100% - var(--nw)) * ${idx} / ${N} - ${idx > N / 2 ? 160 : -10}px)"><b>${md(selDay)} ${WD_EN[parseYmd(selDay).getDay()]}</b><span>${esc(l.memo)}</span></div>`;
    }
    return `<div class="tl-row${p === sel ? ' sel' : ''}" style="--n:${N}"><span class="nm" data-act="plant" data-id="${p.id}"><b>${esc(p.name)}</b><small>${esc(p.species || '')}</small></span>${cells}${pop}</div>`;
  }).join('');
  let side = '<section class="side"></section>';
  if (sel) {
    const st = plantStats(sel), l = logOf(sel.id, selDay);
    side = `<section class="side">
      <span class="bk" style="margin-bottom:8px" data-act="pl-name">${esc(sel.name)}</span>
      <span style="font-size:13px" data-act="pl-name">${esc(sel.species || '')}</span>
      <div class="kv" style="margin-top:8px" data-act="pl-int"><span>물 주기</span><span>${sel.interval_days ? sel.interval_days + '일' : '<span class="mu">&#8212;</span>'}</span></div>
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
        <span style="margin-left:auto;font-size:15px">${pad(start.getMonth() + 1)}. ${pad(start.getDate())} &#8212; ${pad(end.getMonth() + 1)}. ${pad(end.getDate())}</span>
        <span style="display:flex;gap:8px;margin-left:6px;font-size:15px"><button data-act="prev" aria-label="이전 4주">&#8592;</button><button data-act="next" aria-label="다음 4주">&#8594;</button></span>
        <button aria-label="식물 추가" data-act="plant-add" style="font-size:20px;padding:0 2px;margin-left:8px">+</button></div>
      ${S.plantAdd ? addForm('plant', '식물 추가', 'width:60%;margin:-4px 0 10px') : ''}
      <div class="tlg">
        <div class="tl-hd" style="--n:${N}"><span>이름 &#183; 종류</span>${hd}</div>
        ${rows}
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
  for (const ds of days) { const t = todosOf(ds); tn += t.length; td += t.filter((x) => x.done).length; appt += eventsOf(ds).filter((e) => e.kind !== 'work').length; }
  const max = Math.max(240, ...per.map((x) => x.s + x.w)), px = 140 / max;
  const statDay = days.includes(S.statDay) ? S.statDay : days[0];
  const bars = per.map((x, i) => `<div class="dy${x.ds === statDay ? ' sel' : ''}" data-act="stat-day" data-day="${x.ds}"><i class="riso" style="height:${x.s * px}px"></i><i class="jb" style="height:${x.w * px}px"></i><span>${[0, 4, 9, 14, 19, 24, 29].includes(i) || i === last - 1 && last === 31 ? i + 1 : ''}</span></div>`).join('');
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
    </section>
    <section class="side">
      <span class="bk" style="margin-bottom:8px">${pad(sd.getMonth() + 1)} / ${pad(sd.getDate())} ${WD_EN[sd.getDay()]}</span>
      <div class="kv"><span>작업</span><span>${dur(daySess(statDay))}</span></div>
      <div class="kv"><span>근무</span><span>${dur(dayWork(statDay))}</span></div>
      <div class="kv"><span>할 일</span><span class="red">[ ${st.filter((t) => t.done).length} / ${st.length} ]</span></div>
      ${rec.vow ? `<span class="lb">다짐</span><span>${esc(rec.vow)}</span>` : ''}
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
  if (act === 'start') { startWork(projOf(el.dataset.id)); return true; }
  if (act === 'stop') { const r = running(); if (r) stopWork(r); return true; }
  if (act === 'discard') { const r = running(); if (r) discardWork(r); return true; }
  if (act === 'edit-sess') {
    const s = S.sessions.find((x) => x.id === el.dataset.id); if (!s) return true;
    const a = minOfDay(s.start_at), b = minOfDay(s.end_at);
    inlineEdit(el, `${hm(a)}-${hm(b)}`, async (v) => {
      if (!v) { await discardWork(s); return; }
      const m = v.match(new RegExp('^' + RANGE + '$'));
      if (!m || !m[3]) return render();
      const base = parseYmd(s.day), sm = toMin(m[1], m[2]), em = toMin(m[3], m[4]);
      if (sm == null || em == null) return render();
      const at = (mm) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, mm).toISOString();
      s.start_at = at(sm); s.end_at = at(em > sm ? em : em + 1440); render();
      try { await api.update('sessions', s.id, { start_at: s.start_at, end_at: s.end_at }); } catch (er) { fail(er); }
    });
    return true;
  }
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
  if (act === 'pf') {
    const p = projOf(S.proj) || S.projects.filter((x) => (S.projArchive ? x.status !== 'active' : x.status === 'active')).sort((a, b) => a.pos - b.pos)[0];
    if (!p) return true;
    const fld = el.dataset.f;
    let target = el.classList.contains('kv') ? el.lastElementChild : el;
    if (el.classList.contains('lb')) target = el.nextElementSibling;
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
    inlineEdit(el.lastElementChild, plant.interval_days ? String(plant.interval_days) : '', async (v) => {
      const n = parseInt(v, 10); plant.interval_days = n > 0 ? n : null; render();
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
  const dt = document.getElementById('date'); if (dt) dt.textContent = dateLabel(d);
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
