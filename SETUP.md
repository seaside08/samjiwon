# 나만의 삼중일기 만들기

삼중일기를 통째로 복사해서 **내 GitHub · 내 Supabase**로 따로 쓰는 방법이에요.
원래 삼중일기와 완전히 분리돼서, 기록은 내 Supabase에만 저장되고 내 마음대로 고칠 수 있어요.

> Claude와 함께 한다면: 이 파일을 Claude에게 보여 주고 "이대로 같이 해 줘"라고 하면 돼요.

준비물: GitHub 계정, Supabase 계정(무료), 30분 정도.

---

## 1. 코드 복사 (GitHub)

1. https://github.com/seaside08/samjiwon 에서 오른쪽 위 **Fork** → **Create fork**.
2. 저장소 이름은 마음대로 바꿔도 돼요. 이름이 곧 주소가 돼요 → `https://내아이디.github.io/저장소이름/`

## 2. 데이터 저장소 만들기 (Supabase)

1. https://supabase.com 에서 **New project**. 이름·비밀번호는 아무거나, 지역은 **Northeast Asia (Seoul)**.
2. 왼쪽 **SQL Editor** → `supabase/schema-all.sql` 파일 내용 전체를 붙여 넣고 **Run**. "Success"가 나오면 끝.
3. 내 계정 만들기: 왼쪽 **Authentication → Users → Add user → Create new user**
   - 이메일·비밀번호 입력, **Auto Confirm User** 켜기. (삼중일기엔 가입 버튼이 없어서 여기서 만들어요.)
4. 연결 정보 복사: 왼쪽 아래 **Project Settings → API Keys** (또는 Data API)
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_...`)
   - ⚠️ `secret` / `service_role` 키와 DB 비밀번호는 절대 코드에 넣지 마세요. 코드가 공개돼서 누구나 볼 수 있어요. Publishable 키는 공개돼도 괜찮아요.

## 3. 내 것으로 바꾸기 (`app.js` 맨 위)

GitHub 저장소에서 `app.js` → 연필(Edit) 버튼으로 고쳐도 돼요.

```js
const SB_URL = 'https://xxxx.supabase.co';          // ← 내 Project URL
const SB_KEY = 'sb_publishable_...';                // ← 내 Publishable key
```

**근무지 (`WORKPLACES`)** — 아르바이트·출근하는 곳 목록이에요. 없으면 `[]`로 비워도 돼요.

```js
{ name: '카페이름', short: '줄임', keys: ['카페이름', '줄임'],
  shifts: { 1: [1020, 1350] },   // 요일(일0 월1 … 토6): [시작분, 끝분]  예) 17:00 = 1020, 22:30 = 1350
  rate: 10320,                   // 시급
  payday: 10 },                  // 월급날 (0 = 말일)
```

- `juhu: true` → 주휴수당 계산, `archived: true` → 지금은 안 가는 곳(목록에서 숨김)

**줄임말 (`PROJ_SHORT`)** — 긴 프로젝트 이름을 달력에서 짧게. 필요 없으면 `{}`.

```js
const PROJ_SHORT = { '긴 프로젝트 이름': '짧게' };
```

## 4. 사이트 켜기 (GitHub Pages)

1. 내 저장소 **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: **main** / **(root)** → **Save**
3. 1~2분 뒤 `https://내아이디.github.io/저장소이름/` 접속 → 2-3에서 만든 이메일·비밀번호로 로그인.
4. 휴대폰: Safari로 열고 **공유 → 홈 화면에 추가** 하면 앱처럼 쓸 수 있어요.

미리 구경만: 주소 뒤에 `?demo` 를 붙이면 가짜 데이터 화면이 나와요.

## 5. 새 버전 반영

코드를 고친 뒤에는 `index.html` 안의 `?v=숫자`를 하나 올려 주세요 (예: `?v=2611133` → `?v=2611134`).
사이트 위쪽 시간을 누르면 새 버전으로 바뀌어요.

---

## 있으면 좋은 것 (선택)

### 아이폰 위젯 (Scriptable 앱)
- `widget/scriptable-today.js` (오늘 할 일), `widget/scriptable-calendar.js` (달력)
- 각 파일 맨 위 `SB_URL`, `SB_KEY`, `SITE`(내 사이트 주소)를 내 것으로 바꿔 Scriptable에 붙여 넣기. 처음 실행할 때 로그인 창이 떠요.
- 달력 위젯은 `TEX`(초록 질감 그림 주소)도 내 사이트 주소로 바꾸고, 안의 `PROJ_SHORT`도 맞춰 주세요.

### 구글 캘린더 연동 · 자동 백업 (`google/apps-script.js`)
- https://script.google.com 에서 새 프로젝트 → 파일 내용 붙여 넣기 → 위쪽 `SB_URL`, `SB_KEY`, `SHORT`(근무지 줄임말) 바꾸기.
- 프로젝트 설정 → 스크립트 속성에 `SB_EMAIL`, `SB_PASSWORD`(삼중일기 로그인 정보) 넣고 `setup` 실행.
- 코워크 근무표 연동(`COWORK_JSON`)은 원래 주인 전용이라 넣지 않으면 꺼져 있어요.

### Claude와 계속 고쳐 나갈 때
- 저장소의 `CLAUDE.md`는 원래 주인의 작업 규칙(주소·배포 방식)이에요. 내 주소와 방식으로 고쳐 쓰거나 지워 주세요.
