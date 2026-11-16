// 삼중일기 · 주 달력 위젯 (큰 크기, Scriptable 앱용)
// '삼중일기' 오늘 위젯에서 로그인했다면 따로 로그인하지 않아도 됩니다.

const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const TEX = 'https://seaside08.github.io/samjiwon/tex.jpg';
const K = 'samjung_refresh';

const INK = new Color('#141414'), PAPER = new Color('#fbfbf8'), RED = new Color('#e0352b'), GREEN = new Color('#5fd97c');
const SHORT = { 언더워터: '워터', 라운지돌돌: '돌돌', 다락: '다락', 연우재: '연우재' };
const PROJ_SHORT = { 'toss 안정감 프로젝트': '피보테', '정원 다큐멘터리': '정원', '정원다큐멘터리': '정원' };
const shortName = (t) => PROJ_SHORT[String(t || '').trim()] || PROJ_SHORT[String(t || '').trim().toLowerCase()] || t;
// 출근 시각 줄여 쓰기: 15:00→15, 16:30→163, 8:00→08, 9:20→920
function workCode(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (h >= 10) return m ? `${h}${Math.floor(m / 10)}` : `${h}`;
  return m ? `${h}${String(m).padStart(2, '0')}` : `0${h}`;
}

const pad = (n) => String(n).padStart(2, '0');
const dur = (m) => { const h = Math.floor(m / 60), r = m % 60; return r ? `${h}H ${r}M` : `${h}H`; };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const today = ymd(now);
const WD = ['日', '月', '火', '水', '木', '金', '土'];

// ───────── 로그인 (오늘 위젯과 같은 열쇠를 씀)
async function auth(body, grant) {
  const r = new Request(`${SB_URL}/auth/v1/token?grant_type=${grant}`);
  r.method = 'POST';
  r.headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  r.body = JSON.stringify(body);
  const j = await r.loadJSON();
  if (!j.access_token) throw new Error(j.error_description || j.msg || '로그인 실패');
  Keychain.set(K, j.refresh_token);
  Keychain.set(K + '_at', JSON.stringify({ t: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 }));
  return j.access_token;
}
async function login() {
  const a = new Alert();
  a.title = '삼중일기 로그인';
  a.addTextField('이메일');
  a.addSecureTextField('비밀번호');
  a.addAction('들어가기');
  a.addCancelAction('취소');
  if ((await a.present()) === -1) throw new Error('로그인 취소');
  return auth({ email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) }, 'password');
}
async function token() {
  if (Keychain.contains(K + '_at')) {
    try { const a = JSON.parse(Keychain.get(K + '_at')); if (a.exp > Date.now()) return a.t; } catch (e) { /* 새로 받기 */ }
  }
  if (Keychain.contains(K)) {
    try { return await auth({ refresh_token: Keychain.get(K) }, 'refresh_token'); } catch (e) { /* 다시 로그인 */ }
  }
  if (config.runsInWidget) throw new Error('Scriptable 앱에서 한 번 실행해 로그인해 주세요');
  return login();
}
async function get(tk, path) {
  const r = new Request(`${SB_URL}/rest/v1/${path}`);
  r.headers = { apikey: SB_KEY, Authorization: `Bearer ${tk}` };
  const j = await r.loadJSON();
  if (!Array.isArray(j)) throw new Error(j.message || '불러오지 못했어요');
  return j;
}

// 리소 텍스처 (한 번 받아 두고 다시 씀)
async function texture() {
  const fm = FileManager.local(), p = fm.joinPath(fm.cacheDirectory(), 'samjung-tex.jpg');
  if (fm.fileExists(p)) return fm.readImage(p);
  try { const img = await new Request(TEX).loadImage(); fm.writeImage(p, img); return img; } catch (e) { return null; }
}

// 위젯 크기 (pt) — 기기 화면 폭에 따라
function widgetSize(fam) {
  const w = Device.screenSize().width;
  const t = w >= 428 ? [364, 382, 170] : w >= 390 ? [338, 354, 158] : w >= 375 ? [329, 345, 155] : [292, 311, 141];
  return fam === 'medium' ? new Size(t[0], t[2]) : new Size(t[0], t[1]);
}

// ───────── 주 달력 그리기
const sundayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
const minOf = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
// 겹치는 시간은 한 번만 세기
function unionMin(iv) {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]); let t = 0, ca = -1, cb = -1;
  for (const [a, b] of s) { if (a > cb) { if (cb > ca) t += cb - ca; ca = a; cb = b; } else cb = Math.max(cb, b); }
  if (cb > ca) t += cb - ca; return t;
}

function draw(size, data, tex) {
  const { events, sessions, projects } = data;
  const W = size.width, H = size.height, P = 14;
  const c = new DrawContext();
  c.size = size; c.opaque = true; c.respectScreenScale = true;
  c.setFillColor(PAPER); c.fillRect(new Rect(0, 0, W, H));
  const text = (s, x, y, w, h, font, color = INK, align = 'left') => {
    c.setFont(font); c.setTextColor(color);
    if (align === 'right') c.setTextAlignedRight(); else if (align === 'center') c.setTextAlignedCenter(); else c.setTextAlignedLeft();
    c.drawTextInRect(s, new Rect(x, y, w, h));
  };
  const fill = (r, col) => { c.setFillColor(col); c.fillRect(r); };
  const green = (r, out) => {
    if (tex) c.drawImageInRect(tex, r); else fill(r, GREEN);
    if (out) fill(r, new Color('#fbfbf8', 0.4));   // 외주는 초록 60%
  };

  const ws = sundayOf(now), days = [...Array(7)].map((_, i) => new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i)), keys = days.map(ymd);
  const we = days[6];

  // 하루하루 모으기
  const per = keys.map((ds) => {
    const evs = events.filter((e) => e.day === ds);
    const ss = sessions.filter((s) => s.day === ds).map((s) => {
      const a = minOf(s.start_at); let b = s.end_at ? minOf(s.end_at) : now.getHours() * 60 + now.getMinutes(); if (b <= a) b += 1440;
      const p = projects[s.project_id];
      return { a, b, name: shortName((p && p.name) || s.title || '작업'), out: isOut(p) };
    });
    return { evs, ss };
  });

  // 머리: 기간 · 이번 주 작업 / 근무
  let wk = 0, tk = 0;
  per.forEach(({ evs, ss }) => {
    evs.forEach((e) => { if (e.kind === 'work' && e.start_min != null && e.end_min != null) wk += Math.max(0, e.end_min - e.start_min); });
    tk += unionMin([...ss.map((s) => [s.a, s.b]), ...evs.filter((e) => e.kind === 'task' && e.start_min != null && e.end_min != null).map((e) => [e.start_min, e.end_min])]);
  });
  text(`${pad(ws.getMonth() + 1)}. ${pad(ws.getDate())} – ${pad(we.getMonth() + 1)}. ${pad(we.getDate())}`, P, P - 3, 200, 22, Font.boldMonospacedSystemFont(15));
  text(`작업 ${dur(tk)}`, W - P - 120, P - 6, 120, 13, Font.boldMonospacedSystemFont(9), INK, 'right');
  text(`근무 ${dur(wk)}`, W - P - 120, P + 6, 120, 13, Font.boldMonospacedSystemFont(9), INK, 'right');

  // 요일 · 날짜 (오늘은 검은 상자)
  const G = 8, TL = 15, top = P + 22, cw = (W - G - TL - G) / 7, x0 = G + TL;
  days.forEach((d, i) => {
    const x = x0 + i * cw, on = keys[i] === today;
    if (on) fill(new Rect(x, top, cw, 25), INK);
    text(WD[d.getDay()], x, top + 1, cw, 13, Font.heavySystemFont(10), on ? PAPER : INK, 'center');
    text(String(d.getDate()), x, top + 13, cw, 11, Font.boldMonospacedSystemFont(8), on ? PAPER : INK, 'center');
  });
  let y = top + 27;

  // 시간 없는 일정 (작업은 초록 띠)
  const allDay = per.map(({ evs }) => evs.filter((e) => e.start_min == null && e.kind !== 'work'));
  const adRows = Math.min(2, Math.max(0, ...allDay.map((a) => a.length)));
  const lh = 10.5;
  for (let r = 0; r < adRows; r++) {
    allDay.forEach((a, i) => {
      const e = a[r]; if (!e) return;
      const rr = new Rect(x0 + i * cw + 1, y + r * lh, cw - 2, lh - 1);
      if (e.kind === 'task') green(rr, isOut(evProj(e, projects)));
      text(shortName(e.title), rr.x + 2, rr.y, rr.width - 2, lh, Font.boldSystemFont(8));
    });
  }
  y += adRows * lh + (adRows ? 2 : 0);

  // 시간 칸 범위: 이번 주 일정에 맞춰 (기본 10~22시)
  const timed = [];
  per.forEach(({ evs, ss }, i) => {
    evs.filter((e) => e.start_min != null).forEach((e) => timed.push({ i, a: e.start_min, b: e.end_min != null ? (e.end_min > e.start_min ? e.end_min : e.end_min + 1440) : e.start_min + 45, e }));
    ss.forEach((s) => timed.push({ i, a: s.a, b: s.b, s }));
  });
  let h0 = 10, h1 = 22;
  if (timed.length) { h0 = Math.min(h0, Math.floor(Math.min(...timed.map((t) => t.a)) / 120) * 2); h1 = Math.max(h1, Math.ceil(Math.min(1440, Math.max(...timed.map((t) => t.b))) / 120) * 2); }
  const gTop = y, gBot = H - G - 2, ph = (gBot - gTop) / ((h1 - h0) * 60);
  const Y = (m) => gTop + (Math.min(Math.max(m, h0 * 60), h1 * 60) - h0 * 60) * ph;
  const LW = 0.8;
  fill(new Rect(x0, gTop - LW, cw * 7, LW), INK);
  for (let h = h0; h < h1; h += 2) text(String(h), G - 2, Y(h * 60) - 1, TL, 10, Font.boldMonospacedSystemFont(7), INK, 'left');
  for (let i = 0; i <= 7; i++) fill(new Rect(x0 + i * cw - LW / 2, gTop, LW, gBot - gTop), INK);

  // 칸마다: 근무는 칸 가득, 겹치는 작업은 나란히
  for (let i = 0; i < 7; i++) {
    const cx = x0 + i * cw, items = timed.filter((t) => t.i === i).sort((p, q) => p.a - q.a || q.b - p.b);
    const works = items.filter((t) => t.e && t.e.kind === 'work'), rest = items.filter((t) => !(t.e && t.e.kind === 'work'));
    for (const t of works) {
      const r = new Rect(cx + 2, Y(t.a), cw - 4, Math.max(8, Y(t.b) - Y(t.a)));
      fill(r, INK); fill(new Rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2), PAPER);
      text(`${SHORT[t.e.place] || t.e.title}\n${workCode(t.a)}–${workCode(t.e.end_min)}`, r.x + 2, r.y + 1, r.width - 3, r.height - 1, Font.boldSystemFont(7.5));
    }
    // 겹치는 것끼리 나란히 (줄 나누기)
    const lanes = [], groups = []; let g = [], gEnd = -1;
    for (const t of rest) {
      if (t.a >= gEnd && g.length) { groups.push(g); g = []; lanes.length = 0; }
      let k = lanes.findIndex((b) => b <= t.a); if (k < 0) { k = lanes.length; lanes.push(0); }
      lanes[k] = t.b; t.k = k; g.push(t); gEnd = Math.max(gEnd, t.b);
    }
    if (g.length) groups.push(g);
    for (const gr of groups) {
      const n = Math.max(...gr.map((t) => t.k + 1));
      for (const t of gr) {
        const lw = (cw - 3) / n, r = new Rect(cx + 1.5 + t.k * lw, Y(t.a), lw - (n > 1 ? 1 : 0), Math.max(8, Y(t.b) - Y(t.a)));
        const nm = t.s ? t.s.name : shortName(t.e.title), narrow = r.width < 34;   // 좁은 칸은 끝 시간 빼기
        const label = !t.s && (t.e.end_min == null || t.e.kind === 'event') ? `${workCode(t.a)} ${nm}` : narrow ? `${nm}\n${workCode(t.a)}` : `${nm}\n${workCode(t.a)}–${workCode(t.b)}`;
        if (t.s || t.e.kind === 'task') {
          const onWork = works.some((w) => t.a < w.b && t.b > w.a);
          green(onWork ? new Rect(Math.max(r.x, cx + 3), r.y + 1, Math.min(r.width, cw - 6), r.height - 2) : r, t.s ? t.s.out : isOut(evProj(t.e, projects)));
        }
        text(label, r.x + 2, r.y + 1, r.width - 3, r.height - 1, Font.boldSystemFont(7.5));
      }
    }
  }
  // 지금: 빨간 줄
  const ti = keys.indexOf(today), nm = now.getHours() * 60 + now.getMinutes();
  if (ti >= 0 && nm >= h0 * 60 && nm <= h1 * 60) { fill(new Rect(x0 + ti * cw, Y(nm) - 0.75, cw, 1.5), RED); fill(new Rect(x0 + ti * cw - 2, Y(nm) - 2.5, 5, 5), RED); }
  fill(new Rect(x0, gBot, cw * 7, LW), INK);
  return c.getImage();
}

// 외주 작업: 프로젝트 '분류'에 외주. 프로젝트가 안 붙은 일정은 이름으로 찾기
function isOut(p) { return !!p && /외주/.test(p.category || ''); }
function evProj(e, projects) {
  const ps = Object.values(projects || {});
  if (e.project_id && projects && projects[e.project_id]) return projects[e.project_id];
  if (!e.title) return null;
  const t = String(shortName(e.title)).toLowerCase();
  return ps.find((p) => { const n = String(shortName(p.name)).toLowerCase(); return t === n || t.startsWith(n + ' ') || e.title.toLowerCase() === p.name.toLowerCase(); }) || null;
}

async function main() {
  if ((args.queryParameters || {}).tap) return;   // 위젯을 눌러서 열린 경우: 미리보기 창 없이 바로 끝
  const w = new ListWidget();
  w.url = URLScheme.forRunningScript() + '?tap=1';   // 누르면 사이트 대신 Scriptable이 잠깐 열려 다시 그리기만 함
  w.setPadding(0, 0, 0, 0);
  w.backgroundColor = PAPER;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);   // 5분 뒤 새로 고침 요청 (실제 시각은 iOS가 정함)
  try {
    const tk = await token();
    const ws = sundayOf(now), from = ymd(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 1)), to = ymd(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7));
    const [events, sessions, projs, tex] = await Promise.all([
      get(tk, `events?select=day,start_min,end_min,title,kind,place,project_id&day=gte.${from}&day=lte.${to}`),
      get(tk, `sessions?select=day,project_id,title,start_at,end_at&day=gte.${from}&day=lte.${to}`).catch(() => []),
      get(tk, 'projects?select=id,name,category').catch(() => []),
      texture(),
    ]);
    w.backgroundImage = draw(widgetSize('large'), { events, sessions, projects: Object.fromEntries(projs.map((p) => [p.id, p])) }, tex);
  } catch (e) {
    const t = w.addText(String(e.message || e)); t.font = Font.boldSystemFont(13); t.textColor = INK;
  }
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentLarge();
}

main().then(() => Script.complete(), (e) => { console.error(e); Script.complete(); });
