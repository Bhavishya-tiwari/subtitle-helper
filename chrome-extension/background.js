import {
  BACKEND_URLS,
  DEFAULT_TARGET_LANG,
  FETCH_TIMEOUT_MS,
  MAX_TEXT_LENGTH
} from './config.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'translate') {
    return false;
  }

  handleTranslate(message.text, sender.tab?.id, message.requestId)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err.message || 'Translation failed' }));

  return true;
});

async function handleTranslate(text, tabId, requestId) {
  if (!text || typeof text !== 'string') {
    return fail(tabId, requestId, 'Missing subtitle text');
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  const config = await chrome.storage.local.get(['targetLang', 'enabled']);
  if (config.enabled === false) {
    return fail(tabId, requestId, 'Translation is disabled');
  }

  const originalText = sanitizeText(text);
  if (!originalText) {
    return fail(tabId, requestId, 'Subtitle text was empty');
  }

  const targetLang = config.targetLang || DEFAULT_TARGET_LANG;
  let lastError = 'Cannot reach backend';

  for (const backendUrl of BACKEND_URLS) {
    try {
      const data = await postTranslate(backendUrl, originalText, targetLang);
      if (!data.translation) {
        lastError = 'Backend returned no translation';
        continue;
      }

      const result = {
        ok: true,
        data: {
          original: originalText,
          translation: data.translation,
          meaning: data.meaning || ''
        }
      };
      notifyTab(tabId, { action: 'translationResult', requestId, data: result.data });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error('Translation request failed:', lastError);
    }
  }

  return fail(tabId, requestId, lastError);
}

async function postTranslate(backendUrl, text, targetLang) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Backend ${response.status}`);
    }

    return response.json();
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Backend timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function fail(tabId, requestId, error) {
  notifyTab(tabId, { action: 'translationError', requestId, error });
  return { ok: false, error };
}

function notifyTab(tabId, payload) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, payload, () => {
    void chrome.runtime.lastError;
  });
}

function sanitizeText(text) {
  return text
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['enabled', 'targetLang']);
  chrome.storage.local.set({
    enabled: stored.enabled !== false,
    targetLang: stored.targetLang || DEFAULT_TARGET_LANG
  });
});
