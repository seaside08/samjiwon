-- 삼중일기 7차: 프로젝트 보수에 글자도 적을 수 있게 (예: '회당 5만원', '50000')
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

alter table public.projects alter column pay type text using pay::text;
