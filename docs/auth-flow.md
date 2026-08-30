# Auth flow

Google sign-in for the Chrome extension. Login runs on the **backend site** (Vercel in production, localhost in development). The extension never talks to Google.

Production hosts used below:

- Extension backend: `https://subtitle-helper-theta.vercel.app`
- Supabase: `https://xpvbwytkeieldhvzdqrg.supabase.co`

Local is the same path with `http://localhost:9333` instead of Vercel.

---

## Why it is built this way

A Drive / unpacked zip does not have a stable Chrome Web Store ID, so `chrome.identity` and a “Chrome extension” Google client are a poor fit. One stable redirect URL on Vercel works for every user.

Google never sees the Gemini key. The extension never sees the Gemini key or the Google client secret. Vercel never sees the Google client secret — only Supabase does.

---

## End to end

```
Popup "Sign in with Google"
    → tab: vercel.app/auth/login
    → Google
    → supabase.co/auth/v1/callback
    → vercel.app/auth/callback?code=...
    → vercel.app/auth/done
    → auth-bridge.js copies tokens into the extension
    → later: POST /api/translate  Authorization: Bearer <access_token>
```

### 1. User clicks “Sign in with Google”

The popup only opens a tab:

`https://subtitle-helper-theta.vercel.app/auth/login`

It does not call Google or Supabase.

### 2. Browser is on Vercel `/auth/login`

This Next.js page needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (that is why those two vars are on Vercel).

It tells Supabase: start Google login, and when finished send the user back to

`https://subtitle-helper-theta.vercel.app/auth/callback`

It also sets a **PKCE cookie** on `subtitle-helper-theta.vercel.app` — a one-time secret that never goes to Google. Then the browser is sent to Google.

### 3. User signs in on Google

Google does not redirect to Vercel. The only redirect Google trusts is the one on the OAuth client:

`https://xpvbwytkeieldhvzdqrg.supabase.co/auth/v1/callback`

After the user picks an account, Google sends the browser to **Supabase** with a short-lived Google code.

### 4. Supabase `/auth/v1/callback`

Supabase talks to Google with the **Client ID + Client secret** (dashboard only). It verifies the user, creates/updates the Auth user, and issues its own session.

Then it redirects the browser to the allowlisted app URL:

`https://subtitle-helper-theta.vercel.app/auth/callback?code=SOME_CODE`

`SOME_CODE` is a **Supabase one-time ticket**, not an access token, and not the Google code.

### 5. Vercel `/auth/callback` (server)

The browser talks to **Vercel**, not Supabase.

The address bar is already on `subtitle-helper-theta.vercel.app`. The browser sends Vercel:

- `code` in the URL
- the PKCE cookie from step 2 (same site)

The Next.js **server** route then calls Supabase: “here is the code and the verifier, give me tokens.”

The `code` is useless alone. It only means Supabase will issue a session if the caller also proves they started this login. That proof is the cookie. Anyone who copies the URL still cannot finish login.

Supabase checks they match, **burns the code** (one use), and returns `access_token` + `refresh_token`. Vercel stores the session in cookies and redirects to `/auth/done`.

This is the same pattern as Google → Supabase in step 4: Google also gave Supabase a code, and Supabase exchanged it. Step 5 is that exchange one hop closer to the app.

```
Browser  →  Vercel /auth/callback
Vercel   →  Supabase (exchange code)
Vercel   →  Browser /auth/done
```

### 6. Vercel `/auth/done`

The page reads the session and `postMessage`s `{ access_token, refresh_token, user }` to itself.

`auth-bridge.js` is injected only on this site’s `/auth/*` pages. It forwards that message to the extension service worker. Tokens go into `chrome.storage`. The popup shows the email.

### 7. Translate

User presses `'` on a video page. The extension calls:

```
POST https://subtitle-helper-theta.vercel.app/api/translate
Authorization: Bearer <access_token>
```

Vercel calls `supabase.auth.getUser(token)`. If the token is valid, it calls Gemini with `GEMINI_API_KEY` and returns the translation. If Supabase env is set and the token is missing/invalid → `401`.

---

## Who holds what

| Place | What it has |
|---|---|
| Google | The user’s Google account |
| Supabase | User row + session tokens; Google client secret |
| Vercel | Supabase URL + anon key (login + token check); Gemini key (translate only) |
| Extension | Copy of the user’s access / refresh tokens |

---

## Env vars

Local `backend/.env` is only for `npm run dev`. Production is Vercel. Same names, two places.

| Variable | Where | Used for |
|---|---|---|
| `GEMINI_API_KEY` | Vercel + local `.env` | Gemini translate only |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local `.env` | Login pages + `getUser` on `/api/translate` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local `.env` | Same. Anon key is public by design. |

Do not put the Supabase **service_role** key on Vercel unless you later need admin APIs. Do not put `GEMINI_API_KEY` in the extension.

The extension `config.js` copies of `SUPABASE_URL` and `SUPABASE_ANON_KEY` are only for refreshing an expired token. Vercel does not read `config.js`.

After adding env vars on Vercel, redeploy. They do not apply to an already-running deployment.

---

## Stay on one origin

Start and finish on the same host. If login starts on `localhost:9333`, the callback must be `localhost:9333`, not Vercel. The PKCE cookie is host-specific. Mixing local login with a production Site URL drops the cookie and shows “PKCE code verifier not found in storage.”
