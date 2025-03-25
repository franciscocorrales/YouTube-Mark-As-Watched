// Wait for YouTube player to be fully loaded
function waitForPlayer() {
  if (document.querySelector('video')) {
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

  // Find YouTube's right controls area
  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) return;

  // Create button
  const button = document.createElement('button');
  button.id = 'mark-watched-btn';
  button.className = 'ytp-button mark-watched-btn';
  button.title = 'Mark as Watched';
  button.innerHTML = `
    <svg height="100%" version="1.1" viewBox="0 0 24 24" width="100%">
      <path d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2ZM10,17L5,12L6.41,10.59L10,14.17L17.59,6.58L19,8L10,17Z" fill="#FFFFFF"></path>
    </svg>
  `;

  // Add click event listener
  button.addEventListener('click', markVideoAsWatched);

  // Insert button into player controls
  rightControls.insertBefore(button, rightControls.firstChild);
}

// Track if we're currently marking the video
let isMarkingVideo = false;

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

        console.log('✅ Video marked as watched successfully!');
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
  if (!videoPlayer) return;

  videoPlayer.addEventListener('ended', () => {
    if (!isMarkingVideo) {
      console.log('Video ended naturally, marking as watched...');
      markVideoAsWatched();
    }
  });
}

// Start the process when YouTube page loads
waitForPlayer();

// Re-add button and listeners when navigating between videos without page reload
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(waitForPlayer, 1500); // Wait for player to load after navigation
  }
}).observe(document, { subtree: true, childList: true });