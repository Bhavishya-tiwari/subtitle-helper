# Quota test matrix (`consume_ai_quota`)

`today` is the UTC calendar date at call time. New vs existing row is decided only by `user_id` (`INSERT` vs `ON CONFLICT`). The day rolls over only when the stored `window_date` is **before** `today`. `POST /api/translate` returns `429` when `allowed` is `false`.

Assume `daily_limit = 100` unless a case says otherwise.

## Auth and access

| # | Case | Setup | What happens |
|---|------|-------|--------------|
| A1 | No JWT | `auth.uid()` is null | Raises `28000` (`not authenticated`). No row change. API should treat as 401. |
| A2 | Anon calls the function | Role `anon` | `EXECUTE` is revoked. Call fails with a permission error. |
| A3 | Client reads/writes the table | Role `authenticated`, no service role | Table grants revoked, RLS on, no policies. Direct `SELECT`/`INSERT`/`UPDATE` fails. |
| A4 | Signed-in user, first ever call | JWT present, no row for `user_id` | See B1. |

## New row vs existing row (same UTC day)

| # | Case | Row before | Decision | Row after | Return |
|---|------|------------|----------|-----------|--------|
| B1 | First call ever | No row | `INSERT` | `used_today = 1`, `window_date = today`, `daily_limit = 100` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| B2 | Same day, under cap | `window_date = today`, `used = 47` | `ON CONFLICT` + increment | `used_today = 48` | `{ allowed: true, used: 48, limit: 100, remaining: 52 }` |
| B3 | Same day, last slot | `window_date = today`, `used = 99` | Increment (99 < 100) | `used_today = 100` | `{ allowed: true, used: 100, limit: 100, remaining: 0 }` |
| B4 | Same day, already at cap | `window_date = today`, `used = 100` | `WHERE` fails; no update | Unchanged | `{ allowed: false, used: 100, limit: 100, remaining: 0 }` |
| B5 | Same day, used already over cap | `window_date = today`, `used = 80`, `limit = 50` (cap lowered) | `WHERE` fails | Unchanged | `{ allowed: false, used: 80, limit: 50, remaining: 0 }` |

## New UTC day (`window_date < today`)

The next request after UTC midnight is what resets the counter. There is no cron.

| # | Case | Row before | Decision | Row after | Return |
|---|------|------------|----------|-----------|--------|
| C1 | New day, was under cap | `window_date = yesterday`, `used = 47` | Reset because date is stale | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| C2 | New day, was at cap | `window_date = yesterday`, `used = 100` | Reset still allowed (`window_date < today` wins the `WHERE`) | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| C3 | New day, used was over cap | `window_date = yesterday`, `used = 80`, `limit = 50` | Reset allowed | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 50, remaining: 49 }` |
| C4 | Same instant as midnight | `window_date = today` (already stamped) | Same-day path (B2–B4), not a reset | Increment or deny | Depends on `used` vs `limit` |

## Admin changes `daily_limit` mid-day

| # | Case | Row before | Decision | Row after | Return |
|---|------|------------|----------|-----------|--------|
| D1 | Cap raised after hitting old cap | `used = 100`, `limit = 500` | 100 < 500, increment | `used_today = 101` | `{ allowed: true, used: 101, limit: 500, remaining: 399 }` |
| D2 | Cap raised, still under old usage | `used = 50`, `limit = 500` | Increment | `used_today = 51` | `{ allowed: true, used: 51, limit: 500, remaining: 449 }` |
| D3 | Cap lowered, still above used | `used = 80`, `limit = 90` | 80 < 90, increment | `used_today = 81` | `{ allowed: true, used: 81, limit: 90, remaining: 9 }` |
| D4 | Cap lowered below used | `used = 80`, `limit = 50` | Same as B5 | Unchanged | `{ allowed: false, used: 80, limit: 50, remaining: 0 }` |
| D5 | Cap set to 0, same day, unused | `used = 0`, `limit = 0` | 0 < 0 is false; deny | Unchanged | `{ allowed: false, used: 0, limit: 0, remaining: 0 }` |
| D6 | Cap set to 0, new day | `window_date = yesterday`, `used = 0`, `limit = 0` | New day `WHERE` passes; reset consumes 1 | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 0, remaining: 0 }` |
| D7 | Cap is 1, first call of the day | `used = 0` or new day | Consume the only slot | `used_today = 1` | `{ allowed: true, used: 1, limit: 1, remaining: 0 }` |
| D8 | Cap is 1, second call same day | `used = 1`, `limit = 1` | Deny | Unchanged | `{ allowed: false, used: 1, limit: 1, remaining: 0 }` |

D6 is a quirk: `daily_limit = 0` still allows one call on a new UTC day because the date-rollover `WHERE` does not check the cap.

## Email, concurrency, clock skew

| # | Case | Setup | What happens |
|---|------|-------|--------------|
| E1 | Email changed in `auth.users` | Consume is **allowed** | Row `email` is refreshed from `auth.users`. |
| E2 | Email changed in `auth.users` | Consume is **denied** (at cap) | No `UPDATE` runs, so `email` stays stale until a later allowed call. |
| E3 | Auth user has no email | `email` is null | Insert/update stores `''`. |
| E4 | Two first-ever calls at once | No row yet | One `INSERT` wins (`used = 1`). The other hits `ON CONFLICT` and increments to `2`. Both `allowed: true`. |
| E5 | Two calls when `used = 99`, `limit = 100` | Same-day last slot | Row lock serializes. First: `used = 100`, allowed. Second: `WHERE` fails, denied. Only one request gets through. |
| E6 | Two calls when already at cap | `used = 100` | Both denied. Row unchanged. |
| E7 | Stored `window_date` is in the future | Clock skew / bad data | Not treated as a new day. Same-day increment or deny. Date is left in the future. |
