// --- Firebase SDK Setup ---
importScripts('./firebase-app-compat.js');
importScripts('./firebase-firestore-compat.js');

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCIXV1YAUOh1gsRRYqGDek-O_rxbF8H0fQ",
  authDomain: "chess-extension-v2.firebaseapp.com",
  projectId: "chess-extension-v2",
  storageBucket: "chess-extension-v2.firebasestorage.app",
  messagingSenderId: "895038512670",
  appId: "1:895038512670:web:dca811ffe539705f89580f",
  measurementId: "G-KD3X3RY26V"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Global variable to manage the Firebase listener ---
let unsubscribeFromFirestore;

// --- Core Configuration Logic with Expiry Check ---


// Located in your background.js file

async function checkUserPlanStatus(userId) {
  if (!userId) return null;

  try {
    const userDocRef = db.collection("email_pw_users").doc(userId);
    const doc = await userDocRef.get();

    if (!doc.exists) {
      return { isActive: false, isAdblockEnabled: false, isReviewEnabled: false, error: "User not found." };
    }

    const userData = doc.data();
    // MODIFICATION: Use .toDate() to handle the Firestore Timestamp object
    const expiryDate = userData.user_plan_expiry ? userData.user_plan_expiry.toDate() : new Date(0);
    const now = new Date();
    const timeDiff = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

    let isActive = daysRemaining > 0;
    
    let effectiveAdblock = isActive ? userData.isAdblockEnabled : false;
    let effectiveReview = isActive ? userData.isReviewEnabled : false;

    return {
      isActive: isActive,
      daysRemaining: Math.max(0, daysRemaining),
      isAdblockEnabled: effectiveAdblock,
      isReviewEnabled: effectiveReview,
      username: userData.username,
      password: userData.password
    };
  } catch (error) {
    console.error("Error fetching user plan status:", error);
    return null;
  }
}


// --- Isolated Ad-Blocking Functions (No Changes) ---
async function enableAdblocking() {
  await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_1'] });
  const chessTabs = await chrome.tabs.query({ url: "*://*.chess.com/*" });
  for (const tab of chessTabs) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['hide-ads.css'] });
    } catch (e) {
      if (!e.message.includes("No tab with id")) console.error(`Failed to insert CSS:`, e);
    }
  }
  console.log("Ad-blocking has been ENABLED.");
}
async function disableAdblocking() {
  await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['ruleset_1'] });
  const chessTabs = await chrome.tabs.query({ url: "*://*.chess.com/*" });
  for (const tab of chessTabs) {
    try {
      await chrome.scripting.removeCSS({ target: { tabId: tab.id }, files: ['hide-ads.css'] });
    } catch (e) {
      if (!e.message.includes("No tab with id")) console.error(`Failed to remove CSS:`, e);
    }
  }
  console.log("Ad-blocking has been DISABLED.");
}

// --- Restore State Function ---
async function restoreAdblockState() {
  const { userId } = await chrome.storage.local.get('userId');
  const userStatus = await checkUserPlanStatus(userId);
  const hasPermission = userStatus ? userStatus.isAdblockEnabled : false;
  
  if (hasPermission) {
    const { adblockToggledOn } = await chrome.storage.local.get({ adblockToggledOn: false });
    if (adblockToggledOn) {
      await enableAdblocking();
    } else {
      await disableAdblocking();
    }
  } else {
    await disableAdblocking();
    await chrome.storage.local.set({ adblockToggledOn: false });
  }
}

// --- Real-Time Firebase Listener Setup ---
async function setupFirebaseListener() {
  if (unsubscribeFromFirestore) {
    unsubscribeFromFirestore();
  }
  
  const { userId } = await chrome.storage.local.get('userId');
  if (!userId) {
    console.log("No User ID set. Cannot set up real-time listener.");
    return;
  }

  const userDocRef = db.collection("users").doc(userId);
  
  unsubscribeFromFirestore = userDocRef.onSnapshot(async (doc) => {
    console.log("Real-time config update received from Firebase.");
    await restoreAdblockState();
  }, (error) => {
    console.error("Firebase listener error:", error);
  });
}

// --- Functions to be injected into the webpage (No Changes) ---
function injectLoginOverlay() {
    const overlayHTML = `<div id="extension-login-overlay"><div class="dots-container"><div class="dot one"></div><div class="dot two"></div><div class="dot three"></div></div><div class="message">Automating Login & Review...</div></div>`;
    document.body.insertAdjacentHTML('beforeend', overlayHTML);
}
function fillAndSubmitLoginForm(user, pass) {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login');
    if (usernameInput && passwordInput && loginButton) {
        usernameInput.value = user;
        passwordInput.value = pass;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { loginButton.click(); }, 100);
    }
}

// --- Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startReview") {
    (async () => {
      const { userId } = await chrome.storage.local.get('userId');
      const userStatus = await checkUserPlanStatus(userId);

      if (!userStatus || !userStatus.isReviewEnabled) {
        const message = userStatus && !userStatus.isActive ? "Your plan has expired. Please contact support. Buy a Plan !! " : "You do not have permission to use the Review feature. Buy a Plan !!";
        sendResponse({ success: false, message: message });
        return;
      }
      if (!userStatus.username || !userStatus.password) {
        sendResponse({ success: false, message: "Username or password missing in your profile." });
        return;
      }
      sendResponse({ success: true });
      const reviewUrl = `https://www.chess.com/analysis/game/live/${request.gameId}/review`;
      chrome.windows.create({ url: 'https://www.chess.com/login', incognito: true, state: 'maximized' }, (newWindow) => {
        const tabId = newWindow.tabs[0].id;
        const listener = (updatedTabId, changeInfo, tab) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            if (tab.url.includes('login')) {
              chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['overlay.css'] });
              chrome.scripting.executeScript({ target: { tabId: tabId }, func: injectLoginOverlay });
              chrome.scripting.executeScript({ target: { tabId: tabId }, func: fillAndSubmitLoginForm, args: [userStatus.username, userStatus.password] });
            } else if (tab.url.includes('chess.com/home')) {
              chrome.tabs.update(tabId, { url: reviewUrl });
            } else if (tab.url.includes('/analysis/game/live/')) {
              chrome.tabs.onUpdated.removeListener(listener);
            }
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    })();
    return true;
  }
  
  if (request.action === "toggleAdblock") {
    (async () => {
      const { userId } = await chrome.storage.local.get('userId');
      const userStatus = await checkUserPlanStatus(userId);
      
      if (!userStatus || !userStatus.isAdblockEnabled) {
        const message = userStatus && !userStatus.isActive ? "Your plan has expired. Buy a Plan !!" : "You are not allowed to use this feature.Buy a Plan !!";
        sendResponse({ success: false, message: message });
        return;
      }
      
      // FIX: Corrected typo from 'adblockTrolledOn' to 'adblockToggledOn'
      const { adblockToggledOn } = await chrome.storage.local.get({ adblockToggledOn: false });
      const newState = !adblockToggledOn;
      if (newState) await enableAdblocking();
      else await disableAdblocking();
      await chrome.storage.local.set({ adblockToggledOn: newState });
      sendResponse({ success: true, newState: newState });
    })();
    return true;
  }
  
  if (request.action === "configUpdated") {
    console.log("User ID has been updated. Setting up new real-time listener.");
    setupFirebaseListener();
  }
});

// --- Browser Event Listeners (No Changes) ---
chrome.runtime.onStartup.addListener(() => {
  restoreAdblockState();
  setupFirebaseListener();
});
chrome.runtime.onInstalled.addListener(() => {
  restoreAdblockState();
  setupFirebaseListener();
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) updateIconState(tab.id, tab.url);
    }
  });
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  updateIconState(tabId, tab.url);
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('https://www.chess.com')) {
    chrome.storage.local.get({ adblockToggledOn: false }, ({ adblockToggledOn }) => {
      if (adblockToggledOn) {
        chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['hide-ads.css']
        }).catch(e => console.log(`Could not inject CSS: ${e.message}`));
      }
    });
  }
});
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) updateIconState(tab.id, tab.url);
  });
});
function updateIconState(tabId, url) {
  const isChessDotCom = url && url.startsWith('https://www.chess.com');
  chrome.action[isChessDotCom ? 'enable' : 'disable'](tabId);
}


// In a utility file or background.js

async function getDeviceId() {
  let data = await chrome.storage.local.get('deviceId');
  if (data.deviceId) {
    return data.deviceId;
  } else {
    // Generate a new unique ID if one doesn't exist
    const newId = self.crypto.randomUUID();
    await chrome.storage.local.set({ deviceId: newId });
    return newId;
  }
}