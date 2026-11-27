-- 삼중일기 6차: 작은 비밀 값 보관 (해인 근무 파일을 여는 암호 등)
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번. 비밀 값 자체는 이 파일에 적지 않는다.

create table if not exists public.app_secrets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  k text not null,
  v text,
  primary key (user_id, k)
);
alter table public.app_secrets enable row level security;
drop policy if exists own on public.app_secrets;
create policy own on public.app_secrets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.app_secrets to authenticated;
