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

// Also listen for YouTube's specific navigation events
document.addEventListener('yt-navigate-finish', () => {
  setTimeout(waitForPlayer, 1000);
});