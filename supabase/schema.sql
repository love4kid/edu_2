-- Supabase SQL Editor에서 실행하세요 (Project: aopczyfntgvdcmroftzs)

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  name text not null,
  logged_in_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.login_history enable row level security;

-- 단순 오픈 정책: anon key만으로 회원가입(insert)과 로그인 검증(select)이 가능해야 하므로
-- users 테이블 select/insert를 모두 허용합니다. 즉 사번/이름/연락처가 anon key를 아는 누구에게나 조회됩니다.
create policy "anon can insert users" on public.users
  for insert to anon
  with check (true);

create policy "anon can select users" on public.users
  for select to anon
  using (true);

-- 로그인 이력은 기록(insert)만 필요하고 클라이언트에서 조회하지 않으므로 insert만 허용합니다.
create policy "anon can insert login_history" on public.login_history
  for insert to anon
  with check (true);
