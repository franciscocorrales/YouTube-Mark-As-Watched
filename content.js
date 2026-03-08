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

function isFeatureEnabled(key) {
  return !!settings[key];
}

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

function removeMarkAsWatchedButton() {
  const button = document.getElementById('mark-watched-btn');
  if (button) button.remove();
}

function removeVideoEndListener() {
  const videoPlayer = document.querySelector('video');
  if (!videoPlayer) return;
  videoPlayer.removeEventListener('ended', handleVideoEnd);
}

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

  if (isFeatureEnabled('enablePlaylistStats') && location.href.includes('/playlist?list=')) {
    triggerPlaylistStats();
  }

  if (!isFeatureEnabled('enablePlaylistStats') && playlistDebounceTimer) {
    clearTimeout(playlistDebounceTimer);
    playlistDebounceTimer = null;
  }
}

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

function addVideoEndListener() {
  if (!isFeatureEnabled('enableAutoMarkOnVideoEnd')) return;

  const videoPlayer = document.querySelector('video');
  if (!videoPlayer) {
    return;
  }

  videoPlayer.removeEventListener('ended', handleVideoEnd);
  videoPlayer.addEventListener('ended', handleVideoEnd);
}

function handleVideoEnd() {
  if (!isFeatureEnabled('enableAutoMarkOnVideoEnd')) return;
  if (!isMarkingVideo) {
    markVideoAsWatched();
  }
}

function getBeforeFilter() {
  return `before:${new Date().getFullYear() + 1}`;
}

function maybePrefixSearchInput(searchInput) {
  if (!isFeatureEnabled('enableSearchBeforeYear')) return;
  if (!searchInput || !searchInput.value) return;

  const originalQuery = searchInput.value.trim();
  const beforeFilter = getBeforeFilter();
  if (!originalQuery || originalQuery.includes(beforeFilter)) return;

  searchInput.value = `${beforeFilter} ${originalQuery}`;
}

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

function setupSearchInputInterception(searchInput) {
  if (!searchInput || searchInput._markWatchedSearchIntercepted) return;
  searchInput._markWatchedSearchIntercepted = true;

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      maybePrefixSearchInput(searchInput);
    }
  }, true);
}

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

function calculatePlaylistStats() {
  if (!isFeatureEnabled('enablePlaylistStats')) return;
  if (!location.href.includes('/playlist?list=')) return;

  const videoItems = document.querySelectorAll('ytd-playlist-video-renderer');
  if (videoItems.length === 0) return;

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

  if (totalVideos > 0) {
    const totalWatchedPercentage = totalDurationSec > 0 ? (watchedDurationSec / totalDurationSec) * 100 : 0;

    console.log(`[YouTube Mark As Watched] Playlist Stats:\n    - Videos: ${totalVideos}\n    - Total Duration: ${formatTime(totalDurationSec)}\n    - Watched Duration: ${formatTime(watchedDurationSec)}\n    - Playlist Completion: ${totalWatchedPercentage.toFixed(1)}%`);
  }
}

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

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function triggerPlaylistStats() {
  if (!isFeatureEnabled('enablePlaylistStats')) return;
  if (playlistDebounceTimer) clearTimeout(playlistDebounceTimer);
  playlistDebounceTimer = setTimeout(calculatePlaylistStats, 2000);
}

const observer = new MutationObserver(() => {
  const currentUrl = location.href;

  if (isFeatureEnabled('enablePlaylistStats') && currentUrl.includes('/playlist?list=')) {
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

document.addEventListener('yt-navigate-finish', () => {
  setTimeout(waitForPlayer, 1000);

  if (isFeatureEnabled('enableSearchBeforeYear')) {
    setupSearchInterception();
    checkAndRedirectSearch();
  }

  if (isFeatureEnabled('enablePlaylistStats') && location.href.includes('/playlist?list=')) {
    triggerPlaylistStats();
  }
});

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

(async function init() {
  await loadSettings();
  applyFeatureToggles();
})();
