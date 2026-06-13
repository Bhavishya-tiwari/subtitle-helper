const DEFAULT_BACKEND_URL = 'http://localhost:3000';
const MAX_TEXT_LENGTH = 500;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translate') {
    handleTranslate(message.text, sender.tab?.id, message.requestId);
  }
  return true;
});

async function handleTranslate(text, tabId, requestId) {
  if (!text || typeof text !== 'string') return;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
  }

  const config = await chrome.storage.local.get(['backendUrl', 'targetLang', 'enabled']);

  if (config.enabled === false) return;

  const backendUrl = config.backendUrl || DEFAULT_BACKEND_URL;
  const targetLang = config.targetLang || 'hi';
  const originalText = sanitizeText(text);

  try {
    const response = await fetch(`${backendUrl}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: originalText,
        targetLang: targetLang
      })
    });

    if (!response.ok) {
      console.error('Translation API error:', response.status);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { action: 'translationError', requestId });
      }
      return;
    }

    const data = await response.json();

    if (tabId && data.translation) {
      chrome.tabs.sendMessage(tabId, {
        action: 'translationResult',
        requestId,
        data: {
          original: originalText,
          translation: data.translation,
          meaning: data.meaning || ''
        }
      });
    }
  } catch (err) {
    console.error('Translation request failed:', err.message);
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: 'translationError', requestId });
    }
  }
}

function sanitizeText(text) {
  return text
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    targetLang: 'hi',
    backendUrl: DEFAULT_BACKEND_URL
  });
});
