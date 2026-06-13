# Debugging: Extension Stops After Idle Time

When the extension stops working after watching without using it, follow this checklist to identify the issue:

---

## Quick Test Sequence (Do these in order)

### 1. Test Backend First (15 seconds)

Open a terminal and run:
```bash
curl http://localhost:3000/api/health
```

**Expected:** `{"status":"ok","hasApiKey":true}`

**If it fails:**
- ❌ Backend crashed/stopped
- **Fix:** Restart backend with `npm start`
- **Root cause:** Backend idle timeout (unlikely with Node.js, but possible)

**If it succeeds:**
- ✅ Backend is alive
- Move to step 2

---

### 2. Test Extension Service Worker (30 seconds)

1. Open `chrome://extensions/`
2. Find "Subtitle Translator"
3. Look for **"Service worker"** link
   - If it says **"inactive"** → Service worker is asleep
   - Click the link to open DevTools
4. In the console, type:
```javascript
console.log('Service worker alive');
```

**If console responds:**
- ✅ Service worker is active
- Move to step 3

**If no "Service worker" link OR it's "inactive":**
- ❌ Service worker suspended by Chrome
- **How to wake it:** Press `⌘+'` on video page (it auto-wakes)
- **Root cause:** Chrome suspends service workers after 30 seconds of inactivity

---

### 3. Test Content Script (30 seconds)

On the video page (YouTube/Netflix):

1. Press `F12` to open DevTools
2. Go to **Console** tab
3. Type:
```javascript
document.getElementById('subtitle-translator-overlay')
```

**If it returns an element:**
- ✅ Content script loaded
- Type this to manually trigger translation:
```javascript
document.dispatchEvent(new KeyboardEvent('keydown', {
  key: "'",
  code: 'Quote',
  metaKey: true,
  bubbles: true
}));
```

**If it returns `null`:**
- ❌ Content script not loaded
- **Fix:** Hard refresh the page: `Cmd+Shift+R`
- **Root cause:** Page loaded before extension, or script crashed

---

### 4. Test Full Path (1 minute)

On video page with subtitles visible:

1. Open DevTools (`F12`) → **Network** tab
2. Filter by "translate"
3. Press `⌘+'` on keyboard
4. Watch for:
   - Network request to `localhost:3000/api/translate`
   - Response status code (200 = success)

**Scenarios:**

| What you see | Diagnosis | Fix |
|--------------|-----------|-----|
| No network request at all | Content script or background.js dead | Reload extension + refresh page |
| Request but no response | Backend frozen | Check backend terminal for errors |
| Request → 429 error | Rate limit hit | Wait 60s or check quota |
| Request → 500 error | Gemini API issue | Check backend logs |
| Response 200 but no overlay | Content script crash | Check console for errors |

---

## Most Likely Culprits

### Chrome Service Worker Suspension (80% probability)

**Symptoms:**
- Works fine initially
- Stops after 5-30 minutes of idle
- Pressing hotkey does nothing
- No network request in DevTools

**Why it happens:**
Chrome suspends service workers to save resources. Your `background.js` goes to sleep.

**Current behavior:**
When you press `⌘+'`:
1. Content script sends message to background.js
2. If background.js is asleep, Chrome wakes it (adds 100-500ms delay)
3. Background makes API call
4. Should work, but might feel laggy

**Verification:**
Check `chrome://extensions/` → Service worker link. If "inactive", it's asleep.

**Solution (if it doesn't auto-wake):**
Add a keepalive ping. I'll show you the code below.

---

### Content Script Unloaded (15% probability)

**Symptoms:**
- Hotkey doesn't trigger anything
- No console logs when pressing `⌘+'`
- Extension works on other tabs

**Why it happens:**
- Single Page Apps (YouTube, Netflix) can remove scripts during navigation
- Memory pressure causes Chrome to unload tabs

**Verification:**
Console → type: `document.getElementById('subtitle-translator-overlay')`
If `null`, script is gone.

**Solution:**
Hard refresh: `Cmd+Shift+R`

---

### Backend Crashed (5% probability)

**Symptoms:**
- Network request in DevTools shows "Failed" or "net::ERR_CONNECTION_REFUSED"
- `curl localhost:3000/api/health` fails

**Why it happens:**
- Uncaught exception in backend
- Out of memory
- Port 3000 taken by another process

**Verification:**
Check backend terminal. If no `Subtitle Translator backend running` message, it's dead.

**Solution:**
Restart: `npm start`

---

## Prevention: Keep Service Worker Alive

If you confirm service worker suspension is the issue, add this to keep it alive:

### Option 1: Periodic Alarm (Recommended)

Update `background.js`:

```javascript
// Add at the top of background.js
chrome.alarms.create('keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    console.log('Service worker keepalive ping');
  }
});
```

And in `manifest.json`, add permission:
```json
"permissions": [
  "activeTab",
  "storage",
  "alarms"  // Add this
]
```

This wakes the service worker every 60 seconds.

### Option 2: Long-lived Connection

Keep a port open (less elegant, more aggressive):

```javascript
// In background.js
let keepAlivePort;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    keepAlivePort = port;
  }
});
```

---

## Logging for Next Time

Add debug logs to identify the failure point:

### In content.js (line 48):
```javascript
function onHotkey(e) {
  console.log('[Content] Hotkey pressed');
  if (!enabled) {
    console.log('[Content] Extension disabled');
    return;
  }
  // ... rest of function
```

### In background.js (line 4):
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.action);
  if (message.action === 'translate') {
    console.log('[Background] Starting translation');
    handleTranslate(message.text, sender.tab?.id);
  }
  return true;
});
```

### In backend translate.js (line 46):
```javascript
router.post('/', async (req, res) => {
  console.log('[Backend] Translation request received');
  try {
    // ... existing code
```

With these logs, next time it fails:
1. Press `⌘+'`
2. Check console on video page → should see `[Content] Hotkey pressed`
3. Check service worker console → should see `[Background] Received message`
4. Check backend terminal → should see `[Backend] Translation request received`

The missing log tells you where it broke.

---

## Chrome's Service Worker Lifecycle

Understanding when Chrome suspends workers:

| Time | Event |
|------|-------|
| 0s | User presses `⌘+'` → wakes service worker |
| 0.1s | Service worker processes message |
| 30s | Chrome marks worker as "idle" |
| 30s-5min | Worker stays in memory but marked inactive |
| 5min+ | Chrome may terminate worker (memory pressure) |
| Next event | Chrome restarts worker (100-500ms startup time) |

**Your symptom** (stops after idle) suggests:
- Worker is being terminated after 5+ min
- OR not auto-waking properly
- OR losing event listeners after restart

---

## Action Plan When It Happens Next Time

1. **Immediate:** Open `chrome://extensions/` → check if service worker is "inactive"
2. **If inactive:** Click service worker link → check console for errors
3. **On video page:** Press `F12` → Console → check for `[Content] Hotkey pressed`
4. **Test backend:** `curl http://localhost:3000/api/health`
5. **Report findings:** Which log messages appeared? Which didn't?

With this info, I can add the exact fix (keepalive, reconnect logic, etc.).

---

## Quick Reference: Where to Look

| Issue | Where to check | What to look for |
|-------|----------------|------------------|
| Backend dead | Terminal | "Subtitle Translator backend running" message gone |
| Service worker asleep | `chrome://extensions/` | "inactive" next to service worker |
| Content script crashed | Video page console | Errors in red |
| Network blocked | DevTools → Network tab | Failed requests or CORS errors |
| API quota hit | Backend logs | 429 errors |
| Extension disabled | `chrome://extensions/` | Toggle is off |

---

## Automated Test Script

Save this as `test-extension.sh` and run when it breaks:

```bash
#!/bin/bash

echo "=== Testing Extension Health ==="

# Test backend
echo -n "Backend health: "
curl -s http://localhost:3000/api/health | grep -q "ok" && echo "✓ OK" || echo "✗ FAILED"

# Test translation endpoint
echo -n "Translation API: "
RESPONSE=$(curl -s -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"test","targetLang":"hi"}' | grep -o "translation")
[ -n "$RESPONSE" ] && echo "✓ OK" || echo "✗ FAILED"

# Check if backend process is running
echo -n "Backend process: "
lsof -i :3000 | grep -q "node" && echo "✓ Running" || echo "✗ Not running"

echo ""
echo "Next: Check chrome://extensions/ for service worker status"
echo "Then: Check video page console for content script errors"
```

Make executable: `chmod +x test-extension.sh`
Run when broken: `./test-extension.sh`

---

## Most Likely Fix (Prediction)

Based on Chrome's behavior, I predict this is **service worker suspension** not auto-waking properly.

**Quick fix to test:**
Add the alarm keepalive to `background.js` and `manifest.json` as shown above in "Prevention" section.

If that doesn't work, the logs will tell us the exact failure point.
