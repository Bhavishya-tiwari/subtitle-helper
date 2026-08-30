# Subtitle Translator

Chrome extension that detects video subtitles and shows on-demand translations via a Gemini-powered backend.

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
│   ├── config.js         # Backend URL + env switch
│   ├── popup.html / js
│   ├── content.js        # Subtitle detection + overlay
│   └── background.js     # API calls
└── backend/              # Next.js API (Vercel)
    └── app/api/
        ├── health/       # GET /api/health
        └── translate/    # POST /api/translate
```

## Local setup

### 1. Gemini API key

1. Open https://aistudio.google.com/apikey
2. Create a key and put it in `backend/.env`:

```
GEMINI_API_KEY=your_key_here
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

API runs at `http://localhost:9333`.

### 3. Extension

`chrome-extension/config.js` defaults to `NODE_ENV = 'development'` (localhost). Leave that as-is for local work.

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → `chrome-extension/`
4. Play a video with captions on a supported site
5. Press `'` to translate the current subtitle

## Sharing the extension zip

In `chrome-extension/config.js`, set:

```js
export const NODE_ENV = 'production';
```

Then zip the `chrome-extension/` folder. Production calls `https://subtitle-helper-theta.vercel.app`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/translate` | Translate subtitle text |

```json
{ "text": "Hello world", "targetLang": "hi" }
```

```json
{ "translation": "...", "meaning": "..." }
```
