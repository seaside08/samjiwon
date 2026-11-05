// 삼중일기 · 달력 위젯 (큰 크기 권장, Scriptable 앱용)
// '삼중일기' 오늘 위젯에서 로그인했다면 따로 로그인하지 않아도 됩니다.

const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const SITE = 'https://seaside08.github.io/samjiwon/#cal';
const TEX = 'https://seaside08.github.io/samjiwon/tex.jpg';
const K = 'samjung_refresh';

const INK = new Color('#141414'), PAPER = new Color('#fbfbf8'), RED = new Color('#e0352b'), GREEN = new Color('#5fd97c');
const SHORT = { 언더워터: '워터', 라운지돌돌: '돌돌', 다락: '다락', 연우재: '연우재' };
const PROJ_SHORT = { 'toss 안정감 프로젝트': '피보테' };
const shortName = (t) => PROJ_SHORT[String(t || '').trim()] || t;
// 출근 시각 줄여 쓰기: 15:00→15, 16:30→163, 8:00→08, 9:20→920
function workCode(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (h >= 10) return m ? `${h}${Math.floor(m / 10)}` : `${h}`;
  return m ? `${h}${String(m).padStart(2, '0')}` : `0${h}`;
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const today = ymd(now);
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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

// ───────── 달력 그리기
function draw(size, data, tex, fam) {
  const { events } = data;
  const W = size.width, H = size.height, P = 14;
  const c = new DrawContext();
  c.size = size; c.opaque = true; c.respectScreenScale = true;
  c.setFillColor(PAPER); c.fillRect(new Rect(0, 0, W, H));

  const text = (s, x, y, w, h, font, color = INK, align = 'left') => {
    c.setFont(font); c.setTextColor(color);
    if (align === 'right') c.setTextAlignedRight(); else c.setTextAlignedLeft();
    c.drawTextInRect(s, new Rect(x, y, w, h));
  };
  const line = (x, y, w, h) => { c.setFillColor(INK); c.fillRect(new Rect(x, y, w, h)); };

  const y0 = now.getFullYear(), m0 = now.getMonth();
  const first = new Date(y0, m0, 1), last = new Date(y0, m0 + 1, 0).getDate();
  const gs = new Date(y0, m0, 1 - first.getDay());
  const rows = Math.ceil((first.getDay() + last) / 7);

  // 머리
  text(`${y0}. ${pad(m0 + 1)}`, P, P - 3, 160, 22, Font.boldMonospacedSystemFont(17));
  const workDays = new Set(events.filter((e) => e.kind === 'work' && e.day.startsWith(`${y0}-${pad(m0 + 1)}`)).map((e) => e.day)).size;
  const mPrefix = `${y0}-${pad(m0 + 1)}`;
  const taskDays = new Set([...events.filter((e) => e.kind === 'task' && e.day.startsWith(mPrefix)).map((e) => e.day), ...(data.sessions || []).filter((x) => x.day.startsWith(mPrefix)).map((x) => x.day)]).size;
  text(`작업 ${taskDays}일`, W - P - 120, P - 6, 120, 13, Font.boldMonospacedSystemFont(9), INK, 'right');
  text(`근무 ${workDays}일`, W - P - 120, P + 6, 120, 13, Font.boldMonospacedSystemFont(9), INK, 'right');

  // 요일
  const top = P + 25, cw = (W - P * 2) / 7;
  WD.forEach((d, i) => text(d, P + i * cw + 3, top, cw, 12, Font.boldMonospacedSystemFont(7.5)));

  const gy = top + 12, LW = 0.8;
  const ch = (H - P + 2 - gy) / rows;
  const byDay = {};
  for (const e of events) (byDay[e.day] ||= []).push(e);

  for (let r = 0; r < rows; r++) {
    const ry = gy + r * ch;
    line(P, ry, W - P * 2, LW);
    for (let k = 0; k < 7; k++) {
      const d = new Date(gs.getFullYear(), gs.getMonth(), gs.getDate() + r * 7 + k);
      const ds = ymd(d), x = P + k * cw, inM = d.getMonth() === m0;
      if (k) line(x - LW / 2, ry, LW, ch);
      // 날짜
      const num = String(d.getDate());
      if (ds === today) {
        // 오늘: 칸 너비로 꽉 찬 검은 띠
        c.setFillColor(INK); c.fillRect(new Rect(x + (k ? LW / 2 : 0), ry, cw - (k ? LW / 2 : 0), 16.5));
        text(num, x + 4, ry + 3, cw, 12.5, Font.boldMonospacedSystemFont(9.5), PAPER);
      } else {
        text(num, x + 4, ry + 3, cw, 12.5, inM ? Font.boldMonospacedSystemFont(9.5) : Font.regularMonospacedSystemFont(9.5));
      }
      // 내용
      const lh = 9.6, maxL = Math.floor((ch - 19) / lh);
      const evs = (byDay[ds] || []).sort((a, b) => (a.kind === 'work' ? -1 : 0) - (b.kind === 'work' ? -1 : 0) || (a.start_min ?? -1) - (b.start_min ?? -1));
      const lines = evs.map((e) => ({ e }));
      let ly = ry + 19;
      const f = Font.boldSystemFont(8);
      for (let i = 0; i < Math.min(maxL, lines.length); i++) {
        const L = lines[i];
        if (i === maxL - 1 && lines.length > maxL) { text(`+${lines.length - i}`, x + 4, ly, cw - 5, lh, Font.boldMonospacedSystemFont(8)); break; }
        if (L.e.kind === 'work') {
          text(`${workCode(L.e.start_min)} ${SHORT[L.e.place] || L.e.title}`, x + 3.5, ly, cw - 4, lh, f);
        } else if (L.e.kind === 'task') {
          const br = new Rect(x + LW, ly, cw - LW * 1.5, lh);
          if (tex) c.drawImageInRect(tex, br); else { c.setFillColor(GREEN); c.fillRect(br); }
          text(shortName(L.e.title), x + 3.5, ly, cw - 4, lh, f);
        } else {
          text(shortName(L.e.title), x + 3.5, ly, cw - 4, lh, f);
        }
        ly += lh;
      }
    }
  }
  line(P, gy + rows * ch - LW, W - P * 2, LW);
  return c.getImage();
}

async function main() {
  const fam = config.widgetFamily || 'large';
  const w = new ListWidget();
  w.url = SITE;
  w.setPadding(0, 0, 0, 0);
  w.backgroundColor = PAPER;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);   // 5분 뒤 새로 고침 요청 (실제 시각은 iOS가 정함)
  try {
    const tk = await token();
    const y = now.getFullYear(), m = now.getMonth();
    const from = ymd(new Date(y, m, 1 - new Date(y, m, 1).getDay())), to = ymd(new Date(y, m + 1, 14));
    const [events, sessions, tex] = await Promise.all([
      get(tk, `events?select=day,start_min,title,kind,place&day=gte.${from}&day=lte.${to}`),
      get(tk, `sessions?select=day&day=gte.${from}&day=lte.${to}`).catch(() => []),
      texture(),
    ]);
    w.backgroundImage = draw(widgetSize(fam), { events, sessions }, tex, fam);
  } catch (e) {
    const t = w.addText(e.message);
    t.font = Font.boldSystemFont(12); t.textColor = RED;
  }
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentLarge();
}

main().then(() => Script.complete(), (e) => { console.error(e); Script.complete(); });
