// 해인 근무 잠금 파일 도구: node hae-tool.mjs <hae.enc 경로> <암호> [추가할 rows.json]
// rows.json: [{day, start_min, end_min, off}] — 같은 날은 새 것으로 바뀜. 결과를 같은 경로에 다시 잠가 씀.
import { webcrypto as C } from 'node:crypto'; import fs from 'node:fs';
const [, , file, pw, add] = process.argv;
const b64 = (u) => Buffer.from(u).toString('base64'), ub = (s) => new Uint8Array(Buffer.from(s, 'base64'));
async function key(salt, use) { const base = await C.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']); return C.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [use]); }
let rows = [];
if (fs.existsSync(file)) { const { salt, iv, ct } = JSON.parse(fs.readFileSync(file, 'utf8')); rows = JSON.parse(new TextDecoder().decode(await C.subtle.decrypt({ name: 'AES-GCM', iv: ub(iv) }, await key(ub(salt), 'decrypt'), ub(ct)))); }
if (add) for (const r of JSON.parse(fs.readFileSync(add, 'utf8'))) { rows = rows.filter((x) => x.day !== r.day); rows.push(r); }
rows.sort((a, b) => (a.day < b.day ? -1 : 1));
const salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12));
const ct = await C.subtle.encrypt({ name: 'AES-GCM', iv }, await key(salt, 'encrypt'), new TextEncoder().encode(JSON.stringify(rows)));
fs.writeFileSync(file, JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }));
console.log(rows.length + '일', rows.map((r) => r.day.slice(5) + (r.off ? ' ' + r.off : ` ${r.start_min}-${r.end_min}`)).join(' | '));
