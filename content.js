// --- UN-SPOOFABLE MOBILE DETECTION ---
// 1. userAgentData.platform gets the true OS at the hardware level (ignores "Desktop mode" spoofing).
// 2. maxTouchPoints checks if the device physically has a touchscreen.
// 3. The fallback regex checks the standard string just in case.
const isHardwareMobile = 
    (navigator.userAgentData && navigator.userAgentData.platform === "Android") || 
    (navigator.maxTouchPoints > 0 && /Linux|Android/i.test(navigator.platform)) ||
    /Android/i.test(navigator.userAgent);

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

} else {
}

// --- COMMUNICATION BRIDGE ---
window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;

    if (event.data.action === 'SYNC_AUTH') {
        chrome.runtime.sendMessage(event.data);
    }
});