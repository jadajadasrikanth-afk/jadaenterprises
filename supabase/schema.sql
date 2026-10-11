-- ============================================================
-- SCHEMA: Field Data Collection App
-- Run this once in Supabase SQL Editor (Project > SQL Editor)
-- ============================================================

-- Extension for UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- USERS TABLE
-- One row per field user. auth.uid() = id (linked to Supabase Auth)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  mobile_number text unique not null,
  full_name text,
  hotel_name text,
  reference_phone text,
  gps_lat double precision,
  gps_lng double precision,
  id_proof_file_path text,      -- GCS object path, never a public URL
  shop_photo_file_path text,    -- GCS object path, never a public URL
  is_admin boolean not null default false,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- AUDIT LOG
-- Every login, save, update, admin action gets a row here.
-- ------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_mobile text,
  action text not null,          -- 'login' | 'profile_created' | 'profile_updated'
                                  -- | 'admin_view' | 'admin_edit' | 'admin_delete'
                                  -- | 'admin_disable' | 'admin_export' | 'password_reset_sent'
  target_id uuid,                -- which user's record this action was about
  details jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PASSWORD RESET REQUESTS
-- User taps "forgot password" -> row created here -> admin sees it
-- and dashboard and sends a Supabase-generated reset link manually
-- ------------------------------------------------------------
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  mobile_number text not null,
  status text not null default 'pending',  -- 'pending' | 'sent' | 'completed'
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.password_reset_requests enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$ language sql stable security definer;

-- ---- profiles policies ----

-- Users can see their own row; admins can see all
create policy "profiles_select_own_or_admin"
on public.profiles for select
using ( auth.uid() = id or public.is_admin() );

-- Users can insert only their own row (at signup)
create policy "profiles_insert_own"
on public.profiles for insert
with check ( auth.uid() = id );

-- Users can update only their own row; admins can update any
create policy "profiles_update_own_or_admin"
on public.profiles for update
using ( auth.uid() = id or public.is_admin() )
with check ( auth.uid() = id or public.is_admin() );

-- SECURITY: the policy above allows a user to update their own row, which
-- on its own would let them set is_admin = true or is_disabled = false on
-- themselves. This trigger blocks that: only an existing admin may change
-- those two columns, regardless of whose row is being updated.
create or replace function public.prevent_self_privilege_escalation()
returns trigger as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.is_disabled is distinct from old.is_disabled)
     and not public.is_admin() then
    raise exception 'Only an admin can change is_admin or is_disabled';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_privilege_escalation on public.profiles;
create trigger trg_prevent_privilege_escalation
before update on public.profiles
for each row execute function public.prevent_self_privilege_escalation();

-- Only admins can delete
create policy "profiles_delete_admin_only"
on public.profiles for delete
using ( public.is_admin() );

-- ---- audit_logs policies ----

-- Only admins can read audit logs
create policy "audit_logs_select_admin_only"
on public.audit_logs for select
using ( public.is_admin() );

-- Any authenticated user can insert a log row about themselves
-- (writes should really go through Edge Functions using the service role,
-- this is a fallback / defense-in-depth policy)
create policy "audit_logs_insert_self"
on public.audit_logs for insert
with check ( actor_id = auth.uid() );

-- Admins can also insert log rows for admin actions taken on other users
-- (e.g. disable/delete/export triggered directly from the dashboard)
create policy "audit_logs_insert_admin"
on public.audit_logs for insert
with check ( public.is_admin() );

-- ---- password_reset_requests policies ----

-- Anyone (even unauthenticated, via anon key) can create a reset request
create policy "reset_requests_insert_anyone"
on public.password_reset_requests for insert
with check ( true );

-- Only admins can view / update reset requests
create policy "reset_requests_select_admin_only"
on public.password_reset_requests for select
using ( public.is_admin() );

create policy "reset_requests_update_admin_only"
on public.password_reset_requests for update
using ( public.is_admin() );

-- ============================================================
-- STORAGE (Supabase Storage replaces Google Cloud Storage)
-- One private bucket. Files are stored as:
--   user-documents/<user_id>/id_proof.jpg
--   user-documents/<user_id>/shop_photo.jpg
-- Fixed filenames per type so a re-upload simply overwrites the old one.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

-- A user may upload only into their own folder (first path segment = their uid)
create policy "storage_insert_own_folder"
on storage.objects for insert
with check (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- A user may view their own files; an admin may view anyone's
create policy "storage_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'user-documents'
  and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() )
);

-- A user may overwrite (re-upload) their own files; an admin may overwrite anyone's
create policy "storage_update_own_or_admin"
on storage.objects for update
using (
  bucket_id = 'user-documents'
  and ( (storage.foldername(name))[1] = auth.uid()::text or public.is_admin() )
);

-- Only admins may delete a stored file directly
create policy "storage_delete_admin_only"
on storage.objects for delete
using ( bucket_id = 'user-documents' and public.is_admin() );

-- ============================================================
-- REALTIME
-- Lets the admin dashboard's live activity feed update instantly
-- without a page refresh.
-- ============================================================
alter publication supabase_realtime add table public.audit_logs;

-- ============================================================
-- FIRST ADMIN
-- After your friend signs up normally through the app once,
-- run this manually (replace the mobile number) to promote them:
--
--   update public.profiles set is_admin = true
--   where mobile_number = '9876543210';
-- ============================================================
