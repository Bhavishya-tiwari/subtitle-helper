import { AUTH_LOGIN_URL, BACKEND_URL, DEFAULT_TARGET_LANG } from './config.js';

const toggleEnabled = document.getElementById('toggleEnabled');
const targetLang = document.getElementById('targetLang');
const testConnection = document.getElementById('testConnection');
const connectionResult = document.getElementById('connectionResult');
const signedOut = document.getElementById('signedOut');
const signedIn = document.getElementById('signedIn');
const userEmail = document.getElementById('userEmail');
const signIn = document.getElementById('signIn');
const signOut = document.getElementById('signOut');
const authError = document.getElementById('authError');

function renderSession(session) {
  const email = session?.user?.email;
  signedIn.classList.toggle('hidden', !email);
  signedOut.classList.toggle('hidden', Boolean(email));
  userEmail.textContent = email || '';
}

chrome.storage.local.get(['enabled', 'targetLang', 'session'], (result) => {
  toggleEnabled.checked = result.enabled !== false;
  targetLang.value = result.targetLang || DEFAULT_TARGET_LANG;
  renderSession(result.session);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.session) {
    renderSession(changes.session.newValue);
    authError.classList.add('hidden');
  }
});

signIn.addEventListener('click', () => {
  authError.classList.add('hidden');
  chrome.tabs.create({ url: AUTH_LOGIN_URL });
});

signOut.addEventListener('click', () => {
  chrome.storage.local.remove('session');
  renderSession(null);
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
    const response = await fetch(`${BACKEND_URL}/api/health`);
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
