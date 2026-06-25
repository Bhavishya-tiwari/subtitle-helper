(() => {
  let enabled = true;
  let overlayElement = null;
  let isTranslating = false;
  let activeRequestId = 0;

  const SUBTITLE_SELECTORS = [
    // YouTube
    '.ytp-caption-segment',
    // Netflix
    '.player-timedtext-text-container span',
    '[data-uia="player-timedtext"] span',
    // Amazon Prime Video
    '.atvwebplayersdk-captions-text',
    '.timedtext',
    '[class*="timedtext"] span',
    '[class*="caption"] [class*="text"]',
    // Sony LIV
    '.text-track-cue',
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
        hideOverlay();
        showToast('Translation failed. Check backend is running.');
      }
    });
  }

  function onHotkey(e) {
    if (e.key !== "'" && e.code !== 'Quote') return;
    
    if (!enabled) return;
    if (isEditableElement(document.activeElement)) return;

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

  function isExtensionElement(el) {
    if (!el) return false;
    
    // Check if element itself is extension UI
    if (el.id === 'subtitle-translator-overlay') return true;
    if (el.hasAttribute && el.hasAttribute('data-subtitle-helper')) return true;
    if (el.className && typeof el.className === 'string' && el.className.includes('st-')) return true;
    
    // Check if any ancestor is extension UI
    let parent = el.parentElement;
    while (parent) {
      if (parent.id === 'subtitle-translator-overlay') return true;
      if (parent.hasAttribute && parent.hasAttribute('data-subtitle-helper')) return true;
      if (parent.className && typeof parent.className === 'string' && parent.className.includes('st-')) return true;
      parent = parent.parentElement;
    }
    
    return false;
  }

  function getCurrentSubtitle() {
    const isYouTube = location.hostname.includes('youtube.com');
    const isNetflix = location.hostname.includes('netflix.com');
    const isHotstar = location.hostname.includes('hotstar.com');
    const isPrimeVideo = location.hostname.includes('primevideo.com');
    const isSonyLiv = location.hostname.includes('sonyliv.com');

    if (isHotstar) {
      return findHotstarSubtitle();
    }

    if (isNetflix) {
      return findNetflixSubtitle();
    }

    if (isSonyLiv) {
      return findSonyLivSubtitle();
    }

    const selectors = isYouTube
      ? ['.ytp-caption-segment']
      : isPrimeVideo
          ? ['.atvwebplayersdk-captions-text', '.timedtext', '[class*="timedtext"] span', '[class*="caption"] [class*="text"]']
          : SUBTITLE_SELECTORS;

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) continue;

      const texts = Array.from(elements)
        .filter(el => !isExtensionElement(el))
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0);

      const unique = [...new Set(texts)];
      const subtitleText = unique.join(' ');

      if (subtitleText.length > 2) {
        return subtitleText;
      }
    }
    return null;
  }

  function findNetflixSubtitle() {
    // Try to find the main subtitle container first
    const container = document.querySelector('.player-timedtext-text-container, [data-uia="player-timedtext"]');
    if (!container) return null;

    // Get text from the container directly to avoid duplicates
    const text = container.textContent?.trim();
    if (text && text.length > 2) {
      return text;
    }

    return null;
  }

  function findHotstarSubtitle() {
    const allElements = document.querySelectorAll('div, span, p');
    const windowHeight = window.innerHeight;
    const candidates = [];

    Array.from(allElements).forEach(el => {
      // Skip extension UI elements
      if (isExtensionElement(el)) return;
      
      const text = el.textContent?.trim();
      if (!text || text.length < 3 || text.length > 500) return;
      if (el.children.length > 0) return;
      
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      
      const inSubtitleArea = rect.top > windowHeight * 0.6 && rect.bottom < windowHeight;
      
      if (inSubtitleArea) {
        const style = window.getComputedStyle(el);
        const fontSize = parseInt(style.fontSize);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        
        if (isVisible && fontSize > 12) {
          candidates.push({
            text: text,
            fontSize: fontSize
          });
        }
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.fontSize - a.fontSize || b.text.length - a.text.length);
      return candidates[0].text;
    }

    return null;
  }

  function findSonyLivSubtitle() {
    // Sony LIV uses text-track-cue for subtitles
    const textTrackCue = document.querySelector('.text-track-cue');
    if (textTrackCue) {
      const text = textTrackCue.textContent?.trim();
      if (text && text.length > 2) {
        return text;
      }
    }

    // Fallback: Try Bitmovin player selectors
    const specificSelectors = [
      '.bitmovinplayer-subtitle-text',
      '[class*="subtitle-text"]',
      '.bmpui-ui-subtitle-label'
    ];

    for (const selector of specificSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const texts = Array.from(elements)
          .filter(el => !isExtensionElement(el))
          .map(el => el.textContent.trim())
          .filter(t => t.length > 0);
        
        const unique = [...new Set(texts)];
        const subtitleText = unique.join(' ');
        
        if (subtitleText.length > 2) {
          return subtitleText;
        }
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
    const requestId = activeRequestId;
    showLoadingOverlay(subtitleText);

    const timeoutId = setTimeout(() => {
      if (isTranslating && requestId === activeRequestId) {
        isTranslating = false;
        showToast('Translation timed out. Reload the extension and try again.');
      }
    }, 20000);

    chrome.runtime.sendMessage(
      {
        action: 'translate',
        text: subtitleText,
        requestId
      },
      () => {
        if (chrome.runtime.lastError) {
          clearTimeout(timeoutId);
          isTranslating = false;
          showToast('Extension error. Reload extension and refresh this tab.');
          console.error(chrome.runtime.lastError.message);
        }
      }
    );
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
    overlayElement.setAttribute('data-subtitle-helper', 'true');
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
    toast.setAttribute('data-subtitle-helper', 'true');
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
