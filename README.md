# YouTube Mark As Watched

## Overview

This Chrome extension helps fix a common YouTube web issue where fully watched videos are not always recorded as completed.

Get it from Chrome Store:
<https://chromewebstore.google.com/detail/youtube-mark-as-watched/pccgjnpmgoibggokgmciimgoomofocbd>

## Features

1. Mark as Watched button in the YouTube player controls.
2. Auto-mark video as watched when playback reaches the end.
3. Playlist completion stats (printed in browser console on playlist pages).
4. Cleaner search results mode (optional): auto-adds `before:YYYY` so search pages favor direct query matches and reduce recommendation/Shorts-style insertions.

## Settings (Enable/Disable Per Feature)

All features can be enabled or disabled from the extension settings page.

1. Open `chrome://extensions/`.
2. Find **YouTube Mark As Watched**.
3. Click **Details**.
4. Open **Extension options**.

Default settings:

1. `Add "Mark as Watched" player button`: `true`
2. `Auto-mark video as watched when playback ends`: `true`
3. `Calculate playlist completion stats`: `true`
4. `Cleaner search results mode (before:YYYY)`: `false`

## Installation

### From Chrome Web Store

1. Visit the extension page on the Chrome Web Store.
2. Click **Add to Chrome**.
3. Confirm installation.

### Manual Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

## Usage

1. Open a YouTube video page.
2. Use the checkmark button in player controls to mark as watched.
3. Optionally enable/disable features in **Extension options**.

![element location](icons/button-location.jpg?raw=true "button location")

## Technical Notes

The extension uses a content script to interact with YouTube's player and page UI, and stores feature toggles in `chrome.storage.sync`.

## Packaging

To create a zip for Chrome Web Store upload:

```bash
zip -r YouTubeMarkAsWatched.zip . -x "*.git*"
```

## License

Licensed under GNU General Public License v3.0. See `LICENSE` for details.

## Contributing

Contributions and pull requests are welcome.

## Acknowledgements

- Icons created by Muhamad Ulum from Flaticon
