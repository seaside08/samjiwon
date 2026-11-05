-- 삼중일기 4차: 프로젝트 아카이브 칸 (분류 · 함께한 사람 · 결과물)
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists people text;
alter table public.projects add column if not exists output text;
