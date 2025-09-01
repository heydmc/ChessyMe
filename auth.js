// This file is nearly identical to the auth logic in popup.js

document.addEventListener('DOMContentLoaded', function() {
  const firebaseConfig = {
    apiKey: "AIzaSyCIXV1YAUOh1gsRRYqGDek-O_rxbF8H0fQ",
    authDomain: "chess-extension-v2.firebaseapp.com",
    projectId: "chess-extension-v2",
    storageBucket: "chess-extension-v2.appspot.com",
    messagingSenderId: "895038512670",
    appId: "1:895038512670:web:dca811ffe539705f89580f",
    measurementId: "G-KD3X3RY26V"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  const phoneEntryView = document.getElementById('phone-entry-view');
  const phoneNumberInput = document.getElementById('phoneNumber');
  const sendOtpButton = document.getElementById('send-otp-btn');
  const phoneError = document.getElementById('phone-error');
  const otpVerifyView = document.getElementById('otp-verify-view');
  const otpCodeInput = document.getElementById('otpCode');
  const verifyOtpButton = document.getElementById('verify-otp-btn');
  const otpError = document.getElementById('otp-error');
  const authSuccessView = document.getElementById('auth-success-view');

  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    'size': 'invisible'
  });

  sendOtpButton.addEventListener('click', () => {
    phoneError.textContent = '';
    const fullPhoneNumber = phoneNumberInput.value;
    if (!/^\+\d{12}$/.test(fullPhoneNumber)) {
        phoneError.textContent = 'Please enter a valid number with country code (e.g., +919876543210).';
        return;
    }
    const appVerifier = window.recaptchaVerifier;
    auth.signInWithPhoneNumber(fullPhoneNumber, appVerifier)
      .then((confirmationResult) => {
        window.confirmationResult = confirmationResult;
        phoneEntryView.style.display = 'none';
        otpVerifyView.style.display = 'block';
      }).catch((error) => {
        console.error("Error sending OTP:", error);
        phoneError.textContent = 'Could not send code. Check number or console.';
        recaptchaVerifier.render().then(widgetId => recaptchaVerifier.reset(widgetId));
      });
  });

  verifyOtpButton.addEventListener('click', () => {
    otpError.textContent = '';
    const code = otpCodeInput.value;
    window.confirmationResult.confirm(code).then((result) => {
      const isNewUser = result.additionalUserInfo.isNewUser;
      if (isNewUser) {
        assignCredentialToNewUser(result.user.phoneNumber);
      } else {
        saveUserIdAndShowSuccess(result.user.phoneNumber);
      }
    }).catch((error) => {
      otpError.textContent = 'Invalid code.';
    });
  });

  function assignCredentialToNewUser(phoneNumber) {
    const userPlanExpiry = new Date();
    userPlanExpiry.setDate(userPlanExpiry.getDate() + 2);
    db.runTransaction((transaction) => {
      const availableCredentialQuery = db.collection("credentials")
        .where("status", "==", "available")
        .where("expiryDate", ">", new Date())
        .limit(1);
      return transaction.get(availableCredentialQuery).then((snapshot) => {
        if (snapshot.empty) throw "No available accounts.";
        const credentialDoc = snapshot.docs[0];
        transaction.update(credentialDoc.ref, { status: "assigned", assignedTo: phoneNumber });
        const newUserRef = db.collection("users").doc(phoneNumber);
        transaction.set(newUserRef, {
          isAdblockEnabled: true,
          isReviewEnabled: true,
          username: credentialDoc.data().username,
          password: credentialDoc.data().password,
          assignedCredentialId: credentialDoc.id,
          credential_expiry: credentialDoc.data().expiryDate,
          user_plan_expiry: userPlanExpiry
        });
      });
    }).then(() => {
      saveUserIdAndShowSuccess(phoneNumber);
    }).catch((error) => {
      otpError.textContent = error.toString();
    });
  }

  function saveUserIdAndShowSuccess(userId) {
    chrome.storage.local.set({ userId: userId }, () => {
      otpVerifyView.style.display = 'none';
      authSuccessView.style.display = 'block';
      chrome.runtime.sendMessage({ action: "configUpdated" });
    });
  }
});