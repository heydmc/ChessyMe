document.addEventListener('DOMContentLoaded', async () => {
  // --- 1. ENVIRONMENT DETECTION ---
  const ua = navigator.userAgent;
  // Trigger mobile mode for ALL Android devices, bypassing Lemur's hidden identity
  const isAndroid =  /Android/i.test(ua);

  const unsupportedView = document.getElementById('unsupported-android-view');
  const extensionView = document.getElementById('extension-view');
  const desktopTools = document.getElementById('desktop-tools');
  const mobileTools = document.getElementById('mobile-tools');
  // Updated ID to match our new HTML
  const autoLoginBtn = document.getElementById('auto-login-btn');

  // If the popup is open, the browser supports extensions.
  // Hide the unsupported view and show the main extension view.
  if (unsupportedView) unsupportedView.style.display = 'none';
  if (extensionView) extensionView.style.display = 'block';

  // Environment switching logic
  if (isAndroid) {
      // Mobile Environment (Lemur)
      if (desktopTools) desktopTools.style.display = 'none';
      if (mobileTools) mobileTools.style.display = 'block';

      // Attach auto-login functionality
      if (autoLoginBtn) {
        autoLoginBtn.addEventListener('click', () => {
          // Send message to background.js to execute the auto-login sequence
          chrome.runtime.sendMessage({ action: "startAutoLogin" });
          window.close(); // Close the popup so the user can see the magic happen
        });
      }
  } else {
      // Standard Desktop Environment
      if (desktopTools) desktopTools.style.display = 'block';
      if (mobileTools) mobileTools.style.display = 'none';
  }

  // --- 2. AUTHENTICATION (SYNC) CHECK ---
  const syncStatus = document.getElementById('sync-status');
  let currentUserSyncId = null;

  // Retrieve the userId saved by the background service worker during authentication
  const data = await chrome.storage.local.get(['userId', 'firstName']);
  
  if (data.userId) {
      currentUserSyncId = data.userId;
      syncStatus.textContent = `✅ Connected as ${data.firstName || 'User'}`;
      syncStatus.style.backgroundColor = "#e6f4ea"; // Light green
      syncStatus.style.color = "#137333";
  } else {
      syncStatus.textContent = "❌ Not Synced. Connect via Website.";
      syncStatus.style.backgroundColor = "#fce8e6"; // Light red
      syncStatus.style.color = "#c5221f";

      const disconnectBtn = document.getElementById('disconnect-btn');
      if (disconnectBtn) disconnectBtn.style.display = 'none';
  }

  const disconnectBtn = document.getElementById('disconnect-btn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      chrome.storage.local.remove(['userId', 'token', 'firstName', 'lastSynced'], () => {
        window.location.reload();
      });
    });
  }

  // --- 3. ERROR HANDLING ---
  const errorMessage = document.getElementById('error-message');
  
  function showError(message) {
      errorMessage.textContent = message;
      errorMessage.classList.add('show');
  }
  function hideError() {
      errorMessage.classList.remove('show');
  }

  // --- 4. NAVIGATION / HOW TO USE ---
  document.getElementById('how-to-use-btn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://dogchess.web.app/tutorial.html' }); // Update with your actual tutorial link
      window.close(); 
  });

  // --- 5. CORE UTILITY ACTIONS ---
  document.getElementById('review-btn').addEventListener('click', () => {
    if (!currentUserSyncId) {
        showError("Please connect your extension via the website dashboard first.");
        return;
    }
    hideError();
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].url) {
        showError("No active tab found.");
        return;
      }
      const currentUrl = tabs[0].url;
      const regex = /(?:game|analysis)(?:.*\/)(\d{10,})/;
      const match = currentUrl.match(regex);

      if (match && match[1]) {
        chrome.runtime.sendMessage({ action: "startReview", gameId: match[1] }, (response) => {
          if (chrome.runtime.lastError) {
            showError("An unexpected error occurred.");
          } else if (response && !response.success) {
            showError(response.message);
          } else {
            window.close();
          }
        });
      } else {
        showError("Navigate to a Chess.com live game page.");
      }
    });
  });

  document.getElementById('adblock-btn').addEventListener('click', () => {
    if (!currentUserSyncId) {
        showError("Please connect your extension via the website dashboard first.");
        return;
    }
    hideError();
    chrome.runtime.sendMessage({ action: "toggleAdblock" }, (response) => {
      if (chrome.runtime.lastError) {
        showError("An unexpected error occurred.");
      } else if (response && response.success) {
        window.close();
      } else if (response && !response.success) {
        showError(response.message);
      }
    });
  });
});
