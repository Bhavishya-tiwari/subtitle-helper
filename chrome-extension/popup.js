const DEFAULT_BACKEND_URL = 'http://localhost:3000';

const toggleEnabled = document.getElementById('toggleEnabled');
const targetLang = document.getElementById('targetLang');
const testConnection = document.getElementById('testConnection');
const connectionResult = document.getElementById('connectionResult');

let backendUrl = DEFAULT_BACKEND_URL;

chrome.storage.local.get(['enabled', 'targetLang', 'backendUrl'], (result) => {
  toggleEnabled.checked = result.enabled !== false;
  targetLang.value = result.targetLang || 'hi';
  backendUrl = result.backendUrl || DEFAULT_BACKEND_URL;
});

toggleEnabled.addEventListener('change', () => {
  const enabled = toggleEnabled.checked;
  chrome.storage.local.set({ enabled });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleEnabled', enabled });
    }
  });
});

targetLang.addEventListener('change', () => {
  chrome.storage.local.set({ targetLang: targetLang.value });
});

testConnection.addEventListener('click', async () => {
  connectionResult.classList.remove('hidden', 'text-green-400', 'text-red-400');

  try {
    const response = await fetch(`${backendUrl}/api/health`);
    if (response.ok) {
      connectionResult.textContent = 'Connected';
      connectionResult.classList.add('text-green-400');
    } else {
      connectionResult.textContent = `Error ${response.status}`;
      connectionResult.classList.add('text-red-400');
    }
  } catch {
    connectionResult.textContent = 'Cannot reach server';
    connectionResult.classList.add('text-red-400');
  }
});
