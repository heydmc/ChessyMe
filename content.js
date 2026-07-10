// --- UN-SPOOFABLE MOBILE DETECTION ---
// 1. userAgentData.platform gets the true OS at the hardware level (ignores "Desktop mode" spoofing).
// 2. maxTouchPoints checks if the device physically has a touchscreen.
// 3. The fallback regex checks the standard string just in case.
const isHardwareMobile = 
    (navigator.userAgentData && navigator.userAgentData.platform === "Android") || 
    (navigator.maxTouchPoints > 0 && /Linux|Android/i.test(navigator.platform)) ||
    /Android/i.test(navigator.userAgent);

function addFloatingClassToGameControls() {
  const gameControls = document.querySelectorAll(
    '.game-controls-view-component.game-controls-view-no-border-top'
  );

  gameControls.forEach((element) => {
    element.classList.add('game-controls-view-floating-bottom');

    const primaryControls = element.querySelector('.game-controls-primary-component');
    if (primaryControls) {
      primaryControls.classList.add('game-controls-primary-float');
    }
  });
}

// --- NEW: Custom Mobile Review Bar for Lemur (Updated with Exact Selectors) ---
function injectCustomMobileReviewBar() {
  const currentUrl = window.location.href;
  const isReviewOrAnalysis = currentUrl.includes('review') || currentUrl.includes('analysis');

  let customBar = document.getElementById('chessy-mobile-review-bar');

  if (!isReviewOrAnalysis) {
    if (customBar) customBar.style.display = 'none';
    return;
  }

  if (!customBar) {
    // 1. Create the sticky bar
    customBar = document.createElement('div');
    customBar.id = 'chessy-mobile-review-bar';
    customBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background-color: #262421;
      z-index: 999999;
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding: 10px 5px;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.5);
      border-top: 1px solid #3c3a38;
    `;

    // 2. Define standard styles for buttons
    const btnStyle = `
      background-color: #3e3a37;
      color: #fff;
      border: none;
      border-radius: 5px;
      padding: 16px 10px; /* 16px top/bottom, 10px left/right */
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      margin: 0 4px;
      white-space: nowrap;
    `;

    // 3. Helper to trigger native clicks dynamically using exact selectors
    const clickNativeButton = (selector) => {
      const btn = document.querySelector(selector);
      if (btn) {
          btn.click();
      }
    };

    // 4. Create Previous Button
    const prevBtn = document.createElement('button');
    prevBtn.innerText = 'Prev';
    prevBtn.style.cssText = btnStyle;
    prevBtn.onclick = () => clickNativeButton('button[aria-label="Previous Move"]');
    
    // 5. Create Explain Button
    const explainBtn = document.createElement('button');
    explainBtn.id = 'chessy-explain-btn';
    explainBtn.innerText = 'Explain';
    explainBtn.style.cssText = btnStyle + 'background-color: #4a91c1;';
    explainBtn.onclick = () => clickNativeButton('button[aria-label="Explain"]');

    // 6. Create Best Move Button
    const bestMoveBtn = document.createElement('button');
    bestMoveBtn.id = 'chessy-best-move-btn';
    bestMoveBtn.innerText = 'Best Move';
    bestMoveBtn.style.cssText = btnStyle + 'background-color: #81b64c;';
    bestMoveBtn.onclick = () => clickNativeButton('button[aria-label="Best"]');

    // 7. Create Next Button
    const nextBtn = document.createElement('button');
    nextBtn.innerText = 'Next';
    nextBtn.style.cssText = btnStyle;
    nextBtn.onclick = () => clickNativeButton('button[aria-label="Next Move"]');

    customBar.appendChild(prevBtn);
    customBar.appendChild(explainBtn);
    customBar.appendChild(bestMoveBtn);
    customBar.appendChild(nextBtn);

    document.body.appendChild(customBar);
  } else {
    customBar.style.display = 'flex';
  }

  // 8. Dynamically show/hide Explain and Best Move based on page availability
  const checkAvailability = (btnId, selector) => {
    const customBtn = document.getElementById(btnId);
    if (!customBtn) return;
    
    const nativeBtn = document.querySelector(selector);
    // Hide our custom button if the native one is missing from the DOM or hidden
    customBtn.style.display = nativeBtn ? 'flex' : 'none';
  };

  checkAvailability('chessy-best-move-btn', 'button[aria-label="Best"]');
  checkAvailability('chessy-explain-btn', 'button[aria-label="Explain"]');
}

if (isHardwareMobile) {
  function observeGameControls() {
    addFloatingClassToGameControls();
    injectCustomMobileReviewBar(); // INJECT NEW FEATURE

    const observer = new MutationObserver(() => {
      addFloatingClassToGameControls();
      injectCustomMobileReviewBar(); // INJECT NEW FEATURE
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeGameControls, { once: true });
  } else {
    observeGameControls();
  }
}

// Only inject the Blue Review button if we are strictly on a real Desktop PC
if (!isHardwareMobile) {
  // 1. Create the button element
  const reviewButton = document.createElement('button');
  reviewButton.id = 'premium-review-button';
  reviewButton.innerText = 'Review';

  // 2. Add a click listener to the button
  reviewButton.addEventListener('click', () => {
    const currentUrl = window.location.href;
    const regex = /(?:game|analysis)(?:.*\/)(\d{10,})/;
    const match = currentUrl.match(regex);

    if (match && match[1]) {
      const gameId = match[1];

      chrome.runtime.sendMessage({ action: "startReview", gameId: gameId }, (response) => {
        if (chrome.runtime.lastError) {
          alert("An error occurred. Please try again.");
          console.error(chrome.runtime.lastError.message);
        } else if (response && !response.success) {
          alert(response.message);
        }
      });
    } else {
      alert("Could not find a valid Chess.com game ID on this page.");
    }
  });

  // 3. Append the button to the page's body
  document.body.appendChild(reviewButton);
}

// --- COMMUNICATION BRIDGE ---
window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;

    if (event.data.action === 'SYNC_AUTH') {
        chrome.runtime.sendMessage(event.data);
    }
});

// Check if the extension is running in an Incognito window
if (chrome.extension.inIncognitoContext) {
    
    // 1. Create a brand new <style> element
    const incognitoStyles = document.createElement('style');
    
    // 2. Add your CSS rules directly to it (without needing the body class)
    incognitoStyles.textContent = `
        div#footer-icons,
        a[data-user-activity-key="profile"] {
            display: none !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `;
    
    // 3. Force this style block into the <head> of the document
    // We use a small interval just in case the SPA is slow to build the <head>
    const injectCSS = setInterval(() => {
        if (document.head) {
            document.head.appendChild(incognitoStyles);
            clearInterval(injectCSS);
        }
    }, 100);
}