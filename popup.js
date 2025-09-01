// --- START: FIREBASE CONFIGURATION ---
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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// --- END: FIREBASE CONFIGURATION ---

// --- Main Authentication Logic ---
async function signIn() {
  const authBtn = document.getElementById('auth-btn');
  authBtn.disabled = true;
  authBtn.textContent = "Signing in...";
  hideError();

  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ 'interactive': true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });

    const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
    const result = await auth.signInWithCredential(credential);
    const user = result.user;

    if (result.additionalUserInfo.isNewUser) {
      await createNewUserInFirestore(user);
    }

    await chrome.storage.local.set({ userId: user.uid });
    chrome.runtime.sendMessage({ action: "configUpdated" });

  } catch (error) {
    console.error("Authentication failed:", error);
    showError("Authentication Failed: " + error.message);
    updatePopupUI(null);
  }
}

async function signOut() {
  hideError();
  try {
    await auth.signOut();
    await chrome.storage.local.remove('userId');
    console.log("User signed out successfully.");
  } catch (error) {
    console.error("Sign out failed:", error);
    showError("Sign out failed: " + error.message);
  }
}

async function createNewUserInFirestore(user) {
  console.log("Creating new user profile in Firestore...");
  const userRef = db.collection("users").doc(user.uid);

  try {
    await userRef.set({
      email: user.email,
      displayName: user.displayName,
      isAdblockEnabled: false,
      isReviewEnabled: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    console.log("Successfully created new user profile.");
  } catch (error) {
    console.error("Failed to create new user profile:", error);
    await signOut();
    throw error;
  }
}

// --- UI and Event Listeners ---
function updatePopupUI(user) {
  const authBtn = document.getElementById('auth-btn');
  const authStatus = document.getElementById('auth-status');
  
  authBtn.disabled = false;

  if (user) {
    authStatus.textContent = `Signed in as: ${user.email}`;
    authBtn.textContent = 'Sign Out';
    authBtn.onclick = signOut;
    hideError();
  } else {
    authStatus.textContent = 'You are not signed in.';
    authBtn.textContent = 'Sign In with Google';
    authBtn.onclick = signIn;
  }
}

// --- Error Handling ---
const errorMessage = document.getElementById('error-message');
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
}
function hideError() {
    errorMessage.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  // --- Global Elements & State ---
  const mainView = document.querySelector('.main-view');
  const buyPlanView = document.getElementById('buy-plan-view');
  let firestoreCoupons = {};
  let appliedCoupon = null; // Will store the full coupon object {code, discount, whatsappNumber}

  // --- Fetch Coupons from Firestore ---
  async function loadCoupons() {
      try {
          const snapshot = await db.collection("coupons").get();
          snapshot.forEach(doc => {
              firestoreCoupons[doc.id] = doc.data();
          });
          console.log("Successfully loaded coupons:", firestoreCoupons);
      } catch (error) {
          console.error("Error loading coupons:", error);
          showError("Could not load coupon data.");
      }
  }

  // --- View Switching ---
  document.getElementById('buy-plan-btn').addEventListener('click', () => {
    if (!auth.currentUser) {
        showError("Please sign in to buy a plan.");
        return;
    }
    mainView.style.display = 'none';
    buyPlanView.style.display = 'block';
    hideError();
  });
  document.getElementById('back-btn').addEventListener('click', () => {
    mainView.style.display = 'block';
    buyPlanView.style.display = 'none';
    hideError();
  });

  // --- Auth State Change Listener & Initial Load ---
  auth.onAuthStateChanged(user => {
    updatePopupUI(user);
    if (user) {
        chrome.storage.local.set({ userId: user.uid });
        loadCoupons(); // Load coupons only when user is signed in
    }
  });

  // --- Main Button Action Listeners ---
  document.getElementById('review-btn').addEventListener('click', () => {
    if (!auth.currentUser) {
        showError("Please sign in to use this feature.");
        return;
    }
    hideError();
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const currentUrl = tabs[0].url;
      const regex = /(?:game|analysis)(?:.*\/)(\d{10,})/;
      const match = currentUrl.match(regex);

      if (match && match[1]) {
        const gameId = match[1];
        chrome.runtime.sendMessage({ action: "startReview", gameId: gameId }, (response) => {
          if (chrome.runtime.lastError) {
            showError("An unexpected error occurred.");
            console.error(chrome.runtime.lastError.message);
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
    if (!auth.currentUser) {
        showError("Please sign in to use this feature.");
        return;
    }
    hideError();
    chrome.runtime.sendMessage({ action: "toggleAdblock" }, (response) => {
      if (chrome.runtime.lastError) {
        showError("An unexpected error occurred.");
        console.error(chrome.runtime.lastError.message);
      } else if (response && response.success) {
        window.close();
      } else if (response && !response.success) {
        showError(response.message);
      }
    });
  });

  document.getElementById('how-to-use-btn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.google.com' });
      window.close();
  });
  
  // --- Buy Plan & Coupon Logic ---
  const daysInput = document.getElementById('days-input');
  const priceDisplay = document.getElementById('price-display');
  const couponSection = document.getElementById('coupon-section');
  const couponInput = document.getElementById('coupon-input');

  function updatePrice() {
    const days = parseInt(daysInput.value, 10) || 0;
    let finalPrice = days * 5;
    const originalPrice = finalPrice;

    if (appliedCoupon) {
        const discountPercentage = appliedCoupon.discount;
        finalPrice = Math.round(originalPrice - (originalPrice * discountPercentage / 100));
        priceDisplay.innerHTML = `<span class="original-price">₹${originalPrice}</span> ₹${finalPrice}`;
    } else {
        priceDisplay.textContent = `Price: ₹${finalPrice}`;
    }
  }

  daysInput.addEventListener('input', updatePrice);
  
  document.getElementById('show-coupon-btn').addEventListener('click', () => {
    couponSection.style.display = couponSection.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('apply-coupon-btn').addEventListener('click', () => {
    const code = couponInput.value.toUpperCase();
    if (firestoreCoupons[code]) {
        appliedCoupon = { code, ...firestoreCoupons[code] };
        updatePrice();
        showError(`Success! ${appliedCoupon.discount}% discount applied.`);
    } else {
        appliedCoupon = null;
        updatePrice();
        showError("Invalid coupon code.");
    }
  });

  document.getElementById('buy-now-btn').addEventListener('click', () => {
    const days = parseInt(daysInput.value, 10) || 0;
    if (days <= 0) {
      showError("Please enter a valid number of days.");
      return;
    }

    const userEmail = auth.currentUser.email;
    const originalPrice = days * 5;
    let finalPrice = originalPrice;
    
    // Determine which WhatsApp number to use
    const defaultWhatsappNumber = '918338851532';
    const whatsappNumber = appliedCoupon ? appliedCoupon.whatsappNumber : defaultWhatsappNumber;
    
    let message = `Hi, I'd like to buy a ${days}-day plan for the user: ${userEmail}.`;

    if (appliedCoupon) {
        finalPrice = Math.round(originalPrice - (originalPrice * appliedCoupon.discount / 100));
        message += `\nOriginal Price: ₹${originalPrice}, Coupon Applied: ${appliedCoupon.code}, Final Price: ₹${finalPrice}.`;
    } else {
        message += `\nPrice: ₹${originalPrice}.`;
    }

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    chrome.tabs.create({ url: whatsappUrl });
    window.close();
  });

  document.getElementById('trial-btn').addEventListener('click', () => {
      const userEmail = auth.currentUser ? auth.currentUser.email : 'Unknown User';
      const message = `Hi, I'd like to start my 3-day free trial for the Chess.com Tools extension. My email is ${userEmail}.`;
      const whatsappUrl = `https://wa.me/918338851532?text=${encodeURIComponent(message)}`;
      chrome.tabs.create({ url: whatsappUrl });
      window.close();
  });
});

