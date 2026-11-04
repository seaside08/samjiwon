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
