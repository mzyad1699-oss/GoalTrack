-- ============================================================
-- GoalTrack — إضافة صفحة Explore (مشاركة Templates)
-- شغّل هذا الملف بعد schema.sql و schema_phase2.sql
-- ============================================================

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  -- goals: [{ "name": "الجيم", "points": 10 }, ...]
  goals jsonb not null default '[]'::jsonb,
  uses_count int not null default 0,
  created_at timestamptz default now()
);

alter table public.templates enable row level security;

-- أي حد (حتى غير مسجل) يقدر يشوف القوالب
create policy "templates_public_read" on public.templates
  for select using (true);

-- بس صاحب القالب يقدر يعدّل أو يحذف بتاعه
create policy "templates_owner_insert" on public.templates
  for insert with check (auth.uid() = user_id);

create policy "templates_owner_update" on public.templates
  for update using (auth.uid() = user_id);

create policy "templates_owner_delete" on public.templates
  for delete using (auth.uid() = user_id);

-- دالة لزيادة عداد الاستخدام حتى لو الناسخ مش صاحب القالب
create or replace function public.increment_template_uses(template_id uuid)
returns void as $$
begin
  update public.templates set uses_count = uses_count + 1 where id = template_id;
end;
$$ language plpgsql security definer;

grant execute on function public.increment_template_uses(uuid) to authenticated, anon;

create index if not exists idx_templates_created on public.templates(created_at desc);