# YouTube Mark As Watched

## Overview

This Chrome extension addresses a persistent bug in YouTube's web interface where videos don't consistently get marked as "watched" in your watch history, even after viewing them completely. While this feature works reliably on mobile and TV apps, the web version often fails to update the red progress bar to show completion status.

## The Problem

Many YouTube users, including myself, have experienced this frustrating issue:
1. You watch a video to completion in your web browser
2. The red progress bar should fill completely, marking the video as watched
3. When you return later, the progress bar is incomplete, suggesting you haven't finished the video

This occurs across multiple browsers (Chrome, Firefox, Brave) and operating systems (Windows, macOS, Ubuntu), suggesting it's an issue with YouTube's web JavaScript implementation rather than a specific browser bug.

## The Solution

This extension adds a simple "Mark as Watched" button to YouTube's video player controls. When clicked, it:
1. Programmatically seeks to the end of the video
2. Briefly plays the last fraction of a second
3. Ensures YouTube's servers register the video as completely watched
4. Provides visual feedback when successful

## Installation

### From Chrome Web Store
1. Visit the extension page on the Chrome Web Store
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked"
5. Select the directory containing the extension files

## Usage

1. Navigate to any YouTube video
2. Look for the checkmark button in the video player controls
3. Click the button to mark the video as watched
4. The button will briefly turn green to indicate success

![element location](icons/element-location.png?raw=true "element location")

## Technical Details

The extension works by manipulating the video element's currentTime property to seek to the end of the video and triggering playback briefly to ensure YouTube's tracking mechanisms register the view as complete.

## License

This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- Icons created by Muhamad Ulum from Flaticon