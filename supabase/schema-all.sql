-- 삼중일기 새로 시작하기: 아래 전체를 Supabase > SQL Editor 에 붙여 넣고 Run 한 번.
-- (schema.sql → schema-5.sql 을 순서대로 이어 붙인 것)

-- ===== schema.sql =====
-- 삼중일기 1단계: 할 일 · 일정(근무 포함) · 하루(다짐)
-- Supabase > SQL Editor 에 전부 붙여 넣고 Run 한 번.

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  text text not null,
  tag text,
  done boolean not null default false,
  done_at timestamptz,
  pos double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  start_min int,          -- 0시부터 분 (15:30 → 930). 비어 있으면 하루 종일
  end_min int,
  title text not null,
  kind text not null default 'event' check (kind in ('event', 'work')),
  place text,             -- 근무지 이름 (언더워터 / 라운지돌돌 / 다락)
  created_at timestamptz not null default now()
);

create table if not exists public.days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  vow text,               -- 다짐
  diary text,             -- 일기 (3단계)
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists todos_user_day on public.todos (user_id, day);
create index if not exists events_user_day on public.events (user_id, day);

alter table public.todos enable row level security;
alter table public.events enable row level security;
alter table public.days enable row level security;

drop policy if exists own on public.todos;
drop policy if exists own on public.events;
drop policy if exists own on public.days;
create policy own on public.todos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on public.events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on public.days for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.todos, public.events, public.days to authenticated;

-- ===== schema-2.sql =====
-- 삼중일기 2차: 프로젝트 · 작업 기록(타이머) · 식물
-- Supabase > SQL Editor 에 전부 붙여 넣고 Run 한 번.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  stages text[] not null default '{}',
  stage int not null default 0,
  start_day date,
  end_day date,
  pay int,
  programs text,
  link text,
  note text,
  status text not null default 'active' check (status in ('active', 'done', 'archived', 'stopped')),
  pos double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete set null,
  title text,
  day date not null,
  start_at timestamptz not null,
  end_at timestamptz,          -- 비어 있으면 지금 타이머가 돌아가는 중
  created_at timestamptz not null default now()
);

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  species text,
  name text not null,
  interval_days int,
  gone boolean not null default false,   -- 추억의 전당
  gone_day date,
  pos double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.plant_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plant_id uuid not null references public.plants on delete cascade,
  day date not null,
  watered boolean not null default false,
  memo text,
  unique (plant_id, day)
);

create index if not exists sessions_user_day on public.sessions (user_id, day);
create index if not exists plant_logs_user_day on public.plant_logs (user_id, day);

alter table public.projects enable row level security;
alter table public.sessions enable row level security;
alter table public.plants enable row level security;
alter table public.plant_logs enable row level security;

drop policy if exists own on public.projects;
drop policy if exists own on public.sessions;
drop policy if exists own on public.plants;
drop policy if exists own on public.plant_logs;
create policy own on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on public.sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on public.plants for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on public.plant_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.projects, public.sessions, public.plants, public.plant_logs to authenticated;

-- ===== schema-3.sql =====
-- 삼중일기 3차: 일정 종류에 '작업' 추가, 작업 일정에 프로젝트 연결
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('event', 'work', 'task'));
alter table public.events add column if not exists project_id uuid references public.projects on delete set null;

-- ===== schema-4.sql =====
-- 삼중일기 4차: 프로젝트 아카이브 칸 (분류 · 함께한 사람 · 결과물)
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists people text;
alter table public.projects add column if not exists output text;

-- ===== schema-5.sql =====
-- 삼중일기 5차: 시간 없는 일정끼리 끌어서 정한 순서
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.events add column if not exists pos double precision not null default 0;
