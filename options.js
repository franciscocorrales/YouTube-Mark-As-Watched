const DEFAULT_SETTINGS = {
  enableMarkAsWatchedButton: true,
  enableAutoMarkOnVideoEnd: true,
  enablePlaylistStats: true,
  enableSearchBeforeYear: false
};

const settingKeys = Object.keys(DEFAULT_SETTINGS);
const statusEl = document.getElementById('status');

function setStatus(message) {
  statusEl.textContent = message;
  clearTimeout(setStatus._timer);
  setStatus._timer = setTimeout(() => {
    statusEl.textContent = '';
  }, 1800);
}

function readFormState() {
  const values = {};
  settingKeys.forEach((key) => {
    const el = document.getElementById(key);
    values[key] = !!el?.checked;
  });
  return values;
}

function applyFormState(values) {
  settingKeys.forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.checked = !!values[key];
  });
}

function saveSettings(values) {
  chrome.storage.sync.set(values, () => {
    if (chrome.runtime.lastError) {
      setStatus(`Error: ${chrome.runtime.lastError.message}`);
      return;
    }
    setStatus('Saved');
  });
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    if (chrome.runtime.lastError) {
      setStatus(`Error: ${chrome.runtime.lastError.message}`);
      return;
    }
    applyFormState({ ...DEFAULT_SETTINGS, ...stored });
  });
}

settingKeys.forEach((key) => {
  const el = document.getElementById(key);
  if (!el) return;

  el.addEventListener('change', () => {
    saveSettings(readFormState());
  });
});

document.getElementById('resetDefaults').addEventListener('click', () => {
  applyFormState(DEFAULT_SETTINGS);
  saveSettings(DEFAULT_SETTINGS);
});

loadSettings();
