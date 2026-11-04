-- 삼중일기 3차: 일정 종류에 '작업' 추가, 작업 일정에 프로젝트 연결
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('event', 'work', 'task'));
alter table public.events add column if not exists project_id uuid references public.projects on delete set null;
