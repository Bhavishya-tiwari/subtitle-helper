-- 3/3 — get_ai_quota()
-- Run after 002_consume_ai_quota.sql
-- Read-only: does not increment used_today.

create or replace function public.get_ai_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  rec public.user_ai_rate_limits%rowtype;
  remaining integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into rec from public.user_ai_rate_limits where user_id = uid;

  if rec.user_id is null then
    return jsonb_build_object(
      'allowed', true,
      'used', 0,
      'limit', 100,
      'remaining', 100
    );
  end if;

  if rec.window_date < today then
    return jsonb_build_object(
      'allowed', true,
      'used', 0,
      'limit', rec.daily_limit,
      'remaining', rec.daily_limit
    );
  end if;

  remaining := greatest(rec.daily_limit - rec.used_today, 0);

  return jsonb_build_object(
    'allowed', remaining > 0,
    'used', rec.used_today,
    'limit', rec.daily_limit,
    'remaining', remaining
  );
end;
$$;

revoke all on function public.get_ai_quota() from public, anon;
grant execute on function public.get_ai_quota() to authenticated;
