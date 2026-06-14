# Subtitle Translator

Chrome extension that detects video subtitles and shows real-time translations via a Gemini-powered backend.

## Supported Platforms

- YouTube
- Netflix
- JioHotstar (Hotstar)
- Amazon Prime Video

## Project Structure

```
subtitle-translator/
├── chrome-extension/     # Chrome extension (load unpacked)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── content.js        # Subtitle detection + overlay
│   ├── background.js     # API communication
│   └── styles.css
└── backend/              # Next.js API-only server
    ├── app/api/
    │   ├── health/       # GET /api/health
    │   └── translate/    # POST /api/translate
    └── lib/              # Shared logic (translate, auth stub)
```

## Setup

### 1. Get a Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in and click **Create API key**
3. Copy the key (starts with `AIza...`)

### 2. Start the Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set GEMINI_API_KEYS=key1,key2
npm install
npm run dev
```

Server runs at `http://localhost:3000`.

### 3. Load the Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` folder
4. Open the extension popup, set backend URL to `http://localhost:3000`
5. Toggle **Enable Translation** on
6. Play a video on any supported platform (YouTube, Netflix, Hotstar, or Prime Video) with captions enabled
7. Press the `'` (single quote) key to translate the current subtitle

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/translate` | Translate subtitle text |

**Request body:**
```json
{ "text": "Hello world", "targetLang": "hi" }
```

**Response:**
```json
{ "translation": "...", "meaning": "..." }
```
