// 삼중일기 — 1단계: 오늘 + 달력(월·주)
const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const DEMO = new URLSearchParams(location.search).has('demo');

// 근무지 — 기본 근무 시간(요일: [시작분, 끝분]), 일요일 0
const WORKPLACES = [
  { name: '언더워터', short: '언더워터', keys: ['언더워터'], shifts: { 1: [1020, 1350], 2: [1020, 1350] } },
  { name: '라운지돌돌', short: '라운지', keys: ['라운지돌돌', '라운지'], shifts: { 4: [930, 1170], 5: [630, 1050] } },
  { name: '다락', short: '다락', keys: ['다락'], shifts: { 6: [660, 840], 0: [660, 840] } },
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
  user: null, loaded: [null, null],
};
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
    days: [{ day: d(0), vow: '오늘은 한 장만 제대로.' }],
  };
  return {
    async list(table, from, to) { return db[table].filter((r) => r.day >= from && r.day <= to).map((r) => ({ ...r })); },
    async insert(table, row) { const r = { id: id(), ...row }; db[table].push(r); return { ...r }; },
    async update(table, rid, patch) { Object.assign(db[table].find((r) => r.id === rid), patch); },
    async remove(table, rid) { db[table] = db[table].filter((r) => r.id !== rid); },
    async saveDay(day, patch) { const r = db.days.find((x) => x.day === day); r ? Object.assign(r, patch) : db.days.push({ day, ...patch }); },
  };
}

// ───────── 불러오기
function wantedRange() {
  const gs = addDays(S.month, -S.month.getDay());
  const ge = addDays(gs, 41);
  const ws = S.week, we = addDays(S.week, 6);
  const t = new Date(); const tm = mondayOf(t); const te = addDays(tm, 6);
  const sel = parseYmd(S.sel);
  const all = [gs, ge, ws, we, tm, te, sel];
  return [ymd(new Date(Math.min(...all))), ymd(new Date(Math.max(...all)))];
}
let loading = null;
async function load() {
  if (!S.user) return;
  const [from, to] = wantedRange();
  const job = (async () => {
    try {
      const [todos, events, days] = await Promise.all([
        api.list('todos', from, to), api.list('events', from, to), api.list('days', from, to),
      ]);
      S.todos = todos; S.events = events;
      S.days = Object.fromEntries(days.map((r) => [r.day, r]));
      S.loaded = [from, to];
      render();
    } catch (e) { fail(e); }
  })();
  loading = job; return job;
}
function ensureLoaded() {
  const [from, to] = wantedRange();
  if (!S.loaded[0] || from < S.loaded[0] || to > S.loaded[1]) load();
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
  let weekWork = 0;
  for (let i = 0; i < 7; i++) weekWork += eventsOf(ymd(addDays(mon, i))).reduce((a, e) => a + workMin(e), 0);
  const vow = S.days[day]?.vow || '';
  const d = new Date();
  return `${header(`할 일 ${done}/${todos.length} &#183; 근무 ${dur(work)}`)}
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
        ${evs.map((e) => `<div class="e" data-act="go-day" data-day="${day}"><span class="t">${e.start_min != null ? hm(e.start_min) : ''}</span><span class="n">${e.kind === 'work' ? '<i class="sq"></i>' : ''}${esc(e.title)}</span><span class="x">${e.end_min != null ? '~' + hm(e.end_min) : ''}</span></div>`).join('')}
      </div>
      <span class="cap">오늘의 일정 ${evs.length} &#183; ${work ? '근무 ' + dur(work) : '근무 없음'}</span>
      <div class="mini">근무 ${dur(work)}<br>이번 주 근무 ${dur(weekWork)}</div>
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
  let workDays = 0, workTotal = 0;
  for (let i = 1; i <= last.getDate(); i++) {
    const w = eventsOf(ymd(new Date(y, mo, i))).reduce((a, e) => a + workMin(e), 0);
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
        ${evs.map((e) => e.kind === 'work'
          ? `<span class="ln"><i class="sq"></i>${esc(wpOf(e)?.short || e.title)}</span>`
          : e.start_min == null
            ? `<span class="bar riso2">${esc(e.title)}</span>`
            : `<span class="ln">${hm(e.start_min)} ${esc(e.title)}</span>`).join('')}
        ${todos.length ? `<span class="ln red">[ ${done} / ${todos.length} ]</span>` : ''}
      </div>`;
    }
    grid += '</div>';
  }
  return `${header(`${mo + 1}월 근무 ${workDays}일 &#183; ${dur(workTotal)}`)}
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
  let weekWork = 0;
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
      const cls = e.kind === 'work' ? 'work' : ['riso', 'riso2', 'riso3'][(k++ + i) % 3];
      return `<div class="blk ${cls}" style="top:${top}px;height:${h}px">${esc(e.title)}<br>${t}</div>`;
    }).join('');
    const line = ds === today && nowMin >= H0 ? `<div class="nowline" style="top:${(nowMin - H0) * PX}px"></div><div class="nowsq" style="top:${(nowMin - H0) * PX - 3}px"></div>` : '';
    return `<div class="col" data-act="sel" data-day="${ds}">${blks}${line}</div>`;
  });
  const heads = days.map((d) => {
    const ds = ymd(d);
    return `<span class="dh" data-act="sel" data-day="${ds}">${WD_EN[d.getDay()]} <span class="n ${ds === today ? 'now' : ds === S.sel ? 'riso3' : ''}">${pad(d.getDate())}</span></span>`;
  });
  const hours = [10, 12, 14, 16, 18, 20, 22].map((h, i) => `<span style="top:${4 + i * 80}px">${h}</span>`).join('');
  return `${header(`이번 주 근무 ${dur(weekWork)}`)}
  <div class="main">
    <section class="left">
      ${calCtl(`${pad(ws.getMonth() + 1)}. ${pad(ws.getDate())} &#8212; ${pad(we.getMonth() + 1)}. ${pad(we.getDate())}`, '이전 주', '다음 주')}
      <div class="wgrid">
        <span></span>${heads.join('')}
        ${hasAll ? '<span></span>' + allday.map((a, i) => `<div class="allday" data-act="sel" data-day="${ymd(days[i])}">${a.map((e) => `<span class="bar riso2">${esc(e.title)}</span>`).join('')}</div>`).join('') : ''}
        <div class="hours">${hours}</div>${cols.join('')}
      </div>
    </section>
    ${daySide()}
  </div>`;
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
  input.value = '';
  if (!v) return;
  const k = f.dataset.add;
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
    if (S.calMode === 'month') {
      S.month = new Date(S.month.getFullYear(), S.month.getMonth() + k, 1);
      const t = new Date();
      S.sel = S.month.getMonth() === t.getMonth() && S.month.getFullYear() === t.getFullYear() ? todayStr() : ymd(S.month);
    } else {
      S.week = addDays(S.week, 7 * k);
      const t = todayStr();
      S.sel = t >= ymd(S.week) && t <= ymd(addDays(S.week, 6)) ? t : ymd(S.week);
    }
    render(); ensureLoaded();
  } else if (act === 'logout') {
    await sb.auth.signOut();
  }
});

function inlineEdit(span, value, save) {
  const f = document.createElement('form');
  f.style.cssText = 'flex-grow:1;min-width:0;display:flex';
  f.innerHTML = '<input class="edit" autocomplete="off" enterkeyhint="done">';
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
board.addEventListener('focusout', async (e) => {
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

// ───────── 화면 맞춤 · 시계 · 동기화
function fit() {
  const s = Math.min(innerWidth / 1180, innerHeight / 820);
  board.style.transform = `scale(${s})`;
}
addEventListener('resize', fit); fit();

let lastDay = todayStr();
setInterval(() => {
  const d = new Date();
  const c = document.getElementById('clock'); if (c) c.textContent = clockLabel(d);
  const dt = document.getElementById('date'); if (dt) dt.textContent = dateLabel(d);
  if (ymd(d) !== lastDay) { lastDay = ymd(d); S.sel = lastDay; render(); load(); }
}, 1000);

function route() {
  const k = location.hash.slice(1);
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
