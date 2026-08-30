-- 1/2 — table, index, RLS
-- Paste into Supabase → SQL Editor → New query → Run
--
-- One row per auth user. First /api/translate call creates the row
-- (daily_limit = 100). used_today resets at UTC midnight.
--
-- Raise a user's cap:
--   update public.user_ai_rate_limits
--   set daily_limit = 500
--   where email = 'you@gmail.com';

create table if not exists public.user_ai_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  daily_limit integer not null default 100 check (daily_limit >= 0),
  used_today integer not null default 0 check (used_today >= 0),
  window_date date not null default ((timezone('utc', now()))::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_ai_rate_limits_email_idx
  on public.user_ai_rate_limits (email);

alter table public.user_ai_rate_limits enable row level security;

revoke all on public.user_ai_rate_limits from public, anon, authenticated;
