(() => {
  let enabled = true;
  let overlayElement = null;
  let isTranslating = false;
  let activeRequestId = 0;

  const SUBTITLE_SELECTORS = [
    // YouTube - most specific first
    '.ytp-caption-segment',
    // Netflix
    '.player-timedtext-text-container span',
    '[data-uia="player-timedtext"] span',
    // Generic fallbacks
    '[class*="caption"] span',
    '[class*="subtitle"] span'
  ];

  function init() {
    chrome.storage.local.get(['enabled'], (result) => {
      enabled = result.enabled !== false;
    });

    document.addEventListener('keydown', onHotkey, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'toggleEnabled') {
        enabled = message.enabled;
      }

      if (message.action === 'translateNow') {
        triggerTranslation();
      }

      if (message.action === 'translationResult') {
        if (message.requestId !== activeRequestId) return;
        isTranslating = false;
        showOverlay(message.data);
      }

      if (message.action === 'translationError') {
        if (message.requestId !== activeRequestId) return;
        isTranslating = false;
        showToast('Translation failed. Is the backend running?');
      }
    });
  }

  function onHotkey(e) {
    if (!enabled) return;
    if (isEditableElement(document.activeElement)) return;
    if (e.key !== "'" && e.code !== 'Quote') return;

    e.preventDefault();
    e.stopPropagation();

    if (isOverlayVisible()) {
      hideOverlay();
      return;
    }

    triggerTranslation();
  }

  function isEditableElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  function getCurrentSubtitle() {
    for (const selector of SUBTITLE_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) continue;

      const texts = Array.from(elements)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0);

      // Deduplicate while preserving order
      const unique = [...new Set(texts)];
      const subtitleText = unique.join(' ');

      if (subtitleText.length > 2) {
        return subtitleText;
      }
    }
    return null;
  }

  function triggerTranslation() {
    if (isTranslating) return;

    const subtitleText = getCurrentSubtitle();
    if (!subtitleText) {
      showToast('No subtitle found on screen');
      return;
    }

    isTranslating = true;
    activeRequestId += 1;
    showLoadingOverlay(subtitleText);

    chrome.runtime.sendMessage({
      action: 'translate',
      text: subtitleText,
      requestId: activeRequestId
    });
  }

  function getOverlayContainer() {
    // In fullscreen, append to the fullscreen element
    const fsElement = document.fullscreenElement || 
                      document.webkitFullscreenElement ||
                      document.mozFullScreenElement;
    return fsElement || document.body;
  }

  function onFullscreenChange() {
    // Re-attach overlay to correct container when fullscreen changes
    if (overlayElement && overlayElement.parentNode) {
      const container = getOverlayContainer();
      if (overlayElement.parentNode !== container) {
        container.appendChild(overlayElement);
      }
    }
  }

  function createOverlay() {
    const container = getOverlayContainer();
    
    if (overlayElement) {
      // Move to correct container if needed
      if (overlayElement.parentNode !== container) {
        container.appendChild(overlayElement);
      }
      return overlayElement;
    }

    overlayElement = document.createElement('div');
    overlayElement.id = 'subtitle-translator-overlay';
    container.appendChild(overlayElement);
    return overlayElement;
  }

  function showLoadingOverlay(originalText) {
    const overlay = createOverlay();
    overlay.innerHTML = `
      <div class="st-overlay-content">
        <div class="st-original">${escapeHtml(originalText)}</div>
        <div class="st-loading">Translating...</div>
      </div>
    `;
    overlay.style.display = 'flex';
  }

  function showOverlay(data) {
    const overlay = createOverlay();

    overlay.innerHTML = `
      <div class="st-overlay-content">
        ${data.original ? `<div class="st-original">${escapeHtml(data.original)}</div>` : ''}
        <div class="st-translation">${escapeHtml(data.translation)}</div>
        ${data.meaning ? `<div class="st-meaning"><span class="st-label">Words:</span> ${escapeHtml(data.meaning)}</div>` : ''}
      </div>
      <button class="st-close-btn">&times;</button>
    `;

    overlay.style.display = 'flex';

    overlay.querySelector('.st-close-btn').addEventListener('click', hideOverlay);
  }

  function showToast(message) {
    const container = getOverlayContainer();
    const toast = document.createElement('div');
    toast.className = 'st-toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
  }

  function hideOverlay() {
    activeRequestId += 1;
    isTranslating = false;
    if (overlayElement) {
      overlayElement.style.display = 'none';
    }
  }

  function isOverlayVisible() {
    return overlayElement && overlayElement.style.display !== 'none';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  init();
})();
