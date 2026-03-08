const DEFAULT_SETTINGS = {
  enableMarkAsWatchedButton: true,
  enableAutoMarkOnVideoEnd: true,
  enablePlaylistStats: true,
  enableSearchBeforeYear: false
};

let settings = { ...DEFAULT_SETTINGS };
let isMarkingVideo = false;
let playlistDebounceTimer = null;
let lastUrl = location.href;
const PLAYLIST_STATS_PANEL_ID = 'ytmaw-playlist-stats-panel';
const PLAYLIST_DEBUG_LOGS = true;
let lastPlaylistStatsKey = '';
let lastPlaylistHostMissLogAt = 0;

// Returns whether a given feature flag is enabled in active settings.
function isFeatureEnabled(key) {
  return !!settings[key];
}

// Returns true when the current URL is a YouTube playlist page.
function isPlaylistPageUrl() {
  return location.href.includes('/playlist?list=');
}

// Emits playlist-specific debug logs when debugging is enabled.
function logPlaylistDebug(message, extra = null) {
  if (!PLAYLIST_DEBUG_LOGS) return;
  if (extra !== null) {
    console.log(`[YouTube Mark As Watched][Playlist Debug] ${message}`, extra);
    return;
  }
  console.log(`[YouTube Mark As Watched][Playlist Debug] ${message}`);
}

// Loads persisted user settings from chrome.storage and merges with defaults.
function loadSettings() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve();
      return;
    }

    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load settings:', chrome.runtime.lastError);
        resolve();
        return;
      }

      settings = { ...DEFAULT_SETTINGS, ...stored };
      resolve();
    });
  });
}

// Removes the custom player button if present.
function removeMarkAsWatchedButton() {
  const button = document.getElementById('mark-watched-btn');
  if (button) button.remove();
}

// Detaches the video-ended listener from the current player instance.
function removeVideoEndListener() {
  const videoPlayer = document.querySelector('video');
  if (!videoPlayer) return;
  videoPlayer.removeEventListener('ended', handleVideoEnd);
}

// Applies current feature toggles to the page behavior.
function applyFeatureToggles() {
  const playerFeatureEnabled = isFeatureEnabled('enableMarkAsWatchedButton') || isFeatureEnabled('enableAutoMarkOnVideoEnd');

  if (playerFeatureEnabled) {
    waitForPlayer();
  } else {
    removeMarkAsWatchedButton();
    removeVideoEndListener();
  }

  if (isFeatureEnabled('enableSearchBeforeYear')) {
    setupSearchInterception();
    checkAndRedirectSearch();
  }

  if (isFeatureEnabled('enablePlaylistStats') && isPlaylistPageUrl()) {
    triggerPlaylistStats();
  }

  if (!isFeatureEnabled('enablePlaylistStats') && playlistDebounceTimer) {
    clearTimeout(playlistDebounceTimer);
    playlistDebounceTimer = null;
  }

  if (!isFeatureEnabled('enablePlaylistStats')) {
    removePlaylistStatsPanel();
  }
}

// Waits for the player DOM to be ready and applies player-related features.
function waitForPlayer() {
  const needsPlayer = isFeatureEnabled('enableMarkAsWatchedButton') || isFeatureEnabled('enableAutoMarkOnVideoEnd');
  if (!needsPlayer) return;

  const video = document.querySelector('video');
  const controls = document.querySelector('.ytp-chrome-controls') || document.querySelector('.ytp-right-controls');

  if (video) {
    if (isFeatureEnabled('enableAutoMarkOnVideoEnd')) {
      addVideoEndListener();
    } else {
      removeVideoEndListener();
    }
  }

  if (isFeatureEnabled('enableMarkAsWatchedButton')) {
    if (video && controls) {
      addMarkAsWatchedButton();
    } else {
      setTimeout(waitForPlayer, 1000);
    }
  } else {
    removeMarkAsWatchedButton();
  }
}

// Injects the "Mark as Watched" button into YouTube player controls.
function addMarkAsWatchedButton() {
  if (!isFeatureEnabled('enableMarkAsWatchedButton')) return;

  if (document.getElementById('mark-watched-btn')) {
    return;
  }

  const rightControls = document.querySelector('.ytp-right-controls') ||
    document.querySelector('.ytp-chrome-controls .ytp-right-controls') ||
    document.querySelector('[class*="ytp-right-controls"]');

  if (!rightControls) {
    return;
  }

  const button = document.createElement('button');
  button.id = 'mark-watched-btn';
  button.className = 'ytp-button mark-watched-btn';
  button.title = 'Mark as Watched';
  button.innerHTML = `
    <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <use class="ytp-svg-shadow" xlink:href="#mark-watched-path"></use>
      <defs>
        <path id="mark-watched-path" d="M18,2C9.48,2 2,9.48 2,18C2,26.52 9.48,34 18,34C26.52,34 34,26.52 34,18C34,9.48 26.52,2 18,2ZM15,26L7.5,18L9.91,15.59L15,20.67L26.59,9.08L29,11.5L15,26Z" fill="#FFFFFF"></path>
      </defs>
      <path d="M18,2C9.48,2 2,9.48 2,18C2,26.52 9.48,34 18,34C26.52,34 34,26.52 34,18C34,9.48 26.52,2 18,2ZM15,26L7.5,18L9.91,15.59L15,20.67L26.59,9.08L29,11.5L15,26Z" fill="#FFFFFF"></path>
    </svg>
  `;

  button.addEventListener('click', markVideoAsWatched);

  try {
    rightControls.insertBefore(button, rightControls.firstChild);
  } catch (error) {
    rightControls.appendChild(button);
  }
}

// Seeks to the end of the video and plays briefly so YouTube records it as watched.
function markVideoAsWatched() {
  if (isMarkingVideo) return;

  try {
    isMarkingVideo = true;
    const videoPlayer = document.querySelector('video');

    if (!videoPlayer) {
      console.error('Could not find video element');
      isMarkingVideo = false;
      return;
    }

    const videoDuration = videoPlayer.duration;

    if (!videoDuration) {
      console.error('Could not determine video duration');
      isMarkingVideo = false;
      return;
    }

    videoPlayer.currentTime = videoDuration - 0.1;
    videoPlayer.play();

    setTimeout(() => {
      videoPlayer.currentTime = videoDuration - 0.01;

      setTimeout(() => {
        videoPlayer.pause();

        const button = document.getElementById('mark-watched-btn');
        if (button) {
          button.classList.add('success');
          setTimeout(() => button.classList.remove('success'), 2000);
        }

        isMarkingVideo = false;
      }, 500);
    }, 1000);
  } catch (error) {
    console.error('Error marking video as watched:', error);
    isMarkingVideo = false;
  }
}

// Attaches a guarded ended-event listener to auto-mark completed videos.
function addVideoEndListener() {
  if (!isFeatureEnabled('enableAutoMarkOnVideoEnd')) return;

  const videoPlayer = document.querySelector('video');
  if (!videoPlayer) {
    return;
  }

  videoPlayer.removeEventListener('ended', handleVideoEnd);
  videoPlayer.addEventListener('ended', handleVideoEnd);
}

// Handles native video end events by triggering mark-as-watched flow.
function handleVideoEnd() {
  if (!isFeatureEnabled('enableAutoMarkOnVideoEnd')) return;
  if (!isMarkingVideo) {
    markVideoAsWatched();
  }
}

// Builds the dynamic before:YYYY token for the current year.
function getBeforeFilter() {
  return `before:${new Date().getFullYear() + 1}`;
}

// Prefixes search input with before:YYYY when the feature is enabled.
function maybePrefixSearchInput(searchInput) {
  if (!isFeatureEnabled('enableSearchBeforeYear')) return;
  if (!searchInput || !searchInput.value) return;

  const originalQuery = searchInput.value.trim();
  const beforeFilter = getBeforeFilter();
  if (!originalQuery || originalQuery.includes(beforeFilter)) return;

  searchInput.value = `${beforeFilter} ${originalQuery}`;
}

// Intercepts search form submit to enforce the before:YYYY prefix.
function setupSearchFormInterception(searchForm) {
  if (!searchForm || searchForm._markWatchedSearchIntercepted) return;
  searchForm._markWatchedSearchIntercepted = true;

  const originalSubmit = searchForm.submit;
  searchForm.submit = function () {
    const searchInput = searchForm.querySelector('input[name="search_query"]') ||
      searchForm.querySelector('#search') ||
      searchForm.querySelector('input[type="search"]');

    maybePrefixSearchInput(searchInput);
    originalSubmit.call(searchForm);
  };

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const searchInput = searchForm.querySelector('input[name="search_query"]') ||
      searchForm.querySelector('#search') ||
      searchForm.querySelector('input[type="search"]');

    maybePrefixSearchInput(searchInput);
    originalSubmit.call(searchForm);
  }, true);
}

// Intercepts Enter key in search input to enforce the before:YYYY prefix.
function setupSearchInputInterception(searchInput) {
  if (!searchInput || searchInput._markWatchedSearchIntercepted) return;
  searchInput._markWatchedSearchIntercepted = true;

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      maybePrefixSearchInput(searchInput);
    }
  }, true);
}

// Intercepts search button clicks to enforce the before:YYYY prefix.
function setupSearchButtonInterception(searchButton) {
  if (!searchButton || searchButton._markWatchedSearchIntercepted) return;
  searchButton._markWatchedSearchIntercepted = true;

  searchButton.addEventListener('click', () => {
    const searchForm = searchButton.closest('form') || document.querySelector('form[action="/results"]');
    const searchInput = searchForm?.querySelector('input[name="search_query"]') ||
      document.querySelector('#search') ||
      document.querySelector('input[name="search_query"]');

    maybePrefixSearchInput(searchInput);
  }, true);
}

// Finds YouTube search controls and wires all search interceptors.
function setupSearchInterception() {
  const searchForm = document.querySelector('form[action="/results"]') ||
    document.querySelector('#search-form') ||
    document.querySelector('form[action*="search"]');

  const searchInput = document.querySelector('input[name="search_query"]') ||
    document.querySelector('#search') ||
    document.querySelector('input[type="search"]');

  const searchButton = document.querySelector('#search-icon-legacy') ||
    document.querySelector('button[aria-label*="Search"]') ||
    document.querySelector('#search-button');

  if (searchForm) setupSearchFormInterception(searchForm);
  if (searchInput) setupSearchInputInterception(searchInput);
  if (searchButton) setupSearchButtonInterception(searchButton);
}

// Redirects search results URL when before:YYYY is missing.
function checkAndRedirectSearch() {
  if (!isFeatureEnabled('enableSearchBeforeYear')) return false;
  if (!location.href.includes('/results?search_query=')) return false;

  const beforeYear = new Date().getFullYear() + 1;
  const beforeFilter = `before:${beforeYear}`;
  const currentUrl = location.href;

  if (currentUrl.includes(`before%3A${beforeYear}`) || currentUrl.includes(beforeFilter)) {
    return false;
  }

  try {
    const url = new URL(currentUrl);
    const searchQuery = url.searchParams.get('search_query');
    if (searchQuery && !searchQuery.includes(beforeFilter)) {
      url.searchParams.set('search_query', `${beforeFilter} ${searchQuery}`);
      window.location.replace(url.toString());
      return true;
    }
  } catch (error) {
    console.error('Error processing search URL:', error);
  }

  return false;
}

// Computes playlist completion metrics from visible playlist items.
function calculatePlaylistStats() {
  if (!isFeatureEnabled('enablePlaylistStats')) return null;
  if (!isPlaylistPageUrl()) return null;

  const videoItems = document.querySelectorAll('ytd-playlist-video-renderer');
  if (videoItems.length === 0) return null;

  let totalVideos = 0;
  let totalDurationSec = 0;
  let watchedDurationSec = 0;

  videoItems.forEach((item) => {
    let timeText = '';
    const badgeText = item.querySelector('.yt-badge-shape__text');
    if (badgeText) {
      timeText = badgeText.textContent.trim();
    } else {
      const oldTime = item.querySelector('ytd-thumbnail-overlay-time-status-renderer span#text');
      if (oldTime) timeText = oldTime.textContent.trim();
    }

    if (!timeText) return;

    const duration = parseTime(timeText);
    if (duration === 0) return;

    totalVideos++;
    totalDurationSec += duration;

    let percentage = 0;

    const overlay = item.querySelector('ytd-thumbnail-overlay-playback-status-renderer yt-formatted-string');
    if (overlay && overlay.textContent.trim() === 'WATCHED') {
      percentage = 1;
    } else {
      const progress = item.querySelector('ytd-thumbnail-overlay-resume-playback-renderer #progress');
      if (progress && progress.style.width) {
        const widthVal = parseFloat(progress.style.width);
        if (!isNaN(widthVal)) {
          percentage = widthVal / 100;
        }
      }
    }

    watchedDurationSec += duration * percentage;
  });

  if (totalVideos === 0) return null;

  const totalWatchedPercentage = totalDurationSec > 0 ? (watchedDurationSec / totalDurationSec) * 100 : 0;
  const stats = {
    totalVideos: totalVideos,
    totalDurationSec: totalDurationSec,
    watchedDurationSec: watchedDurationSec,
    totalWatchedPercentage: totalWatchedPercentage
  };

  return stats;
}

// Parses HH:MM:SS or MM:SS into total seconds.
function parseTime(timeStr) {
  const parts = timeStr.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  return seconds;
}

// Formats seconds into a human-readable h/m/s string.
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// Debounces playlist stats calculation to avoid excessive recomputes.
function triggerPlaylistStats() {
  if (!isFeatureEnabled('enablePlaylistStats')) return;
  if (playlistDebounceTimer) clearTimeout(playlistDebounceTimer);
  logPlaylistDebug('Scheduling playlist stats refresh');
  playlistDebounceTimer = setTimeout(updatePlaylistStatsUI, 2000);
}

// Finds the best host element inside the playlist header for the custom stats panel.
function findPlaylistStatsHost() {
  const legacyHeader = document.querySelector('ytd-playlist-header-renderer');
  if (legacyHeader) {
    const legacyHost = legacyHeader.querySelector('.metadata-text-wrapper') ||
      legacyHeader.querySelector('.metadata-wrapper') ||
      legacyHeader.querySelector('.immersive-header-content');
    if (legacyHost) return legacyHost;
  }

  const modernHeader = document.querySelector('yt-page-header-renderer, yt-page-header-view-model');
  if (modernHeader) {
    const modernHost = modernHeader.querySelector('.yt-page-header-view-model__page-header-headline-info') ||
      modernHeader.querySelector('.yt-page-header-view-model__page-header-headline') ||
      modernHeader.querySelector('.yt-page-header-view-model__page-header-content') ||
      modernHeader.querySelector('.yt-page-header-view-model__scroll-container');
    if (modernHost) return modernHost;
    return modernHeader;
  }

  const fallbackHost = document.querySelector('ytd-browse #primary') || null;
  if (!fallbackHost) {
    const now = Date.now();
    if (now - lastPlaylistHostMissLogAt > 5000) {
      logPlaylistDebug('Could not find a playlist header host (legacy + modern selectors missed)');
      lastPlaylistHostMissLogAt = now;
    }
  }
  return fallbackHost;
}

// Removes the custom playlist stats panel if it exists.
function removePlaylistStatsPanel() {
  const existingPanel = document.getElementById(PLAYLIST_STATS_PANEL_ID);
  if (existingPanel) existingPanel.remove();
  lastPlaylistStatsKey = '';
}

// Produces a compact fingerprint so unchanged stats are not repeatedly logged.
function buildPlaylistStatsKey(stats) {
  return `${stats.totalVideos}|${stats.totalDurationSec}|${Math.round(stats.watchedDurationSec)}|${stats.totalWatchedPercentage.toFixed(2)}`;
}

// Renders or updates the playlist stats panel in the playlist header UI.
function renderPlaylistStatsPanel(stats) {
  const host = findPlaylistStatsHost();
  if (!host) return;

  let panel = document.getElementById(PLAYLIST_STATS_PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PLAYLIST_STATS_PANEL_ID;
    panel.className = 'ytmaw-playlist-stats';
  }
  if (panel.parentElement !== host) host.appendChild(panel);

  const completionText = `${stats.totalWatchedPercentage.toFixed(1)}%`;
  panel.innerHTML = `
    <div class="ytmaw-playlist-stats-title">Playlist Summary</div>
    <div class="ytmaw-playlist-stats-grid">
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Videos</span><span class="ytmaw-value">${stats.totalVideos}</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Completion</span><span class="ytmaw-value">${completionText}</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Watched</span><span class="ytmaw-value">${formatTime(stats.watchedDurationSec)}</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Total</span><span class="ytmaw-value">${formatTime(stats.totalDurationSec)}</span></div>
    </div>
  `;
}

// Calculates playlist stats and syncs the visible playlist panel.
function updatePlaylistStatsUI() {
  if (!isFeatureEnabled('enablePlaylistStats')) {
    removePlaylistStatsPanel();
    return;
  }

  if (!isPlaylistPageUrl()) {
    removePlaylistStatsPanel();
    return;
  }

  const stats = calculatePlaylistStats();
  if (!stats) {
    logPlaylistDebug('No playlist stats available yet (playlist items may still be loading)');
    return;
  }

  const statsKey = buildPlaylistStatsKey(stats);
  if (statsKey !== lastPlaylistStatsKey) {
    lastPlaylistStatsKey = statsKey;
    console.log(`[YouTube Mark As Watched] Playlist Stats:\n    - Videos: ${stats.totalVideos}\n    - Total Duration: ${formatTime(stats.totalDurationSec)}\n    - Watched Duration: ${formatTime(stats.watchedDurationSec)}\n    - Playlist Completion: ${stats.totalWatchedPercentage.toFixed(1)}%`);
  } else {
    logPlaylistDebug('Stats unchanged, skipping duplicate console summary');
  }

  renderPlaylistStatsPanel(stats);
}

// Checks whether the latest DOM mutations are relevant to playlist stats updates.
function hasRelevantPlaylistMutation(mutations) {
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const element = node;
      if (element.matches?.('ytd-playlist-video-renderer, ytd-playlist-header-renderer, yt-page-header-renderer, yt-page-header-view-model')) {
        return true;
      }
      if (element.querySelector?.('ytd-playlist-video-renderer, ytd-playlist-header-renderer, yt-page-header-renderer, yt-page-header-view-model')) {
        return true;
      }
    }
  }
  return false;
}

// Watches YouTube DOM mutations to keep injected UI/features in sync.
const observer = new MutationObserver((mutations) => {
  const currentUrl = location.href;

  if (isFeatureEnabled('enablePlaylistStats') && isPlaylistPageUrl() && hasRelevantPlaylistMutation(mutations)) {
    logPlaylistDebug('Relevant playlist mutation detected, refreshing stats');
    triggerPlaylistStats();
  }

  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;

    removeMarkAsWatchedButton();

    setTimeout(waitForPlayer, 2000);

    if (isFeatureEnabled('enableSearchBeforeYear')) {
      setupSearchInterception();
      checkAndRedirectSearch();
    }

    if (!isPlaylistPageUrl()) {
      removePlaylistStatsPanel();
    } else if (isFeatureEnabled('enablePlaylistStats')) {
      triggerPlaylistStats();
    }
  }

  if (isFeatureEnabled('enableMarkAsWatchedButton') && !document.getElementById('mark-watched-btn')) {
    const controls = document.querySelector('.ytp-chrome-controls .ytp-right-controls');
    if (controls && document.querySelector('video')) {
      setTimeout(() => {
        addMarkAsWatchedButton();
        addVideoEndListener();
      }, 500);
    }
  }

  if (isFeatureEnabled('enableAutoMarkOnVideoEnd') && document.querySelector('video')) {
    addVideoEndListener();
  }
});

observer.observe(document, {
  subtree: true,
  childList: true,
  attributes: false
});

// Handles YouTube SPA navigation events to re-apply features on route change.
document.addEventListener('yt-navigate-finish', () => {
  setTimeout(waitForPlayer, 1000);

  if (isFeatureEnabled('enableSearchBeforeYear')) {
    setupSearchInterception();
    checkAndRedirectSearch();
  }

  if (isFeatureEnabled('enablePlaylistStats') && isPlaylistPageUrl()) {
    logPlaylistDebug('yt-navigate-finish on playlist page, refreshing stats');
    triggerPlaylistStats();
  }
});

// Applies live setting changes pushed from the options page.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;

  let needsApply = false;
  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    if (changes[key]) {
      settings[key] = changes[key].newValue;
      needsApply = true;
    }
  });

  if (needsApply) {
    applyFeatureToggles();
  }
});

// Initializes content features after loading persisted settings.
(async function init() {
  await loadSettings();
  applyFeatureToggles();
})();
