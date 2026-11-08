-- 삼중일기 5차: 시간 없는 일정끼리 끌어서 정한 순서
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.events add column if not exists pos double precision not null default 0;
