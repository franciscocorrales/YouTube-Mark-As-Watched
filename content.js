const DEFAULT_SETTINGS = {
  enableMarkAsWatchedButton: true,
  enableAutoMarkOnVideoEnd: true,
  enablePlaylistStats: true,
  enableSearchBeforeYear: false,
  enableHideShorts: true,
  enableHideMembers: false,
  enableHideWatched: false,
  enableCleanWatchLater: true
};

let settings = { ...DEFAULT_SETTINGS };
let isMarkingVideo = false;
let playlistDebounceTimer = null;
let lastUrl = location.href;
const PLAYLIST_STATS_PANEL_ID = 'ytmaw-playlist-stats-panel';
const HISTORY_CONTROLS_ID = 'ytmaw-history-controls';
const PLAYLIST_DEBUG_LOGS = false;
let lastPlaylistStatsKey = '';
let lastPlaylistHostMissLogAt = 0;

// State for filter features
let hiddenVideos = [];
let hiddenShortsCount = 0;
let hiddenMembersCount = 0;
let isHidingWatched = false;
let dynamicHideObserver = null;
let contentWatcherInterval = null;
let filtersInitialized = false;

// Returns whether a given feature flag is enabled in active settings.
function isFeatureEnabled(key) {
  return !!settings[key];
}

// Returns true when the current URL is a YouTube playlist page.
function isPlaylistPageUrl() {
  return location.href.includes('/playlist?list=');
}

// Returns true when the current URL is the Watch Later playlist page.
function isWatchLaterPage() {
  return location.href.includes('playlist?list=WL') || location.href.includes('watch_later');
}

// Returns true when the current URL is the History page.
function isHistoryPage() {
  return location.href.includes('/feed/history');
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
  let fullyWatchedVideos = 0;

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

    const progress = item.querySelector('ytd-thumbnail-overlay-resume-playback-renderer #progress');
    if (progress && progress.style.width) {
      const widthVal = parseFloat(progress.style.width);
      if (!isNaN(widthVal)) {
        percentage = widthVal / 100;
      }
    } else {
      const overlay = item.querySelector('ytd-thumbnail-overlay-playback-status-renderer yt-formatted-string');
      if (overlay && overlay.textContent.trim() === 'WATCHED') {
        percentage = 1;
      }
    }

    watchedDurationSec += duration * percentage;
    if (percentage === 1) fullyWatchedVideos++;
  });

  if (totalVideos === 0) return null;

  const totalWatchedPercentage = totalDurationSec > 0 ? (watchedDurationSec / totalDurationSec) * 100 : 0;
  const stats = {
    totalVideos: totalVideos,
    fullyWatchedVideos: fullyWatchedVideos,
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

// Returns the element before which the stats panel should be inserted.
// Anchoring off the video list guarantees we land in a visible container.
function findPlaylistStatsAnchor() {
  const videoList = document.querySelector('ytd-playlist-video-list-renderer');
  if (videoList) return videoList;

  // Legacy layout fallback
  const legacyHeader = document.querySelector('ytd-playlist-header-renderer');
  if (legacyHeader) return legacyHeader;

  const now = Date.now();
  if (now - lastPlaylistHostMissLogAt > 5000) {
    logPlaylistDebug('Could not find playlist stats anchor');
    lastPlaylistHostMissLogAt = now;
  }
  return null;
}

// Removes the custom playlist stats panel if it exists.
function removePlaylistStatsPanel() {
  const existingPanel = document.getElementById(PLAYLIST_STATS_PANEL_ID);
  if (existingPanel) existingPanel.remove();
  lastPlaylistStatsKey = '';
}

// Produces a compact fingerprint so unchanged stats are not repeatedly logged.
function buildPlaylistStatsKey(stats) {
  return `${stats.totalVideos}|${stats.fullyWatchedVideos}|${stats.totalDurationSec}|${Math.round(stats.watchedDurationSec)}|${stats.totalWatchedPercentage.toFixed(2)}`;
}

// Renders or updates the playlist stats panel in the playlist header UI.
function renderPlaylistStatsPanel(stats) {
  const anchor = findPlaylistStatsAnchor();
  if (!anchor) return;

  let panel = document.getElementById(PLAYLIST_STATS_PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PLAYLIST_STATS_PANEL_ID;
    panel.className = 'ytmaw-playlist-stats';
    anchor.insertAdjacentElement('beforebegin', panel);
  }

  const completionPct = stats.totalWatchedPercentage.toFixed(1);
  panel.innerHTML = `
    <div class="ytmaw-playlist-stats-title">Watch Progress</div>
    <div class="ytmaw-playlist-stats-progress-bar">
      <div class="ytmaw-playlist-stats-progress-fill" style="width: ${completionPct}%"></div>
    </div>
    <div class="ytmaw-playlist-stats-grid">
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Videos watched</span><span class="ytmaw-value">${stats.fullyWatchedVideos}/${stats.totalVideos}</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Completion</span><span class="ytmaw-value">${completionPct}%</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Watched time</span><span class="ytmaw-value">${formatTime(stats.watchedDurationSec)}</span></div>
      <div class="ytmaw-playlist-stat"><span class="ytmaw-label">Total time</span><span class="ytmaw-value">${formatTime(stats.totalDurationSec)}</span></div>
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
    renderPlaylistStatsPanel(stats);
  }
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

// =============================================================================
// FILTER FEATURES
// =============================================================================

// Shows a brief notification overlay on YouTube pages.
function showYtmawNotification(message) {
  const existing = document.getElementById('ytmaw-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.id = 'ytmaw-notification';
  notification.className = 'ytmaw-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 3000);
}

// Cleans a Watch Later playlist URL by stripping playlist parameters.
function cleanPlaylistUrl(url) {
  try {
    const urlObj = new URL(url, window.location.origin);
    const videoId = urlObj.searchParams.get('v');
    const timeParam = urlObj.searchParams.get('t');
    if (videoId) {
      let newUrl = `/watch?v=${videoId}`;
      if (timeParam) newUrl += `&t=${timeParam}`;
      return newUrl;
    }
    return url;
  } catch (e) {
    return url;
  }
}

// Attaches a click listener to force navigation to the cleaned URL.
function attachCleanClickListener(element, cleanedUrl) {
  if (element._ytmawCleanListenerAttached) return;
  element.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.href = cleanedUrl;
  }, true);
  element._ytmawCleanListenerAttached = true;
}

// Processes a single video link to clean its Watch Later URL.
function processVideoLink(linkElement) {
  if (!linkElement) return false;
  const currentHref = linkElement.href;
  if (currentHref.includes('list=WL')) {
    const cleanedUrl = cleanPlaylistUrl(currentHref);
    if (cleanedUrl !== currentHref) {
      linkElement.href = cleanedUrl;
      attachCleanClickListener(linkElement, cleanedUrl);
      return true;
    }
  } else if (currentHref.includes('/watch?v=') && !linkElement._ytmawCleanListenerAttached) {
    attachCleanClickListener(linkElement, currentHref);
  }
  return false;
}

// Cleans all Watch Later playlist URLs on the current page.
function cleanWatchLaterUrls() {
  if (!isFeatureEnabled('enableCleanWatchLater')) return 0;
  if (!isWatchLaterPage()) return 0;

  let cleanedCount = 0;
  document.querySelectorAll('ytd-playlist-video-renderer').forEach(video => {
    if (processVideoLink(video.querySelector('a#thumbnail'))) cleanedCount++;
    if (processVideoLink(video.querySelector('a#video-title'))) cleanedCount++;
  });

  if (cleanedCount > 0) showYtmawNotification(`Cleaned ${cleanedCount} Watch Later URLs`);
  return cleanedCount;
}

// Hides Shorts shelf and section renderers from the page.
function hideShorts() {
  if (!isFeatureEnabled('enableHideShorts')) return 0;
  let hiddenCount = 0;

  document.querySelectorAll('ytd-reel-shelf-renderer').forEach(shelf => {
    if (!shelf.classList.contains('ytmaw-hide')) {
      shelf.classList.add('ytmaw-hide');
      hiddenCount++;
    }
  });

  document.querySelectorAll('ytd-rich-section-renderer').forEach(section => {
    const titleEl = section.querySelector('#title');
    if (titleEl && titleEl.textContent.trim().toLowerCase() === 'shorts') {
      if (!section.classList.contains('ytmaw-hide')) {
        section.classList.add('ytmaw-hide');
        hiddenCount++;
      }
    }
  });

  if (hiddenCount > 0) {
    hiddenShortsCount += hiddenCount;
    showYtmawNotification(`Hidden ${hiddenCount} Shorts sections`);
  }
  return hiddenCount;
}

// Hides Members-only video cards from the page.
function hideMembers() {
  if (!isFeatureEnabled('enableHideMembers')) return 0;
  let hiddenCount = 0;

  document.querySelectorAll('.yt-badge-shape__text--has-multiple-badges-in-row').forEach(badge => {
    if (badge.textContent.trim() !== 'Members only') return;
    const container = badge.closest('yt-lockup-view-model') ||
                      badge.closest('ytd-video-renderer') ||
                      badge.closest('ytd-grid-video-renderer') ||
                      badge.closest('ytd-compact-video-renderer') ||
                      badge.closest('ytd-rich-item-renderer') ||
                      badge.closest('ytd-item-section-renderer');
    if (container && !container.classList.contains('ytmaw-hide')) {
      container.classList.add('ytmaw-hide');
      hiddenCount++;
    }
  });

  if (hiddenCount > 0) {
    hiddenMembersCount += hiddenCount;
    showYtmawNotification(`Hidden ${hiddenCount} Members only videos`);
  }
  return hiddenCount;
}

// Hides fully watched videos (100% progress) from the page.
function hideWatchedVideos() {
  hiddenVideos = [];
  let count = 0;

  if (isWatchLaterPage()) {
    document.querySelectorAll('ytd-playlist-video-renderer').forEach(video => {
      let isWatched = false;
      const progress = video.querySelector('#progress');
      if (progress) {
        const w = progress.style.width;
        if (w === '100%' || (w && w.includes('calc(100%'))) isWatched = true;
      }
      const progressBar = video.querySelector('ytd-thumbnail-overlay-resume-playback-renderer');
      if (progressBar) {
        const p = progressBar.querySelector('#progress');
        if (p && p.style.width === '100%') isWatched = true;
      }
      if (isWatched) {
        video.classList.add('ytmaw-hide');
        hiddenVideos.push(video);
        count++;
      }
    });
  } else {
    document.querySelectorAll('yt-lockup-view-model').forEach(video => {
      const seg = video.querySelector('.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment');
      if (seg && seg.style.width === '100%') {
        video.classList.add('ytmaw-hide');
        hiddenVideos.push(video);
        count++;
      }
    });
    document.querySelectorAll('ytd-video-renderer').forEach(video => {
      const progress = video.querySelector('#progress');
      if (progress && progress.style.width === '100%') {
        video.classList.add('ytmaw-hide');
        hiddenVideos.push(video);
        count++;
      }
    });
  }

  isHidingWatched = true;
  updateHistoryControlsState();
  if (count > 0) showYtmawNotification(`Hidden ${count} fully watched videos`);
  return count;
}

// Shows all previously hidden watched videos.
function showAllVideos() {
  hiddenVideos.forEach(v => v.classList.remove('ytmaw-hide'));
  const count = hiddenVideos.length;
  hiddenVideos = [];
  isHidingWatched = false;
  updateHistoryControlsState();
  showYtmawNotification(`Showing all videos (${count} were hidden)`);
  return count;
}

// Hides newly loaded watched videos as they are added to the DOM.
// Fires when setting is enabled or when user has manually triggered hide.
function hideNewlyLoadedWatchedVideos() {
  if (!isFeatureEnabled('enableHideWatched') && !isHidingWatched) return;

  document.querySelectorAll('yt-lockup-view-model:not(.ytmaw-hide)').forEach(video => {
    const seg = video.querySelector('.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment');
    if (seg && seg.style.width === '100%') {
      video.classList.add('ytmaw-hide');
      hiddenVideos.push(video);
    }
  });
}

// Sets up a MutationObserver to auto-hide watched videos as they load on the History page.
// Also hides already-loaded videos immediately.
function setupDynamicWatchedVideoHiding() {
  if (dynamicHideObserver) {
    dynamicHideObserver.disconnect();
    dynamicHideObserver = null;
  }

  const target = document.querySelector('#contents, #primary, ytd-app');
  if (!target) return;

  dynamicHideObserver = new MutationObserver((mutations) => {
    let hasNew = false;
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if ((node.matches && node.matches('yt-lockup-view-model')) ||
              (node.querySelector && node.querySelector('yt-lockup-view-model'))) {
            hasNew = true;
          }
        }
      });
    });
    if (hasNew) setTimeout(hideNewlyLoadedWatchedVideos, 300);
  });

  dynamicHideObserver.observe(target, { childList: true, subtree: true });

  // Hide already-loaded watched videos when the observer is set up
  if (isFeatureEnabled('enableHideWatched')) {
    setTimeout(hideWatchedVideos, 600);
  }
}

// Runs auto-hide and URL-clean features based on current settings and page.
function handleContentChanges() {
  if (isFeatureEnabled('enableHideShorts')) hideShorts();
  if (isFeatureEnabled('enableHideMembers')) hideMembers();
  if (isFeatureEnabled('enableCleanWatchLater') && isWatchLaterPage()) cleanWatchLaterUrls();
}

// Sets up periodic polling to catch content changes the observer may miss.
function setupContentMonitoring() {
  if (contentWatcherInterval) clearInterval(contentWatcherInterval);
  contentWatcherInterval = setInterval(handleContentChanges, 5000);
}

// =============================================================================
// HISTORY PAGE INLINE CONTROLS
// =============================================================================

// Creates a button styled to match YouTube's native action bar buttons.
function createYtButton(label, id) {
  const shape = document.createElement('yt-button-shape');

  const btn = document.createElement('button');
  btn.id = id;
  btn.className = [
    'ytSpecButtonShapeNextHost',
    'ytSpecButtonShapeNextText',
    'ytSpecButtonShapeNextMono',
    'ytSpecButtonShapeNextSizeM',
    'ytSpecButtonShapeNextEnableBackdropFilterExperiment'
  ].join(' ');
  btn.setAttribute('aria-label', label);
  btn.style.justifyContent = 'flex-start';

  const textContent = document.createElement('div');
  textContent.className = 'ytSpecButtonShapeNextButtonTextContent';

  const span = document.createElement('span');
  span.className = 'ytAttributedStringHost ytAttributedStringWhiteSpaceNoWrap';
  span.setAttribute('role', 'text');
  span.textContent = label;

  const feedback = document.createElement('yt-touch-feedback-shape');
  feedback.setAttribute('aria-hidden', 'true');
  feedback.className = 'ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse';
  feedback.innerHTML = '<div class="ytSpecTouchFeedbackShapeStroke"></div><div class="ytSpecTouchFeedbackShapeFill"></div>';

  textContent.appendChild(span);
  btn.appendChild(textContent);
  btn.appendChild(feedback);
  shape.appendChild(btn);
  return shape;
}

// Updates the active/inactive visual state of the injected history controls.
function updateHistoryControlsState() {
  const hideBtn = document.getElementById('ytmaw-hide-watched-btn');
  const showBtn = document.getElementById('ytmaw-show-watched-btn');
  if (!hideBtn || !showBtn) return;

  hideBtn.disabled = isHidingWatched;
  showBtn.disabled = !isHidingWatched;
  hideBtn.style.opacity = isHidingWatched ? '0.45' : '';
  showBtn.style.opacity = !isHidingWatched ? '0.45' : '';
}

// Removes the injected history controls if present.
function removeHistoryControls() {
  document.getElementById(HISTORY_CONTROLS_ID)?.remove();
}

// Injects Hide/Show watched buttons into the YouTube history page action bar.
// Retries until the action bar is available.
function injectHistoryPageButtons(retries = 15) {
  if (!isHistoryPage()) return;
  if (document.getElementById(HISTORY_CONTROLS_ID)) return;

  const actionsContainer = document.querySelector('ytd-browse-feed-actions-renderer #contents');
  if (!actionsContainer) {
    if (retries > 0) setTimeout(() => injectHistoryPageButtons(retries - 1), 400);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = HISTORY_CONTROLS_ID;
  wrapper.className = 'ytmaw-history-controls style-scope ytd-browse-feed-actions-renderer';

  const hideShape = createYtButton('Hide watched', 'ytmaw-hide-watched-btn');
  const showShape = createYtButton('Show all', 'ytmaw-show-watched-btn');

  hideShape.querySelector('button').addEventListener('click', () => hideWatchedVideos());
  showShape.querySelector('button').addEventListener('click', () => showAllVideos());

  wrapper.appendChild(hideShape);
  wrapper.appendChild(showShape);

  // Insert after the search box so our buttons appear at the top of the action list.
  // Using Element.after() avoids the HierarchyRequestError that insertBefore throws
  // when the reference node is a descendant rather than a direct child.
  const searchBox = actionsContainer.querySelector('ytd-search-box-renderer');
  if (searchBox) {
    searchBox.after(wrapper);
  } else {
    actionsContainer.prepend(wrapper);
  }

  updateHistoryControlsState();
}

// =============================================================================
// NAVIGATION + OBSERVERS
// =============================================================================

// Listens for YouTube SPA navigation and re-applies filter features on URL change.
function setupNavigationObserver() {
  let lastNavUrl = location.href;
  let wasHistoryPage = isHistoryPage();

  setInterval(() => {
    if (location.href === lastNavUrl) return;
    lastNavUrl = location.href;

    const nowHistory = isHistoryPage();

    if (nowHistory && !wasHistoryPage) {
      // Just navigated TO history page
      setTimeout(() => {
        setupDynamicWatchedVideoHiding();
        injectHistoryPageButtons();
      }, 800);
    } else if (!nowHistory && wasHistoryPage) {
      // Left history page — clean up
      removeHistoryControls();
    }

    wasHistoryPage = nowHistory;

    handleContentChanges();
    if (isFeatureEnabled('enableCleanWatchLater') && isWatchLaterPage()) {
      setTimeout(cleanWatchLaterUrls, 1000);
    }
  }, 500);

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (isHistoryPage()) {
        setupDynamicWatchedVideoHiding();
        injectHistoryPageButtons();
      }
      handleContentChanges();
    }, 100);
  });
}

// Registers a message listener to handle popup action requests.
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request.action || !request.action.startsWith('ytmaw_')) return false;

    switch (request.action) {
      case 'ytmaw_hideWatched': {
        const count = hideWatchedVideos();
        sendResponse({ success: true, hiddenCount: count });
        return true;
      }
      case 'ytmaw_showAll': {
        const count = showAllVideos();
        sendResponse({ success: true, shownCount: count });
        return true;
      }
      case 'ytmaw_hideShorts': {
        const count = hideShorts();
        sendResponse({ success: true, hiddenCount: count });
        return true;
      }
      case 'ytmaw_hideMembers': {
        const count = hideMembers();
        sendResponse({ success: true, hiddenCount: count });
        return true;
      }
      case 'ytmaw_cleanUrls': {
        const count = cleanWatchLaterUrls();
        sendResponse({ success: true, cleanedCount: count });
        return true;
      }
      case 'ytmaw_getStats': {
        sendResponse({
          success: true,
          stats: {
            hiddenVideos: hiddenVideos.length,
            hiddenShorts: hiddenShortsCount,
            hiddenMembers: hiddenMembersCount,
            isHidingWatched,
            isWatchLater: isWatchLaterPage()
          }
        });
        return true;
      }
      default:
        return false;
    }
  });
}

// =============================================================================
// MUTATION OBSERVER + NAVIGATION EVENTS
// =============================================================================

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

  handleContentChanges();
  if (isFeatureEnabled('enableCleanWatchLater') && isWatchLaterPage()) {
    setTimeout(cleanWatchLaterUrls, 1000);
  }

  if (isHistoryPage()) {
    setTimeout(() => {
      setupDynamicWatchedVideoHiding();
      injectHistoryPageButtons();
    }, 800);
  } else {
    removeHistoryControls();
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

  if (!filtersInitialized) {
    filtersInitialized = true;

    setTimeout(() => {
      handleContentChanges();
      if (isFeatureEnabled('enableCleanWatchLater') && isWatchLaterPage()) cleanWatchLaterUrls();
      if (isHistoryPage()) {
        setupDynamicWatchedVideoHiding();
        injectHistoryPageButtons();
      }
    }, 1500);

    setupContentMonitoring();
    setupNavigationObserver();
    setupMessageListener();
  }
})();
