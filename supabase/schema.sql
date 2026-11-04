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
