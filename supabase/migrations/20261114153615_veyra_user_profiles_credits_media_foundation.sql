-- Veyra AI account, credits, generation history, media and subscription foundation.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  transaction_type text not null check (transaction_type in ('grant','purchase','generation','refund','adjustment')),
  description text, reference_id uuid, created_at timestamptz not null default now()
);
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('image','video','image_edit','video_edit')),
  prompt text not null, negative_prompt text,
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','succeeded','failed','cancelled')),
  credits_reserved bigint not null default 0 check (credits_reserved >= 0),
  credits_charged bigint not null default 0 check (credits_charged >= 0),
  provider text, provider_job_id text, error_message text,
  created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz
);
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  media_type text not null check (media_type in ('image','video')),
  bucket_id text not null default 'veyra-user-media',
  object_path text not null, mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bucket_id, object_path)
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','cancelled','expired')),
  billing_provider text, provider_customer_id text, provider_subscription_id text,
  current_period_start timestamptz, current_period_end timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_created_idx on public.credit_transactions(user_id, created_at desc);
create index if not exists generations_user_created_idx on public.generations(user_id, created_at desc);
create index if not exists generations_status_created_idx on public.generations(status, created_at);
create index if not exists media_assets_user_created_idx on public.media_assets(user_id, created_at desc);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists credit_wallets_set_updated_at on public.credit_wallets;
create trigger credit_wallets_set_updated_at before update on public.credit_wallets for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

create or replace function public.handle_new_veyra_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict(id) do nothing;
  insert into public.credit_wallets(user_id) values(new.id)
  on conflict(user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_veyra_auth_user_created on auth.users;
create trigger on_veyra_auth_user_created after insert on auth.users
for each row execute function public.handle_new_veyra_user();

alter table public.profiles enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.generations enable row level security;
alter table public.media_assets enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Users can view own wallet" on public.credit_wallets;
create policy "Users can view own wallet" on public.credit_wallets for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can view own credit transactions" on public.credit_transactions;
create policy "Users can view own credit transactions" on public.credit_transactions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can view own generations" on public.generations;
create policy "Users can view own generations" on public.generations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can queue own generation requests" on public.generations;
create policy "Users can queue own generation requests" on public.generations for insert to authenticated
with check ((select auth.uid()) = user_id and status = 'queued' and credits_reserved = 0 and credits_charged = 0 and provider is null and provider_job_id is null and error_message is null);
drop policy if exists "Users can view own media assets" on public.media_assets;
create policy "Users can view own media assets" on public.media_assets for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can view own subscriptions" on public.subscriptions;
create policy "Users can view own subscriptions" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.credit_wallets from anon, authenticated;
revoke insert, update, delete on public.credit_transactions from anon, authenticated;
revoke update, delete on public.generations from anon, authenticated;
revoke insert, update, delete on public.media_assets from anon, authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('veyra-user-media','veyra-user-media',false,104857600,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Users can read own Veyra media" on storage.objects;
create policy "Users can read own Veyra media" on storage.objects for select to authenticated
using(bucket_id='veyra-user-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can upload own Veyra media" on storage.objects;
create policy "Users can upload own Veyra media" on storage.objects for insert to authenticated
with check(bucket_id='veyra-user-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can update own Veyra media" on storage.objects;
create policy "Users can update own Veyra media" on storage.objects for update to authenticated
using(bucket_id='veyra-user-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='veyra-user-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can delete own Veyra media" on storage.objects;
create policy "Users can delete own Veyra media" on storage.objects for delete to authenticated
using(bucket_id='veyra-user-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
