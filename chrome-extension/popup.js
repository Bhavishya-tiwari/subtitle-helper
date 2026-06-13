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

const refreshAnalytics = document.getElementById('refreshAnalytics');
const analyticsLoading = document.getElementById('analyticsLoading');
const analyticsError = document.getElementById('analyticsError');
const analyticsContent = document.getElementById('analyticsContent');

refreshAnalytics.addEventListener('click', loadAnalytics);
loadAnalytics();

async function loadAnalytics() {
  analyticsLoading.classList.remove('hidden');
  analyticsError.classList.add('hidden');
  analyticsContent.classList.add('hidden');

  try {
    const res = await fetch(`${backendUrl}/api/analytics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderAnalytics(await res.json());
  } catch (err) {
    analyticsError.textContent = err.message;
    analyticsError.classList.remove('hidden');
  } finally {
    analyticsLoading.classList.add('hidden');
  }
}

function renderAnalytics(data) {
  document.getElementById('statTotal').textContent = data.total;
  document.getElementById('statSuccess').textContent = data.success;
  document.getElementById('statFailed').textContent = data.failed;
  document.getElementById('statLatency').textContent = `${data.avgLatencyMs} ms`;

  renderList('byKeySection', 'byKeyList', Object.entries(data.byKey || {}), ([label, s]) =>
    `<div class="list-row">
      <span class="list-label font-mono">${esc(label)}</span>
      <span class="list-meta">
        <span>${s.total}</span>
        <span class="text-green-400">${s.success}✓</span>
        <span class="text-red-400">${s.failed}✗</span>
        <span class="text-indigo-300">${s.avgLatencyMs}ms</span>
      </span>
    </div>`
  );

  renderList('byLangSection', 'byLangList', Object.entries(data.byLang || {}), ([lang, count]) =>
    `<span class="chip">${esc(lang)} ${count}</span>`,
    true
  );

  renderList('byErrorSection', 'byErrorList', Object.entries(data.byError || {}), ([type, count]) =>
    `<div class="list-row">
      <span class="text-red-400 font-mono">${esc(type)}</span>
      <span class="text-gray-500">×${count}</span>
    </div>`
  );

  analyticsContent.classList.remove('hidden');
}

function renderList(sectionId, listId, items, template, isWrap) {
  const section = document.getElementById(sectionId);
  const list = document.getElementById(listId);
  if (items.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  list.className = isWrap ? 'flex flex-wrap gap-1' : 'space-y-1';
  list.innerHTML = items.map(template).join('');
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
