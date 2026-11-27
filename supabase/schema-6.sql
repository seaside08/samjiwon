-- 삼중일기 6차: 해인 근무 (주간 달력에 파란 블록으로 겹쳐 보기)
-- Supabase > SQL Editor 에 붙여 넣고 Run 한 번.

create table if not exists public.partner_shifts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  start_min int,          -- 시작 (분), 쉬는 날은 비움
  end_min int,            -- 끝 (분)
  off text,               -- 쉬는 날: '휴무', '연차' 등
  primary key (user_id, day)
);
alter table public.partner_shifts enable row level security;
drop policy if exists own on public.partner_shifts;
create policy own on public.partner_shifts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.partner_shifts to authenticated;
