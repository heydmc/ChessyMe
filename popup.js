// --- START: New Element Selectors ---
const mainView = document.querySelector('.main-view');
const initialAuthView = document.getElementById('initial-auth-view');
const loginFormContainer = document.getElementById('login-form-container');
const loggedInView = document.getElementById('logged-in-view');
const verificationView = document.getElementById('verification-view');


const showLoginFormBtn = document.getElementById('show-login-form-btn');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');

const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const authError = document.getElementById('auth-error');
const authStatus = document.getElementById('auth-status');
// --- END: New Element Selectors ---


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




async function createNewUserInFirestore(user) {
  console.log("Creating new user profile in Firestore...");
  const userRef = db.collection("email_pw_users").doc(user.uid);

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
    //await signOut();
    throw error;
  }
}

// --- START: New Authentication Logic ---

// Main listener that checks if a user is logged in or not
auth.onAuthStateChanged(user => {
  hideError();
  if (user) {
    // User IS logged in
    mainView.style.display = 'block'; // Show the main buttons
    initialAuthView.style.display = 'none';
    loginFormContainer.style.display = 'none';
    loggedInView.style.display = 'block'; // Show the "Welcome/Logout" section
    
    authStatus.textContent = `Signed in as: ${user.email.substring(0, 15)}...`;

    chrome.storage.local.set({ userId: user.uid });
    chrome.runtime.sendMessage({ action: "configUpdated" });

  } else {
    // User IS NOT logged in
    mainView.style.display = 'block'; // Hide the main buttons
    initialAuthView.style.display = 'block'; // Show the initial "Login / Sign Up" button
    loginFormContainer.style.display = 'none'; // Ensure form is hidden
    loggedInView.style.display = 'none';

    chrome.storage.local.remove('userId');
  }
});

// Listener for the initial "Login / Sign Up" button
showLoginFormBtn.addEventListener('click', () => {
  hideError();
  initialAuthView.style.display = 'none';
  mainView.style.display = 'none';
  loginFormContainer.style.display = 'block';
});

// Listener for the final "Login" button
loginBtn.addEventListener('click', () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  authError.textContent = '';

  if (!email || !password) {
    authError.textContent = 'Email and password cannot be empty.';
    return;
  }

  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // --- START: New Verification Check ---
      const user = userCredential.user;
      if (user.emailVerified) {
        // This is the successful login path.
        // The onAuthStateChanged listener will handle showing the main view.
        console.log("Email is verified. User logged in.");
      } else {
        // If the email is NOT verified, inform the user and log them out.
        authError.textContent = 'Please verify your email before logging in.(CHeck Spam box too if email not found)';
        auth.signOut();
      }
      // --- END: New Verification Check ---
    })
    .catch(error => {
      console.error('Login Error:', error);
      switch (error.code) {
        case 'auth/invalid-login-credentials':
          authError.textContent = 'Incorrect Details. Please Try Again.';
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-login-credentials':
          authError.textContent = 'Incorrect password. Please try again.';
          break;
        default:
          authError.textContent = 'An error occurred during login.';
          break;
      }
    });
});

// Listener for the "Sign Up" button
signupBtn.addEventListener('click', () => {
  mainView.style.display = 'none'; 
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  authError.textContent = '';

  if (!email || !password) {
    authError.textContent = 'Email and password cannot be empty.';
    return;
  }
  if (password.length < 6) {
    authError.textContent = 'Password must be at least 6 characters.';
    return;
  }

  // --- START: New Verification Flow ---
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      

      createNewUserInFirestore(auth.currentUser);
      // Send the verification email
      return user.sendEmailVerification();
    })
    .then(() => {
      
    
    loginFormContainer.style.display = 'none';
    verificationView.style.display = 'block';
    // --- END: Corrected Code ---


      // It's good practice to sign the user out until they are verified
      auth.signOut();
    })
    .catch(error => {
      // ... (existing error handling code remains the same) ...
      console.error("Firebase returned an error:", error);
      if (error.code === 'auth/email-already-in-use') {
        authError.textContent = 'Email is already registered. Please Login.';
      } else if (error.code === 'auth/invalid-email') {
        authError.textContent = 'Please enter a valid email address.';
      } else {
        authError.textContent = 'Sign up failed. Please try again.';
      }
    });



// Add this new listener to popup.js
document.getElementById('verified-btn').addEventListener('click', async () => {
  if (!auth.currentUser) {
    // This can happen if the popup was closed and reopened.
    // We gently guide them back to the login page.
    //alert("Please log in with your newly verified credentials.");
    verificationView.style.display = 'none';
    loginFormContainer.style.display = 'block';
    return;
  }
  
  // Reload the user's profile from Firebase to get the latest status
  await auth.currentUser.reload();
  
  if (auth.currentUser.emailVerified) {
    alert("Verification successful! You can now log in.");
    verificationView.style.display = 'none';
    loginFormContainer.style.display = 'block';
  } else {
    alert("Your email is not verified yet. Please check your inbox and click the verification link.");
  }
});


  // --- END: New Verification Flow ---
});
// Listener for the "Logout" button
logoutBtn.addEventListener('click', () => {
  auth.signOut();
});
// --- END: New Authentication Logic ---



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
  loadCoupons(); 
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

