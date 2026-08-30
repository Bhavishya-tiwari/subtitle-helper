import {
  BACKEND_URLS,
  DEFAULT_TARGET_LANG,
  FETCH_TIMEOUT_MS,
  MAX_TEXT_LENGTH,
  SUPABASE_ANON_KEY,
  SUPABASE_URL
} from './config.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authSession' && message.session) {
    chrome.storage.local.set({ session: message.session });
    sendResponse({ ok: true });
    return false;
  }

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

  const config = await chrome.storage.local.get(['targetLang', 'enabled', 'session']);
  if (config.enabled === false) {
    return fail(tabId, requestId, 'Translation is disabled');
  }

  const originalText = sanitizeText(text);
  if (!originalText) {
    return fail(tabId, requestId, 'Subtitle text was empty');
  }

  const accessToken = await getAccessToken(config.session);
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !accessToken) {
    return fail(tabId, requestId, 'Sign in from the extension popup');
  }

  const targetLang = config.targetLang || DEFAULT_TARGET_LANG;
  let lastError = 'Cannot reach backend';

  for (const backendUrl of BACKEND_URLS) {
    try {
      const data = await postTranslate(backendUrl, originalText, targetLang, accessToken);
      if (data.error === 'Sign in required') {
        return fail(tabId, requestId, 'Sign in from the extension popup');
      }
      if (data.error === 'Daily translation limit reached') {
        return fail(tabId, requestId, data.error);
      }
      if (!data.translation) {
        lastError = data.error || 'Backend returned no translation';
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
      if (lastError.includes('401')) {
        return fail(tabId, requestId, 'Sign in from the extension popup');
      }
      console.error('Translation request failed:', lastError);
    }
  }

  return fail(tabId, requestId, lastError);
}

async function getAccessToken(session) {
  if (!session?.access_token) return null;

  const expiresAtMs = (session.expires_at || 0) * 1000;
  if (expiresAtMs && Date.now() < expiresAtMs - 60_000) {
    return session.access_token;
  }

  if (!session.refresh_token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return session.access_token;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!response.ok) {
      await chrome.storage.local.remove('session');
      return null;
    }

    const data = await response.json();
    const nextSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || session.refresh_token,
      expires_at: data.expires_at,
      user: session.user
    };
    await chrome.storage.local.set({ session: nextSession });
    return nextSession.access_token;
  } catch {
    return session.access_token;
  }
}

async function postTranslate(backendUrl, text, targetLang, accessToken) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${backendUrl}/api/translate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, targetLang }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('401');
    }
    if (response.status === 429) {
      return {
        error: data.error || 'Daily translation limit reached',
        used: data.used,
        limit: data.limit,
        remaining: data.remaining
      };
    }
    if (!response.ok) {
      throw new Error(data.error || `Backend ${response.status}`);
    }

    return data;
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
