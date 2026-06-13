# Subtitle Translator - Technical Documentation

## Overview

A Chrome extension that translates video subtitles on-demand using AI. Press `⌘+'` (Mac) or `Ctrl+'` (Windows) while watching YouTube or Netflix to get instant Hindi translations with complex word explanations.

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  YouTube/Netflix │
│  Video Page     │
└────────┬────────┘
         │ User presses ⌘+'
         ↓
┌─────────────────┐
│  content.js     │ ← Detects subtitle from DOM
│  (Content Script)│
└────────┬────────┘
         │ chrome.runtime.sendMessage()
         ↓
┌─────────────────┐
│  background.js  │ ← Service worker
│  (Background)   │
└────────┬────────┘
         │ HTTP POST
         ↓
┌─────────────────┐
│  Express.js     │ ← Backend API (localhost:3000)
│  Backend        │
└────────┬────────┘
         │ Gemini API call
         ↓
┌─────────────────┐
│  Gemini API     │ ← AI translation
│  (Google)       │
└────────┬────────┘
         │ JSON response
         ↓
┌─────────────────┐
│  Overlay on     │ ← Shows translation + word meanings
│  Video Page     │
└─────────────────┘
```

### Components

#### 1. Chrome Extension (Frontend)

**manifest.json**
- Defines extension metadata, permissions, and content script injection rules
- Loads `content.js` on YouTube and Netflix pages
- Background service worker runs `background.js`

**content.js** (Content Script)
- Injected into video pages
- Listens for `⌘+'` hotkey via `keydown` event
- Scans DOM for subtitle elements using CSS selectors
- Creates overlay UI to display translations
- Handles fullscreen mode by dynamically attaching to `document.fullscreenElement`

**background.js** (Service Worker)
- Acts as message broker between content script and backend
- Makes HTTP requests to backend API
- Sanitizes user input before sending
- Routes translation results back to content script

**popup.html/js**
- Extension settings interface
- Configure backend URL, target language, enable/disable hotkey
- Test connection button to verify backend is running

**styles.css**
- Overlay styling with high z-index for visibility
- Fullscreen-compatible positioning
- Toast notifications for errors

#### 2. Backend API (Express.js)

**server.js**
- Express HTTP server on port 3000
- CORS middleware (allows `chrome-extension://` origins)
- Rate limiting: 30 requests/minute per IP
- Health check endpoint `/api/health`

**routes/index.js**
- Central router mounting all API routes
- `/api/health` → health check
- `/api/translate` → translation endpoint

**routes/translate.js**
- POST endpoint accepting `{text, targetLang}`
- Round-robin key rotation for multiple Gemini API keys
- Input sanitization (removes `<>`, length limits)
- Prompt engineering for Gemini
- Response parsing (extracts JSON from LLM output)
- Output validation (blocks sensitive keywords)

**routes/health.js**
- Simple health check returning `{status, timestamp, hasApiKey}`

---

## Key Concepts & Technologies

### 1. Chrome Extension Architecture

**Manifest V3**
- Latest Chrome extension format
- Service workers instead of background pages
- Enhanced security with CSP (Content Security Policy)

**Content Scripts**
- JavaScript injected into web pages
- Access to page DOM but isolated from page scripts
- Can communicate with background via message passing

**Message Passing**
```javascript
// content.js → background.js
chrome.runtime.sendMessage({action: 'translate', text: '...'});

// background.js → content.js
chrome.tabs.sendMessage(tabId, {action: 'translationResult', data: {...}});
```

**Permissions**
- `activeTab`: Access current tab when user interacts
- `storage`: Store user preferences locally
- `host_permissions`: Access specific domains (YouTube, Netflix, localhost)

### 2. Hotkey Detection

**Event Capture Phase**
```javascript
document.addEventListener('keydown', onHotkey, true);
```
- `true` = capture phase (runs before page handlers)
- Checks: `enabled && (metaKey || ctrlKey) && key === "'"`
- `e.preventDefault()` stops YouTube/Netflix from handling the key
- Ignores keypresses in input fields

### 3. Subtitle Detection

**CSS Selector Strategy**
```javascript
const SUBTITLE_SELECTORS = [
  '.ytp-caption-segment',        // YouTube
  '.player-timedtext-text-container span', // Netflix
  '[class*="caption"] span'       // Generic fallback
];
```
- Loop through selectors, return first match
- `querySelectorAll()` finds all matching elements
- Deduplicate text with `Set` to avoid duplicates
- Joins with space for multi-line subtitles

### 4. Fullscreen Handling

```javascript
const fsElement = document.fullscreenElement || 
                  document.webkitFullscreenElement;
const container = fsElement || document.body;
```
- Overlay appends to `document.fullscreenElement` if active
- Listens to `fullscreenchange` event to re-attach
- Ensures overlay appears above video player

### 5. Backend API Design

**Round-Robin Key Rotation**
```javascript
let keyIndex = 0;
const keys = env.GEMINI_API_KEYS.split(',');
const key = keys[keyIndex % keys.length];
keyIndex = (keyIndex + 1) % keys.length;
```
- Distributes requests across multiple API keys
- Doubles rate limit capacity (20/min per key → 40/min total)

**Prompt Engineering**
```
For the subtitle text:
1. Translate it into Hindi
2. Identify complex English words and explain in Hindi

Respond in JSON:
{"translation": "...", "words": [{"word": "...", "meaning": "..."}]}
```
- Structured output format for parsing
- Guards against prompt injection with INPUT_START/END markers
- Temperature 0.3 for consistency

**Security Measures**
- Input sanitization: removes `<>`, limits length to 500 chars
- Output validation: blocks keywords like "api_key", "password"
- CORS restricted to extension origins
- Rate limiting per IP
- No logging of user data

### 6. State Management

**Chrome Storage API**
```javascript
chrome.storage.local.set({enabled: true, targetLang: 'hi'});
chrome.storage.local.get(['enabled'], (result) => {...});
```
- Persists user preferences across sessions
- Accessed from both popup and content scripts

**Translation State**
```javascript
let isTranslating = false;
if (isTranslating) return; // Prevents duplicate requests
isTranslating = true;
// ... make API call ...
isTranslating = false;
```
- Prevents rapid-fire duplicate translations
- Debouncing via flag

### 7. Error Handling

**Graceful Degradation**
- Toast notifications for missing subtitles
- Console logs for API errors (not shown to user)
- Fallback to plaintext if JSON parsing fails
- Generic error messages (no internal details leaked)

---

## Installation & Usage

### Prerequisites

- Node.js 18+ and npm
- Chrome/Chromium browser
- Gemini API key(s) from [Google AI Studio](https://aistudio.google.com/apikey)

### Backend Setup

```bash
cd subtitle-translator/backend

# Install dependencies
npm install

# Configure API keys
cp .env.example .env
# Edit .env and set:
#   GEMINI_API_KEYS=key1,key2  (comma-separated for round-robin)
# OR
#   GEMINI_API_KEY=single_key

# Start server
npm start
```

Server runs at `http://localhost:3000`.

Verify:
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok","hasApiKey":true}
```

### Extension Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select folder: `subtitle-translator/chrome-extension/`
5. Extension icon appears in toolbar

### Configuration

1. Click extension icon in toolbar
2. **Backend URL**: Default `http://localhost:3000` (change if deployed elsewhere)
3. **Target Language**: Hindi, Spanish, French, etc.
4. **Enable Hotkey**: Toggle on (enabled by default)
5. Click **Test Connection** to verify backend

### Using the Extension

#### On YouTube

1. Open any YouTube video
2. Enable **Closed Captions** (CC button)
3. Play the video
4. When a subtitle appears, press **⌘+'** (Mac) or **Ctrl+'** (Windows)
5. Overlay shows:
   - Original subtitle (gray)
   - Hindi translation (white)
   - Complex word meanings (yellow)

#### On Netflix

1. Open any Netflix video
2. Enable subtitles in player settings
3. Play the video
4. Press **⌘+'** when subtitle is visible
5. Translation overlay appears

#### In Fullscreen

- Works identically in fullscreen mode
- Overlay automatically repositions

#### Troubleshooting

**"No subtitle found"**
- Ensure captions/subtitles are enabled on the video
- Extension only detects visible subtitles

**"Translation failed"**
- Check backend is running: `curl http://localhost:3000/api/health`
- Verify API key in `.env` is valid
- Check browser console for errors (F12 → Console)

**Overlay not appearing**
- Reload extension: `chrome://extensions/` → reload icon
- Close and reopen video tab
- Check "Enable Hotkey" is toggled on in popup

**Auto-translate on scroll/subtitle change**
- Old extension version still loaded
- Close ALL YouTube/Netflix tabs
- Reload extension
- Open fresh video tab

**Rate limit errors (429)**
- Free tier: 20 requests/min per key
- Add second API key to `.env`: `GEMINI_API_KEYS=key1,key2`
- Restart backend

---

## File Structure

```
subtitle-translator/
├── chrome-extension/
│   ├── manifest.json         # Extension config
│   ├── popup.html            # Settings UI
│   ├── popup.js              # Settings logic
│   ├── content.js            # Subtitle detection + overlay
│   ├── background.js         # API communication
│   ├── styles.css            # Overlay styles
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
│
├── backend/
│   ├── server.js             # Express app
│   ├── package.json          # Dependencies
│   ├── .env                  # API keys (gitignored)
│   ├── .env.example          # Template
│   └── routes/
│       ├── index.js          # Router
│       ├── health.js         # Health check
│       └── translate.js      # Translation logic
│
├── README.md                 # Quick start guide
└── PROJECT.md                # This file
```

---

## API Reference

### POST /api/translate

**Request:**
```json
{
  "text": "The protagonist was melancholic",
  "targetLang": "hi"
}
```

**Response:**
```json
{
  "translation": "मुख्य पात्र उदास था",
  "meaning": "protagonist: मुख्य किरदार | melancholic: गहरी उदासी"
}
```

**Supported Languages:**
`hi` (Hindi), `es` (Spanish), `fr` (French), `de` (German), `ja` (Japanese), `ko` (Korean), `zh` (Chinese), `pt` (Portuguese), `ar` (Arabic), `ru` (Russian)

**Rate Limits:**
- 30 requests/minute per IP
- Gemini free tier: 20 requests/minute per API key

**Error Responses:**
- `400`: Invalid input (missing text, unsupported language)
- `429`: Rate limit exceeded
- `500`: Translation failed (Gemini API error)
- `503`: No API key configured

### GET /api/health

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-14T00:00:00.000Z",
  "hasApiKey": true
}
```

---

## Development

### Running in Dev Mode

**Backend (with auto-reload):**
```bash
cd backend
npm run dev  # Uses node --watch
```

**Extension:**
- Make code changes
- Go to `chrome://extensions/`
- Click reload icon on extension
- Hard refresh video tab: `Cmd+Shift+R`

### Testing

**Backend API:**
```bash
# Health check
curl http://localhost:3000/api/health

# Translation
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","targetLang":"hi"}'
```

**Extension:**
- Open DevTools on video page: `F12` → Console
- Check for errors from `content.js`
- View background worker logs: `chrome://extensions/` → Service Worker link

### Adding New Video Sites

1. **Update manifest.json:**
```json
"content_scripts": [{
  "matches": [
    "https://*.youtube.com/*",
    "https://*.netflix.com/*",
    "https://*.newsite.com/*"  // Add here
  ]
}]
```

2. **Add subtitle selectors in content.js:**
```javascript
const SUBTITLE_SELECTORS = [
  '.ytp-caption-segment',          // YouTube
  '.player-timedtext span',        // Netflix
  '.newsite-subtitle-class span'   // New site
];
```

3. Reload extension and test on new site

---

## Deployment

### Backend Options

**Railway (Free Tier)**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up

# Set environment variables in Railway dashboard
GEMINI_API_KEYS=key1,key2
PORT=3000
```

**Vercel (Serverless)**
```bash
npm i -g vercel
vercel

# Add environment variables in Vercel dashboard
```

**Update extension:**
- Change backend URL in popup to deployed URL
- Test connection

### Chrome Web Store Publication

1. Package extension: Zip `chrome-extension/` folder
2. Create developer account: [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devcenter)
3. Pay $5 registration fee (one-time)
4. Upload `.zip` file
5. Fill metadata: description, screenshots, privacy policy
6. Submit for review (1-3 days)

**Privacy Policy Requirements:**
- Extension collects: subtitle text (temporarily)
- Data sent to: your backend server, Gemini API
- No data retention
- User controls: enable/disable toggle

---

## Performance Considerations

**Latency:**
- Gemini API: ~500-2000ms response time
- Content script overhead: <10ms
- Total: ~1-2 seconds from hotkey to overlay

**Optimization:**
- Use `gemini-2.5-flash-lite` (fastest model)
- Round-robin keys to avoid rate limits
- No auto-detection (user-triggered only) saves API quota
- Deduplication prevents identical translations

**Resource Usage:**
- Backend: ~50MB RAM (Node.js + Express)
- Extension: <5MB RAM
- No background polling or timers

---

## Security Best Practices

1. **Never commit `.env` file** (contains API keys)
2. **Rotate API keys** if exposed
3. **Use HTTPS** for production backend
4. **Validate all inputs** server-side
5. **Don't log user data** (subtitles are personal)
6. **CORS whitelist** extension origins only
7. **Rate limiting** prevents abuse
8. **Output sanitization** blocks prompt injection leaks

---

## Troubleshooting Guide

### Extension Not Loading

- Check `chrome://extensions/` → Errors tab
- Verify manifest.json is valid JSON
- Ensure all referenced files exist

### Hotkey Not Working

- Check page has focus (click on video)
- Verify toggle is enabled in popup
- Try in non-fullscreen first
- Check browser console for errors

### Backend Connection Failed

- Verify backend is running: `lsof -i :3000`
- Check firewall isn't blocking localhost:3000
- Test with curl: `curl http://localhost:3000/api/health`
- Check CORS in browser console

### Gemini API Errors

- **400 Invalid Key**: Check API key format (starts with `AIza` or `AQ.`)
- **429 Quota Exceeded**: Wait 60s or add second key
- **404 Model Not Found**: Model name changed, update in translate.js

---

## Future Enhancements

- [ ] Offline mode (cache recent translations)
- [ ] Support for more video sites (Prime Video, Hulu)
- [ ] Audio pronunciation (TTS)
- [ ] Export translation history
- [ ] Multi-language support (translate to multiple at once)
- [ ] Adjustable overlay position/size
- [ ] Keyboard navigation (arrow keys to show/hide)
- [ ] Browser extension for Firefox/Safari

---

## License

MIT License - Free to use, modify, and distribute.

---

## Support

For issues or questions:
1. Check this documentation
2. Review backend logs
3. Inspect browser console
4. Test with curl to isolate frontend vs backend issues

**Common issues are documented in the Troubleshooting section above.**
