# Setup

You need a [Supabase](https://supabase.com/dashboard) project, a Google OAuth **Web application** client, and a [Gemini API key](https://aistudio.google.com/apikey).

Use **Web application**, not “Chrome extension”. An unpacked or Drive zip does not have a stable Chrome item ID.

## 1. Supabase project

1. Create a project and wait until it is ready.
2. **Project Settings → API** — copy the **Project URL** and **anon public** key.

## 2. Google OAuth client

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

## 3. Enable Google in Supabase

**Authentication → Sign In / Providers → Google** — enable it, paste the Google client ID and secret, and save.

## 4. Redirect URLs

**Authentication → URL Configuration**

| Setting | Value |
|---------|-------|
| Site URL | `https://subtitle-helper-theta.vercel.app` (use `http://localhost:9333` for local testing) |
| Redirect URLs | `http://localhost:9333/auth/callback` |
| | `http://localhost:9333/auth/done` |
| | `https://subtitle-helper-theta.vercel.app/auth/callback` |
| | `https://subtitle-helper-theta.vercel.app/auth/done` |

Start and finish login on the same host. Mixing localhost login with a production Site URL drops the PKCE cookie.

See [auth-flow.md](auth-flow.md) for why.

## 5. Environment variables

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
