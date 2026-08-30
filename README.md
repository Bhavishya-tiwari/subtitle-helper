# Subtitle Translator

Chrome extension that detects on-screen captions and translates them on demand. Press `'` while a video is playing to see a translation and a short meaning note.

Translations run through a Gemini-powered Next.js backend. Google sign-in is handled by Supabase on the backend site, not inside the extension.

## Features

- On-demand subtitle translation (hotkey: `'`)
- Translation plus a brief meaning explanation
- Google sign-in via the backend (one stable redirect URL)
- Works on YouTube, Netflix, JioHotstar, Prime Video, and Sony LIV

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

## Docs

- [Setup](docs/setup.md) — Supabase, Google OAuth, env vars
- [Auth flow](docs/auth-flow.md) — how login and tokens work
- [API](docs/api.md) — endpoints, request/response, rate limits
- [Quota](docs/quota.md) — `consume_ai_quota` test matrix
