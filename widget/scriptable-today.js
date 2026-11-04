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

function build(list, err) {
  const w = new ListWidget();
  w.backgroundColor = PAPER;
  w.url = SITE;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const fam = config.widgetFamily || 'medium';
  const max = fam === 'small' ? 4 : fam === 'large' ? 11 : 4;

  const top = w.addStack();
  top.centerAlignContent();
  const box = top.addStack();
  box.backgroundColor = INK;
  box.setPadding(3, 7, 3, 7);
  const lb = box.addText(fam === 'small' ? 'TODAY' : 'TODAY / 오늘 할 일');
  lb.font = Font.boldMonospacedSystemFont(11);
  lb.textColor = PAPER;
  top.addSpacer(8);
  if (list) {
    const done = list.filter((t) => t.done).length;
    const c = top.addText(`[ ${done} / ${list.length} ]`);
    c.font = Font.boldMonospacedSystemFont(12);
    c.textColor = RED;
  }
  top.addSpacer();
  if (fam !== 'small') {
    const d = top.addText(`${pad(now.getMonth() + 1)}. ${pad(now.getDate())} ${WD[now.getDay()]}`);
    d.font = Font.boldMonospacedSystemFont(11);
    d.textColor = INK;
  }
  w.addSpacer(9);

  if (err) {
    const t = w.addText(err);
    t.font = Font.boldSystemFont(12); t.textColor = RED;
  } else {
    for (const t of list.slice(0, max)) {
      const row = w.addStack();
      row.centerAlignContent();
      const ic = row.addImage(SFSymbol.named(t.done ? 'xmark.square' : 'square').image);
      ic.imageSize = new Size(13, 13);
      ic.tintColor = t.done ? RED : INK;
      row.addSpacer(7);
      const tx = row.addText(t.text);
      tx.font = Font.boldSystemFont(fam === 'small' ? 12 : 13);
      tx.textColor = INK;
      tx.lineLimit = 1;
      if (t.tag && fam !== 'small') {
        row.addSpacer();
        const tg = row.addText(`#${t.tag}`);
        tg.font = Font.boldSystemFont(10);
        tg.textColor = new Color('#1f8f47');
        tg.lineLimit = 1;
      }
      w.addSpacer(5);
    }
    if (list.length > max) {
      const more = w.addText(`+ ${list.length - max}`);
      more.font = Font.boldMonospacedSystemFont(11); more.textColor = INK;
    }
  }
  w.addSpacer();
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
