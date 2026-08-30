-- 2/2 — consume_ai_quota()
-- Run after 001_user_ai_rate_limits.sql
-- Paste into Supabase → SQL Editor → New query → Run
--
-- Atomic consume: insert on first use, roll the UTC day, increment if under cap.
-- Empty RETURNING means the user is over their daily_limit.

create or replace function public.consume_ai_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  today date := (timezone('utc', now()))::date;
  rec public.user_ai_rate_limits%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email into user_email from auth.users where id = uid;

  insert into public.user_ai_rate_limits as limits (
    user_id, email, daily_limit, used_today, window_date
  )
  values (uid, coalesce(user_email, ''), 100, 1, today)
  on conflict (user_id) do update
    set
      email = excluded.email,
      used_today = case
        when limits.window_date < today then 1
        else limits.used_today + 1
      end,
      window_date = case
        when limits.window_date < today then today
        else limits.window_date
      end,
      updated_at = now()
    where
      limits.window_date < today
      or limits.used_today < limits.daily_limit
  returning * into rec;

  if rec.user_id is null then
    select * into rec from public.user_ai_rate_limits where user_id = uid;
    return jsonb_build_object(
      'allowed', false,
      'used', rec.used_today,
      'limit', rec.daily_limit,
      'remaining', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', rec.used_today,
    'limit', rec.daily_limit,
    'remaining', greatest(rec.daily_limit - rec.used_today, 0)
  );
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
