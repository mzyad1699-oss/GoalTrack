-- ============================================================
-- GoalTrack Database Schema (Supabase / PostgreSQL)
-- المرحلة الأولى: الحسابات + الأهداف + المهام اليومية + ملاحظات الأسبوع
-- شغّل هذا الملف كامل داخل: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- ---------- 1) الملف الشخصي لكل مستخدم ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  theme text default 'dark' check (theme in ('dark', 'light')),
  created_at timestamptz default now()
);

-- إنشاء بروفايل تلقائيًا عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 2) الأهداف الثابتة (Gym, Programming, Reading...) ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  points int not null default 10,
  color text default '#2DD4BF',
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------- 3) المهام اليومية (كل هدف × كل يوم) ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  task_date date not null,
  is_completed boolean default false,
  notes text default '',
  time_of_day time,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  points_earned int default 0,
  updated_at timestamptz default now(),
  unique (user_id, goal_id, task_date)
);

-- ---------- 4) أيام الراحة ----------
create table if not exists public.rest_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rest_date date not null,
  note text default '',
  unique (user_id, rest_date)
);

-- ---------- 5) ملاحظات نهاية الأسبوع ----------
create table if not exists public.week_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  best_thing text default '',
  worst_thing text default '',
  biggest_challenge text default '',
  next_improvement text default '',
  general_notes text default '',
  unique (user_id, week_start)
);

-- ============================================================
-- Row Level Security: كل مستخدم يشوف بياناته بس
-- ============================================================
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;
alter table public.rest_days enable row level security;
alter table public.week_notes enable row level security;

create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "goals_own" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tasks_own" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "rest_days_own" on public.rest_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "week_notes_own" on public.week_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- فهارس لتحسين الأداء
-- ============================================================
create index if not exists idx_tasks_user_date on public.tasks(user_id, task_date);
create index if not exists idx_goals_user on public.goals(user_id);
