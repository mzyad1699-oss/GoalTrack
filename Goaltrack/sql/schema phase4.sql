-- ============================================================
-- GoalTrack — تحسينات تجربة المستخدم (Onboarding + يوم بداية الأسبوع)
-- شغّل هذا الملف بعد schema.sql و schema_phase2.sql و schema_phase3.sql
-- ============================================================

alter table public.user_stats
  add column if not exists start_date date,
  add column if not exists week_start_day smallint not null default 6, -- 6=سبت، 0=أحد، 1=اثنين (نفس ترقيم JS getDay)
  add column if not exists onboarding_completed boolean not null default false;