// Sends a message to the active YouTube tab's content script.
async function sendMessage(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { action }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('YouTube MAW popup:', chrome.runtime.lastError.message);
    }
  });
}

document.getElementById('hideWatched').addEventListener('click', () => {
  sendMessage('ytmaw_hideWatched');
  window.close();
});

document.getElementById('showAll').addEventListener('click', () => {
  sendMessage('ytmaw_showAll');
  window.close();
});

document.getElementById('hideShorts').addEventListener('click', () => {
  sendMessage('ytmaw_hideShorts');
  window.close();
});

document.getElementById('hideMembers').addEventListener('click', () => {
  sendMessage('ytmaw_hideMembers');
  window.close();
});

document.getElementById('cleanUrls').addEventListener('click', () => {
  sendMessage('ytmaw_cleanUrls');
  window.close();
});

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
