# API

Base URL: `http://localhost:9333` locally, or `https://subtitle-helper-theta.vercel.app` in production.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check |
| `GET` | `/api/quota` | Bearer token | Remaining translations for today |
| `POST` | `/api/translate` | Bearer token (when Supabase env is set) | Translate subtitle text. `429` when the daily quota is used up. |

## Request

```json
{
  "text": "Hello world",
  "targetLang": "hi"
}
```

`text` is limited to 500 characters. Allowed `targetLang` values: `hi`, `es`, `fr`, `de`, `ja`, `ko`, `zh`, `pt`, `ar`, `ru`.

## Response

```json
{
  "translation": "...",
  "meaning": "..."
}
```

## Rate limits

Each signed-in user gets **100 translations per UTC day** on first use. Rows live in `user_ai_rate_limits`. Usage resets at UTC midnight; you can raise one person's cap in the Supabase SQL Editor:

```sql
update public.user_ai_rate_limits
set daily_limit = 500
where email = 'you@gmail.com';
```

Create the table once: Supabase → **SQL Editor** → run `001_user_ai_rate_limits.sql`, then `002_consume_ai_quota.sql`, then `003_get_ai_quota.sql`.

See [quota.md](quota.md) for the `consume_ai_quota` test matrix.
