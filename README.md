# Subtitle Translator

Chrome extension that detects on-screen captions and translates them on demand. Press `'` while a video is playing to see a translation and a short meaning note.

Translations run through a Gemini-powered Next.js backend. Google sign-in is handled by Supabase on the backend site, not inside the extension.

## Features

- On-demand subtitle translation (hotkey: `'`)
- Translation plus a brief meaning explanation
- Google sign-in via the backend (one stable redirect URL)
- Works on YouTube, Netflix, JioHotstar, Prime Video, and Sony LIV

## Supported platforms

| Platform | Host |
|----------|------|
| YouTube | `youtube.com` |
| Netflix | `netflix.com` |
| JioHotstar | `hotstar.com` |
| Amazon Prime Video | `primevideo.com` |
| Sony LIV | `sonyliv.com` |

Captions must be visible on screen. The extension reads the current subtitle text — it does not fetch caption files.

## How it works

```
Popup → Sign in with Google
      → backend /auth/login
      → Google → Supabase callback
      → backend /auth/done
      → tokens stored in the extension

Video page → press '
           → POST /api/translate  (Bearer token)
           → overlay with translation + meaning
```

Login lives on the backend (`localhost:9333` or Vercel), not `chrome.identity`. That keeps a single redirect URL so an unpacked or Drive zip works for every user.

See [docs/auth-flow.md](docs/auth-flow.md) for the full auth walkthrough.

## Project structure

```
subtitle-helper/
├── chrome-extension/          # Load unpacked in Chrome
│   ├── config.js              # Backend URL + public Supabase keys
│   ├── popup.html / popup.js
│   ├── content.js             # Subtitle detection + overlay
│   ├── auth-bridge.js         # Copies login session into the extension
│   └── background.js          # Translate API calls
├── backend/                   # Next.js API + login pages
│   ├── app/auth/              # Google login + callback
│   └── app/api/
│       ├── health/
│       └── translate/         # Requires a Supabase JWT when auth env is set
└── docs/auth-flow.md
```

## Prerequisites

You need a [Supabase](https://supabase.com/dashboard) project, a Google OAuth **Web application** client, and a [Gemini API key](https://aistudio.google.com/apikey).

Use **Web application**, not “Chrome extension”. An unpacked or Drive zip does not have a stable Chrome item ID.

### 1. Supabase project

1. Create a project and wait until it is ready.
2. **Project Settings → API** — copy the **Project URL** and **anon public** key.

### 2. Google OAuth client

1. [Google Cloud credentials](https://console.cloud.google.com/apis/credentials) → create or pick a project.
2. **OAuth consent screen**
   - User type: **External**
   - App name: `Subtitle Translator`
   - Add yourself as a test user
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
3. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:9333`
     - `https://subtitle-helper-theta.vercel.app`
     - `https://YOUR_PROJECT.supabase.co`
   - Authorized redirect URIs:
     - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

The Google redirect URI must be the **Supabase callback**, not Vercel and not the extension.

### 3. Enable Google in Supabase

**Authentication → Sign In / Providers → Google** — enable it, paste the Google client ID and secret, and save.

### 4. Redirect URLs

**Authentication → URL Configuration**

| Setting | Value |
|---------|-------|
| Site URL | `https://subtitle-helper-theta.vercel.app` (use `http://localhost:9333` for local testing) |
| Redirect URLs | `http://localhost:9333/auth/callback` |
| | `http://localhost:9333/auth/done` |
| | `https://subtitle-helper-theta.vercel.app/auth/callback` |
| | `https://subtitle-helper-theta.vercel.app/auth/done` |

Start and finish login on the same host. Mixing localhost login with a production Site URL drops the PKCE cookie.

### 5. Environment variables

`backend/.env` and Vercel → **Environment Variables** (Production):

```env
GEMINI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`chrome-extension/config.js` (same public values):

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'your_anon_key';
```

The anon key is public by design and safe to ship in the zip. Never put `GEMINI_API_KEY` or the Supabase **service role** key in the extension.

Redeploy Vercel after changing env vars.

## Local development

```bash
cd backend
cp .env.example .env
# fill GEMINI_API_KEY and the two NEXT_PUBLIC_SUPABASE_* values
npm install
npm run dev
```

API and login pages run at `http://localhost:9333`.

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → `chrome-extension/`
4. Open the popup → **Sign in with Google**
5. After the tab confirms you are signed in, close it
6. Play a video with captions → press `'`

Keep `NODE_ENV = 'development'` in `config.js` for local work.

## Sharing the extension

Keep `NODE_ENV = 'development'` in git. A [GitHub Action](.github/workflows/pack-extension.yml) on every push to `main` flips it to `production` on the runner only, zips `chrome-extension/`, and publishes `subtitle-translator.zip` on the **extension-latest** release.

Download: **Releases → Subtitle Translator → `subtitle-translator.zip`**. Unzip, then Chrome → Extensions → Load unpacked.

Optional repo secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) override the values in `config.js` for that zip. If they are unset, the committed public keys are used. Production traffic goes to `https://subtitle-helper-theta.vercel.app`.

## API

Base URL: `http://localhost:9333` locally, or `https://subtitle-helper-theta.vercel.app` in production.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check |
| `POST` | `/api/translate` | Bearer token (when Supabase env is set) | Translate subtitle text. `429` when the daily quota is used up. |

## Rate limits

Each signed-in user gets **100 translations per UTC day** on first use. Rows live in `user_ai_rate_limits`. Usage resets at UTC midnight; you can raise one person's cap in the Supabase SQL Editor:

```sql
update public.user_ai_rate_limits
set daily_limit = 500
where email = 'you@gmail.com';
```

Create the table once: Supabase → **SQL Editor** → run `001_user_ai_rate_limits.sql`, then `002_consume_ai_quota.sql`.

### Quota test matrix (`consume_ai_quota`)

`today` is the UTC calendar date at call time. New vs existing row is decided only by `user_id` (`INSERT` vs `ON CONFLICT`). The day rolls over only when the stored `window_date` is **before** `today`. `POST /api/translate` returns `429` when `allowed` is `false`.

Assume `daily_limit = 100` unless a case says otherwise.

#### Auth and access

| # | Case | Setup | What happens |
|---|------|-------|--------------|
| A1 | No JWT | `auth.uid()` is null | Raises `28000` (`not authenticated`). No row change. API should treat as 401. |
| A2 | Anon calls the function | Role `anon` | `EXECUTE` is revoked. Call fails with a permission error. |
| A3 | Client reads/writes the table | Role `authenticated`, no service role | Table grants revoked, RLS on, no policies. Direct `SELECT`/`INSERT`/`UPDATE` fails. |
| A4 | Signed-in user, first ever call | JWT present, no row for `user_id` | See B1. |

#### New row vs existing row (same UTC day)

| # | Case | Row before | Decision | Row after | Return |
|---|------|------------|----------|-----------|--------|
| B1 | First call ever | No row | `INSERT` | `used_today = 1`, `window_date = today`, `daily_limit = 100` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| B2 | Same day, under cap | `window_date = today`, `used = 47` | `ON CONFLICT` + increment | `used_today = 48` | `{ allowed: true, used: 48, limit: 100, remaining: 52 }` |
| B3 | Same day, last slot | `window_date = today`, `used = 99` | Increment (99 < 100) | `used_today = 100` | `{ allowed: true, used: 100, limit: 100, remaining: 0 }` |
| B4 | Same day, already at cap | `window_date = today`, `used = 100` | `WHERE` fails; no update | Unchanged | `{ allowed: false, used: 100, limit: 100, remaining: 0 }` |
| B5 | Same day, used already over cap | `window_date = today`, `used = 80`, `limit = 50` (cap lowered) | `WHERE` fails | Unchanged | `{ allowed: false, used: 80, limit: 50, remaining: 0 }` |

#### New UTC day (`window_date < today`)

The next request after UTC midnight is what resets the counter. There is no cron.

| # | Case | Row before | Decision | Row after | Return |
|---|------|------------|----------|-----------|--------|
| C1 | New day, was under cap | `window_date = yesterday`, `used = 47` | Reset because date is stale | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| C2 | New day, was at cap | `window_date = yesterday`, `used = 100` | Reset still allowed (`window_date < today` wins the `WHERE`) | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 100, remaining: 99 }` |
| C3 | New day, used was over cap | `window_date = yesterday`, `used = 80`, `limit = 50` | Reset allowed | `used_today = 1`, `window_date = today` | `{ allowed: true, used: 1, limit: 50, remaining: 49 }` |
| C4 | Same instant as midnight | `window_date = today` (already stamped) | Same-day path (B2–B4), not a reset | Increment or deny | Depends on `used` vs `limit` |

#### Admin changes `daily_limit` mid-day

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

#### Email, concurrency, clock skew

| # | Case | Setup | What happens |
|---|------|-------|--------------|
| E1 | Email changed in `auth.users` | Consume is **allowed** | Row `email` is refreshed from `auth.users`. |
| E2 | Email changed in `auth.users` | Consume is **denied** (at cap) | No `UPDATE` runs, so `email` stays stale until a later allowed call. |
| E3 | Auth user has no email | `email` is null | Insert/update stores `''`. |
| E4 | Two first-ever calls at once | No row yet | One `INSERT` wins (`used = 1`). The other hits `ON CONFLICT` and increments to `2`. Both `allowed: true`. |
| E5 | Two calls when `used = 99`, `limit = 100` | Same-day last slot | Row lock serializes. First: `used = 100`, allowed. Second: `WHERE` fails, denied. Only one request gets through. |
| E6 | Two calls when already at cap | `used = 100` | Both denied. Row unchanged. |
| E7 | Stored `window_date` is in the future | Clock skew / bad data | Not treated as a new day. Same-day increment or deny. Date is left in the future. |

**Request**

```json
{
  "text": "Hello world",
  "targetLang": "hi"
}
```

`text` is limited to 500 characters. Allowed `targetLang` values: `hi`, `es`, `fr`, `de`, `ja`, `ko`, `zh`, `pt`, `ar`, `ru`.

**Response**

```json
{
  "translation": "...",
  "meaning": "..."
}
```
