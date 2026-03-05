// Wait for YouTube player to be fully loaded
function waitForPlayer() {
  const video = document.querySelector('video');
  const controls = document.querySelector('.ytp-chrome-controls') || document.querySelector('.ytp-right-controls');
  
  if (video && controls) {
    addMarkAsWatchedButton();
    addVideoEndListener();
  } else {
    setTimeout(waitForPlayer, 1000);
  }
}

// Add custom button to YouTube interface
function addMarkAsWatchedButton() {
  // Check if button already exists
  if (document.getElementById('mark-watched-btn')) {
    return;
  }

  // Try multiple selectors for YouTube's right controls area (YouTube changes these frequently)
  const rightControls = document.querySelector('.ytp-right-controls') || 
                       document.querySelector('.ytp-chrome-controls .ytp-right-controls') ||
                       document.querySelector('[class*="ytp-right-controls"]');
  
  if (!rightControls) {
    return;
  }

  // Create button
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

  // Add click event listener
  button.addEventListener('click', markVideoAsWatched);

  // Insert button into player controls (try different insertion methods)
  try {
    rightControls.insertBefore(button, rightControls.firstChild);
  } catch (error) {
    // Fallback: append to the end
    rightControls.appendChild(button);
  }
}

// Function to mark video as watched
function markVideoAsWatched() {
  if (isMarkingVideo) return; // Prevent recursive calls

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

    // Set current time to end of video (leaving 0.1s to avoid potential issues)
    videoPlayer.currentTime = videoDuration - 0.1;

    // Force playback to ensure the progress is registered
    videoPlayer.play();

    // Add a small delay then pause the video
    setTimeout(() => {
      // Ensure we're at the very end
      videoPlayer.currentTime = videoDuration - 0.01;

      // Optional: pause after reaching the end
      setTimeout(() => {
        videoPlayer.pause();

        // Show success feedback
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

// Add listener for video end
function addVideoEndListener() {
  const videoPlayer = document.querySelector('video');
  if (!videoPlayer) {
    return;
  }

  // Remove any existing listeners to avoid duplicates
  videoPlayer.removeEventListener('ended', handleVideoEnd);
  
  // Add the listener
  videoPlayer.addEventListener('ended', handleVideoEnd);
}

// Separate function to handle video end
function handleVideoEnd() {
  if (!isMarkingVideo) {
    markVideoAsWatched();
  }
}

// Start the process when YouTube page loads
waitForPlayer();

// Re-add button and listeners when navigating between videos without page reload
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  const currentUrl = location.href;
  
  // Check if we are on a playlist page and trigger stats calculation
  if (currentUrl.includes('/playlist?list=')) {
    triggerPlaylistStats();
  }

  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    
    // Remove existing button if any
    const existingButton = document.getElementById('mark-watched-btn');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Wait a bit longer for the new page to load
    setTimeout(waitForPlayer, 2000);
  }
  
  // Also check if controls are added dynamically
  if (!document.getElementById('mark-watched-btn')) {
    const controls = document.querySelector('.ytp-chrome-controls .ytp-right-controls');
    if (controls && document.querySelector('video')) {
      setTimeout(() => {
        addMarkAsWatchedButton();
        addVideoEndListener();
      }, 500);
    }
  }
});

// Observe changes to the entire document
observer.observe(document, { 
  subtree: true, 
  childList: true,
  attributes: false // We don't need to watch for attribute changes
});

// Track if we're currently marking the video
let isMarkingVideo = false;

// Also listen for YouTube's specific navigation events
document.addEventListener('yt-navigate-finish', () => {
  setTimeout(waitForPlayer, 1000);
  if (location.href.includes('/playlist?list=')) {
    triggerPlaylistStats();
  }
});


// --- Playlist Statistics Feature ---

let playlistDebounceTimer = null;

function calculatePlaylistStats() {
  // Only run on playlist pages
  if (!location.href.includes('/playlist?list=')) return;

  // Use the selector provided by user for video items in a playlist
  const videoItems = document.querySelectorAll('ytd-playlist-video-renderer');
  if (videoItems.length === 0) return;

  let totalVideos = 0;
  let totalDurationSec = 0;
  let watchedDurationSec = 0;

  videoItems.forEach(item => {
    // Determine duration
    // Try newer badge shape selector first, then fallback
    let timeText = '';
    const badgeText = item.querySelector('.yt-badge-shape__text');
    if (badgeText) {
      timeText = badgeText.textContent.trim();
    } else {
      // Fallback for older layouts or different views
      const oldTime = item.querySelector('ytd-thumbnail-overlay-time-status-renderer span#text');
      if (oldTime) timeText = oldTime.textContent.trim();
    }

    if (!timeText) return;

    const duration = parseTime(timeText);
    if (duration === 0) return;

    totalVideos++;
    totalDurationSec += duration;

    // Determine watched percentage
    let percentage = 0;
    
    // Check for "WATCHED" text overlay
    const overlay = item.querySelector('ytd-thumbnail-overlay-playback-status-renderer yt-formatted-string');
    if (overlay && overlay.textContent.trim() === 'WATCHED') {
      percentage = 1.0;
    } else {
      // Check for progress bar style width
      const progress = item.querySelector('ytd-thumbnail-overlay-resume-playback-renderer #progress');
      if (progress && progress.style.width) {
        // defined as '100%' or '50%'
        const widthVal = parseFloat(progress.style.width);
        if (!isNaN(widthVal)) {
          percentage = widthVal / 100;
        }
      }
    }

    watchedDurationSec += (duration * percentage);
  });

  if (totalVideos > 0) {
    const totalWatchedPercentage = (totalDurationSec > 0) ? (watchedDurationSec / totalDurationSec) * 100 : 0;
    
    console.log(`[YouTube Mark As Watched] Playlist Stats:
    - Videos: ${totalVideos}
    - Total Duration: ${formatTime(totalDurationSec)}
    - Watched Duration: ${formatTime(watchedDurationSec)}
    - Playlist Completion: ${totalWatchedPercentage.toFixed(1)}%`);
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
  if (playlistDebounceTimer) clearTimeout(playlistDebounceTimer);
  playlistDebounceTimer = setTimeout(calculatePlaylistStats, 2000); // Wait for rendering to settle
}