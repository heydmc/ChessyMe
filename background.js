// --- Firebase SDK Setup ---
importScripts('./firebase-app-compat.js');
importScripts('./firebase-auth-compat.js');
importScripts('./firebase-firestore-compat.js');

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAy1rUcak70TT_r2yWGfDpc8zIb4dd97JQ",
    authDomain: "chessy-me-website.firebaseapp.com",
    projectId: "chessy-me-website",
    storageBucket: "chessy-me-website.firebasestorage.app",
    messagingSenderId: "133667896369",
    appId: "1:133667896369:web:f7bef2bffef109bba7a910",
    measurementId: "G-2H0DG0KP98"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// NEW: Re-authenticate on background script startup/wake up
chrome.storage.local.get(['token'], async (data) => {
  if (data.token) {
    try {
      await firebase.auth().signInWithCustomToken(data.token);
      console.log("Re-authenticated with stored token on startup.");
    } catch (error) {
      console.error("Failed to re-authenticate with stored token:", error);
    }
  }
});

// --- Global variable to manage the Firebase listener ---
let unsubscribeFromFirestore;
// --- NEW: Authenticate the Extension Bot ---
firebase.auth().signInWithEmailAndPassword("extension@chessyme.com", "Dmc@6213")
  .then(() => {
    console.log("Extension Bot successfully connected to Firebase.");
  })
  .catch((error) => {
    console.error("Extension Bot failed to connect:", error);
  });
// --- Core Configuration Logic with Expiry Check ---


// Located in your background.js file

async function checkUserPlanStatus(userId) {
  if (!userId) return null;

  try {
    const userDocRef = db.collection("users").doc(userId);
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
      PremiumUsername: userData.PremiumUsername, // <-- UPDATED: The account used to log in
      password: userData.password,
      chessUsername: userData.chessUsername // <-- NEW: Saved for your future stats feature!
    };
  } catch (error) {
    console.error("Error fetching user plan status:", error);
    return null;
  }
}

// --- NEW: Credential Rotation Function ---
// --- UPDATED: Credential Rotation Function ---
// --- DIAGNOSTIC CREDENTIAL ROTATION FUNCTION ---
async function rotateUserCredentials(userId) {
  console.log("--- STARTING CREDENTIAL ROTATION ---");
  try {
    // STEP 1: Authenticate
    let currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        console.log("Bot not detected, attempting sign-in...");
        const userCredential = await firebase.auth().signInWithEmailAndPassword("extension@chessyme.com", "ChessyBotPassword123!");
        currentUser = userCredential.user;
        console.log("✅ Successfully signed in! Bot UID:", currentUser.uid);
    } else {
        console.log("✅ Already signed in as Bot UID:", currentUser.uid);
    }

    // STEP 2: Read the Pool
    console.log("Attempting to read from premium_pool...");
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));
    const poolRef = db.collection("premium_pool");
    
    const snapshot = await poolRef.where("expiry_date", ">", twoDaysFromNow).get();
    console.log(`✅ Successfully read pool. Found ${snapshot.size} valid accounts.`);

    if (snapshot.empty) {
      console.warn("⚠️ No available premium accounts with > 2 days expiry found.");
      return;
    }

    // STEP 3: Pick an Account
    const validAccounts = snapshot.docs;
    const randomIndex = Math.floor(Math.random() * validAccounts.length);
    const selectedAccount = validAccounts[randomIndex].data();
    console.log("✅ Selected new username:", selectedAccount.username);

    // STEP 4: Update the User Document
    console.log(`Attempting to update user document for userId: ${userId}...`);
    await db.collection("users").doc(userId).update({
      PremiumUsername: selectedAccount.username,
      password: selectedAccount.password
    });
    
    console.log("✅ --- ROTATION COMPLETE ---");
    
  } catch (error) {
    // This will catch exactly which step broke
    console.error("❌ ROTATION FAILED:", error.message);
    if (error.code) console.error("Error Code:", error.code);
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

function wipeChessCookies() {
  chrome.cookies.getAll({ domain: "chess.com" }, (cookies) => {
    if (cookies.length === 0) {
      return;
    }

    for (let cookie of cookies) {
      // Strip the leading dot (e.g., ".chess.com" becomes "chess.com")
      const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      
      // Reconstruct the URL exactly as Chrome requires
      const protocol = cookie.secure ? "https:" : "http:";
      const cookieUrl = `${protocol}//${cleanDomain}${cookie.path}`;
      
      // Remove the cookie
      chrome.cookies.remove({
        url: cookieUrl,
        name: cookie.name
      }, (details) => {
        if (chrome.runtime.lastError) {
           console.error(`Failed to remove ${cookie.name}:`, chrome.runtime.lastError);
        }
      });
    }
  });
}

// --- Real-Time Firebase Listener Setup ---
async function setupFirebaseListener() {
  if (unsubscribeFromFirestore) {
    unsubscribeFromFirestore();
  }
  
  const { userId } = await chrome.storage.local.get('userId');
  if (!userId) {
    return;
  }

  const userDocRef = db.collection("users").doc(userId);
  
  unsubscribeFromFirestore = userDocRef.onSnapshot(async (doc) => {
    await restoreAdblockState();
  }, (error) => {
    console.error("Firebase listener error:", error);
  });
}

// --- Functions to be injected into the webpage (No Changes) ---
function injectLoginOverlay() {
  // NEW: Check if it already exists so we don't create duplicates
    if (document.getElementById('extension-login-overlay')) return;

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

// --- NEW: Function to inject ONLY the password and submit ---
function fillPasswordAndSubmit(pass) {
    const passwordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login');
    if (passwordInput && loginButton) {
        passwordInput.value = pass;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => { loginButton.click(); }, 100);
    }
}
// --- NEW: Function to dynamically update the overlay text and handle countdowns ---
function updateOverlayMessage(newText, countdownSeconds = 0, isWarning = false) {
    const msgEl = document.querySelector('#extension-login-overlay .message');
    if (!msgEl) return;
    
    // Clear any existing countdown interval to prevent overlapping timers
    if (window.overlayInterval) {
        clearInterval(window.overlayInterval);
    }
    
    msgEl.style.color = isWarning ? "#fbbc05" : "rgba(255, 255, 255, 0.85)";
    
    if (countdownSeconds > 0) {
        let timeLeft = countdownSeconds;
        msgEl.innerText = `${newText} (${timeLeft}s)`;
        window.overlayInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft > 0) {
                msgEl.innerText = `${newText} (${timeLeft}s)`;
            } else {
                clearInterval(window.overlayInterval);
            }
        }, 1000);
    } else {
        msgEl.innerText = newText;
    }
}

// --- Message Listeners ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SYNC_AUTH') {
      chrome.storage.local.set({
          userId: request.uid,
          token: request.token,
          firstName: request.firstName || "User",
          lastSynced: Date.now()
      }, () => {
          sendResponse({ success: true });
      });
      return true; 
  }

  // --- NEW: Handle Logout ---
    if (request.action === 'SYNC_LOGOUT') {
        // Remove the stored user data
        chrome.storage.local.remove(['userId', 'token', 'lastSynced'], () => {
            sendResponse({ success: true });
        });
        return true; 
    }

    // --- NEW: Auto Login for Mobile/Lemur ---
    if (request.action === "startAutoLogin") {
      (async () => {
        const { userId } = await chrome.storage.local.get('userId');
        const userStatus = await checkUserPlanStatus(userId);

        // 1. Check if the plan is completely missing or expired
        if (!userStatus || !userStatus.isActive) {
          const message = userStatus && !userStatus.isActive ? "Your plan has expired. Please contact support. Buy a Plan !! " : "You do not have a plan to use this feature. Buy a Plan !!";
          sendResponse({ success: false, message: message });
          return;
        }

        // 2. NEW: Check if the specific Review feature is enabled
        if (!userStatus.isReviewEnabled) {
          sendResponse({ success: false, message: "You do not have permission to use the Auto Login feature. Buy a Plan !!" });
          return;
        }

        // 3. Check for credentials
        if (!userStatus.PremiumUsername || !userStatus.password) {
          sendResponse({ success: false, message: "Premium username or password missing in your profile." });
          return;
        }

        // Tell popup it was successful so it can close the window
        sendResponse({ success: true });

        // Record the exact time they are starting the session
        await chrome.storage.local.set({ lastLoginTime: Date.now() });

        // Step 1: Wipe existing cookies so the login page actually loads
        await wipeChessCookies();

        // NEW: Trigger the credential rotation asynchronously for the NEXT login
        rotateUserCredentials(userId);

        // Step 2: Open a standard tab for the login page
        // Step 2: Open a standard tab for the login page
        chrome.tabs.create({ url: 'https://www.chess.com/login' }, (newTab) => {
          if (!newTab || !newTab.id) return;

          const tabId = newTab.id;
          let hasAttemptedInitialLogin = false; 

          const listener = (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId) {
              
              // SUCCESS OUTCOMES
              if (tab.url.includes('chess.com/home') || tab.url === 'https://www.chess.com/' || tab.url.includes('/analysis/game/live/')) {
                chrome.tabs.remove(tabId);
                chrome.tabs.onUpdated.removeListener(listener);
                return;
              }

              // INITIAL LOAD
              if (changeInfo.status === 'complete' && tab.url.includes('login') && !hasAttemptedInitialLogin) {
                hasAttemptedInitialLogin = true;

                // ATTEMPT 1: Inject UI and Credentials
                chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['overlay.css'] });
                chrome.scripting.executeScript({ target: { tabId: tabId }, func: injectLoginOverlay });
                
                // Set text to Initializing
                chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["Attempt 1: Injecting Credentials...", 0, false] });
                
                chrome.scripting.executeScript({ 
                    target: { tabId: tabId }, 
                    func: fillAndSubmitLoginForm, 
                    args: [userStatus.PremiumUsername, userStatus.password] 
                });

                // Set text to waiting for 3 seconds
                setTimeout(() => {
                    chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["Verifying Login...", 3, false] });
                }, 200); // Slight delay to ensure click registered before countdown starts

                // --- WAIT 3 SECONDS FOR ATTEMPT 1 RESULT ---
                setTimeout(() => {
                  chrome.tabs.get(tabId, (currentTab) => {
                    if (chrome.runtime.lastError || !currentTab) return;
                    
                    if (currentTab.url.includes('login')) {
                      
                      // ATTEMPT 2: Inject Password only
                      chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['overlay.css'] }).catch(()=>{});
                      chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["Attempt 2: Re-injecting Password...", 0, false] });
                      
                      chrome.scripting.executeScript({ 
                          target: { tabId: tabId }, 
                          func: fillPasswordAndSubmit, 
                          args: [userStatus.password] 
                      });
                      
                      // Set text to waiting for 10 seconds (CAPTCHA WARNING)
                      setTimeout(() => {
                          chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["PLEASE SOLVE CAPTCHA IF VISIBLE", 10, true] });
                      }, 200);

                      // --- WAIT 10 SECONDS FOR ATTEMPT 2 RESULT (HUMAN CAPTCHA TIME) ---
                      setTimeout(() => {
                        chrome.tabs.get(tabId, (finalTab) => {
                          if (chrome.runtime.lastError || !finalTab) return;
                          
                          if (finalTab.url.includes('login')) {
                            
                            // ATTEMPT 3: Final Password Injection
                            chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['overlay.css'] }).catch(()=>{});
                            chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["Final Attempt: Submitting...", 0, false] });
                            
                            chrome.scripting.executeScript({ 
                                target: { tabId: tabId }, 
                                func: fillPasswordAndSubmit, 
                                args: [userStatus.password] 
                            });

                            // After the final attempt, change the text to a failure state if it gets stuck
                            setTimeout(() => {
                                chrome.scripting.executeScript({ target: { tabId: tabId }, func: updateOverlayMessage, args: ["Login Failed. Please close and try again.", 0, true] });
                            }, 5000);
                          }
                        });
                      }, 10000); // 10 second CAPTCHA wait
                    }
                  });
                }, 3000); // 3 second wait for Attempt 1
              }
            }
          };

          chrome.tabs.onUpdated.addListener(listener);
        });
      })();
      return true;
    }

  if (request.action === "startReview") {
    (async () => {
      const { userId } = await chrome.storage.local.get('userId');
      const userStatus = await checkUserPlanStatus(userId);

      if (!userStatus || !userStatus.isReviewEnabled) {
        const message = userStatus && !userStatus.isActive ? "Your plan has expired. Please contact support. Buy a Plan !! " : "You do not have permission to use the Review feature. Buy a Plan !!";
        sendResponse({ success: false, message: message });
        return;
      }
      if (!userStatus.PremiumUsername || !userStatus.password) {
        sendResponse({ success: false, message: "Premium username or password missing in your profile." });
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
              chrome.scripting.executeScript({ target: { tabId: tabId }, func: fillAndSubmitLoginForm, args: [userStatus.PremiumUsername, userStatus.password] });
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
        }).catch(e => {
        });
      }
    });
  }
});
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) updateIconState(tab.id, tab.url);
  });
});

// --- Continuous Session Alarm ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "sessionEnforcer") {
        const { userId, lastLoginTime } = await chrome.storage.local.get(['userId', 'lastLoginTime']);
        const userStatus = await checkUserPlanStatus(userId);
        
        // Condition 1: Expired plan
        if (!userStatus || !userStatus.isActive) {
            wipeChessCookies();
            chrome.storage.local.remove('lastLoginTime'); 
            return;
        }

        // Condition 2: 24-Hour Forced Rotation limit
        const SESSION_LIMIT_MS = 12 * 60 * 60 * 1000; 

        if (lastLoginTime && (Date.now() - lastLoginTime > SESSION_LIMIT_MS)) {
            wipeChessCookies();
            chrome.storage.local.remove('lastLoginTime'); 
        }
    }
});

function updateIconState(tabId, url) {
  const isAllowedPage = url && (
    url.includes('chess.com') ||
    url.includes('localhost') ||
    url.includes('chessy-me-website.web.app') ||
    url.includes('dogchess.web.app') ||
    url.includes('dogchess.shop')
  );

  chrome.action[isAllowedPage ? 'enable' : 'disable'](tabId);
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

// Change this to use chrome.runtime.sendMessage (no ID required)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    // We remove the hardcoded ID check and accept the broadcast
    if (request.action === 'SYNC_AUTH') {
        chrome.storage.local.set({
            userId: request.uid,
            token: request.token,
            firstName: request.firstName || "User",
            lastSynced: Date.now()
        }, () => {
            setupFirebaseListener();
            restoreAdblockState();
            sendResponse({ success: true });
        });
    }
    return true; 
});