# Subtitle Translator

Chrome extension that detects video subtitles and shows on-demand translations via a Gemini-powered backend. Google sign-in is handled by Supabase.

## Supported platforms

- YouTube
- Netflix
- JioHotstar (Hotstar)
- Amazon Prime Video
- Sony LIV

## Project structure

```
subtitle-helper/
├── chrome-extension/     # Load unpacked in Chrome
│   ├── config.js         # Backend URL + Supabase public keys
│   ├── popup.html / js
│   ├── content.js        # Subtitle detection + overlay
│   ├── auth-bridge.js    # Passes login session into the extension
│   └── background.js     # API calls
└── backend/              # Next.js API + login pages (Vercel)
    ├── app/auth/         # Google login + callback
    └── app/api/
        ├── health/
        └── translate/    # Requires a Supabase JWT once auth env is set
```

## Auth setup (do this first)

Login runs on the backend site (`localhost:9333` or Vercel), not inside `chrome.identity`. That keeps one stable redirect URL so a Drive zip works for everyone.

### 1. Create a Supabase project

1. Open https://supabase.com/dashboard
2. **New project** → pick an org, name, password, region
3. Wait until it is ready
4. **Project Settings → API**
   - Copy **Project URL**
   - Copy **anon public** key

### 2. Create a Google OAuth client (Web application)

Use **Web application**, not “Chrome extension”. A Drive/unpacked zip does not have a stable Chrome item ID.

1. Open https://console.cloud.google.com/apis/credentials
2. Create or pick a Google Cloud project
3. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: `Subtitle Translator`
   - Add yourself as a test user
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
4. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:9333`
     - `https://subtitle-helper-theta.vercel.app`
     - `https://YOUR_PROJECT.supabase.co`
   - Authorized redirect URIs:
     - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client secret**

The Google redirect URI must be the **Supabase callback**, not Vercel and not the extension.

### 3. Turn on Google in Supabase

1. Supabase → **Authentication → Sign In / Providers → Google**
2. Enable it
3. Paste the Google **Client ID** and **Client secret**
4. Save

### 4. Allow the app redirect URLs

Supabase → **Authentication → URL Configuration**

- Site URL: `https://subtitle-helper-theta.vercel.app` (use `http://localhost:9333` while testing locally)
- Redirect URLs:
    - `http://localhost:9333/auth/callback`
    - `http://localhost:9333/auth/done`
    - `https://subtitle-helper-theta.vercel.app/auth/callback`
    - `https://subtitle-helper-theta.vercel.app/auth/done`

### 5. Put the keys in env files

`backend/.env` and Vercel → Environment Variables (Production):

```
GEMINI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`chrome-extension/config.js` (same public values):

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'your_anon_key';
```

The anon key is safe to ship in the zip. Never put the Gemini key or the Supabase service role key in the extension.

Redeploy Vercel after adding env vars.

## Local setup

```bash
cd backend
cp .env.example .env
# fill GEMINI_API_KEY + the two NEXT_PUBLIC_SUPABASE_* values
npm install
npm run dev
```

API and login pages run at `http://localhost:9333`.

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → `chrome-extension/`
4. Open the popup → **Sign in with Google**
5. After the tab says you are signed in, close it
6. Play a video with captions → press `'` to translate

`config.js` stays on `NODE_ENV = 'development'` for local work.

## Sharing the extension zip

In `chrome-extension/config.js`:

```js
export const NODE_ENV = 'production';
```

Then zip `chrome-extension/`. Production calls `https://subtitle-helper-theta.vercel.app`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/translate` | Translate subtitle text (Bearer token once Supabase env is set) |

```json
{ "text": "Hello world", "targetLang": "hi" }
```

```json
{ "translation": "...", "meaning": "..." }
```
