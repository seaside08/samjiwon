// 삼중일기 · 오늘 할 일 위젯 (iPhone · iPad, Scriptable 앱용)
// 처음 한 번은 Scriptable 앱 안에서 ▶︎ 실행해서 로그인하세요.

const SB_URL = 'https://svursbeeuavwjhhlphqj.supabase.co';
const SB_KEY = 'sb_publishable_1K0Lv-tZWvz7udxxETYq0g_x7ETFShv';
const SITE = 'https://seaside08.github.io/samjiwon/#today';
const K = 'samjung_refresh';

const INK = new Color('#141414'), PAPER = new Color('#fbfbf8'), RED = new Color('#e0352b');

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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

async function todos(tk) {
  const r = new Request(`${SB_URL}/rest/v1/todos?select=text,tag,done&day=eq.${today}&order=pos.asc`);
  r.headers = { apikey: SB_KEY, Authorization: `Bearer ${tk}` };
  return r.loadJSON();
}

// 체크 칸: 검은 테두리 네모, 완료면 안을 꽉 채우는 빨간 X
function box(done) {
  const n = 32, b = 5, c = new DrawContext();
  c.size = new Size(n, n); c.opaque = false; c.respectScreenScale = true;
  c.setFillColor(Color.white()); c.fillRect(new Rect(0, 0, n, n));
  if (done) {
    c.setStrokeColor(RED); c.setLineWidth(4.4);
    const p = new Path(); p.move(new Point(b, b)); p.addLine(new Point(n - b, n - b));
    p.move(new Point(n - b, b)); p.addLine(new Point(b, n - b));
    c.addPath(p); c.strokePath();
  }
  c.setFillColor(INK);
  c.fillRect(new Rect(0, 0, n, b)); c.fillRect(new Rect(0, n - b, n, b));
  c.fillRect(new Rect(0, 0, b, n)); c.fillRect(new Rect(n - b, 0, b, n));
  return c.getImage();
}
// 취소선: 글자 칸 배경으로 깔리는 빨간 가로줄
function strike() {
  const c = new DrawContext();
  c.size = new Size(40, 40); c.opaque = false; c.respectScreenScale = true;
  c.setFillColor(RED); c.fillRect(new Rect(0, 19, 40, 6));
  return c.getImage();
}
const BOX = [box(false), box(true)], STRIKE = strike();

function item(stack, t, size) {
  const row = stack.addStack();
  row.centerAlignContent();
  const ic = row.addImage(BOX[t.done ? 1 : 0]);
  ic.imageSize = new Size(size, size);
  row.addSpacer(9);
  const wrap = row.addStack();
  if (t.done) wrap.backgroundImage = STRIKE;
  const tx = wrap.addText(t.text);
  tx.font = Font.boldSystemFont(size);
  tx.textColor = INK;
  tx.lineLimit = 1;
  tx.minimumScaleFactor = 0.8;
}

function header(stack, list, fam) {
  const top = stack.addStack();
  top.centerAlignContent();
  const box = top.addStack();
  box.backgroundColor = INK;
  box.setPadding(3, 8, 3, 8);
  const lb = box.addText('TODAY');
  lb.font = Font.boldMonospacedSystemFont(13);
  lb.textColor = PAPER;
  if (list) {
    top.addSpacer(8);
    const done = list.filter((t) => t.done).length;
    const c = top.addText(`[ ${done} / ${list.length} ]`);
    c.font = Font.boldMonospacedSystemFont(13);
    c.textColor = RED;
  }
}

// 한 열: 위에서부터 고른 간격으로
function column(stack, rows, width, gap) {
  const col = stack.addStack();
  col.layoutVertically();
  col.spacing = gap;
  if (width) col.size = new Size(width, 0);
  rows.forEach((fn) => fn(col));
  return col;
}

function build(list, err) {
  const w = new ListWidget();
  w.backgroundColor = PAPER;
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const fam = config.widgetFamily || 'medium';
  w.setPadding(16, 18, 16, 18);

  if (err || !list) {
    header(w, null, fam);
    w.addSpacer(10);
    const t = w.addText(err || '');
    t.font = Font.boldSystemFont(12); t.textColor = RED;
    w.addSpacer();
    return w;
  }

  const size = fam === 'small' ? 13 : 15;
  const perCol = fam === 'large' ? 10 : 4;      // 머리 줄 포함 한 줄 수
  const cols = fam === 'small' ? 1 : 2;
  const slots = perCol * cols - 1;               // 머리 줄 한 칸 빼고
  let items = list.slice();
  let more = 0;
  if (items.length > slots) { more = items.length - (slots - 1); items = items.slice(0, slots - 1); }

  const cells = [(c) => header(c, list, fam), ...items.map((t) => (c) => item(c, t, size))];
  if (more) cells.push((c) => { const m = c.addText(`+ ${more}`); m.font = Font.boldMonospacedSystemFont(size); m.textColor = INK; });

  const body = w.addStack();
  for (let k = 0; k < cols; k++) {
    const part = cells.slice(k * perCol, (k + 1) * perCol);
    if (!part.length) break;
    if (k) body.addSpacer(14);
    column(body, part, cols > 1 ? 138 : 0, fam === 'large' ? 12 : 13);
  }
  body.addSpacer();
  return w;
}

let widget;
try {
  widget = build(await todos(await token()));
} catch (e) {
  widget = build(null, e.message);
}
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
