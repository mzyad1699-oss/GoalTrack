-- ============================================================
-- GoalTrack — المرحلة الثانية
-- الإنجازات + المستويات (XP) + الـ Streak + العملات (Coins)
-- شغّل هذا الملف بعد schema.sql (وليس بدلًا منه)
-- ============================================================

-- ---------- إحصائيات كل مستخدم (XP / Coins / أفضل Streak / سجل الأسابيع) ----------
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp int not null default 0,
  coins int not null default 0,
  best_streak int not null default 0,
  -- سجل الأسابيع المُقفلة: [{ "week_start": "2026-07-04", "percentage": 100, "coins": 10 }, ...]
  week_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.user_stats enable row level security;
create policy "user_stats_own" on public.user_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- إنشاء صف إحصائيات تلقائي مع كل مستخدم جديد
create or replace function public.handle_new_user_stats()
returns trigger as $$
begin
  insert into public.user_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created_stats on auth.users;
create trigger on_auth_user_created_stats
  after insert on auth.users
  for each row execute procedure public.handle_new_user_stats();

-- ---------- الإنجازات المفتوحة لكل مستخدم ----------
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz default now(),
  unique (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;
create policy "user_achievements_own" on public.user_achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_user_achievements_user on public.user_achievements(user_id);
