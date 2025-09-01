// This function runs when the script is injected into a Chess.com page

// 1. Create the button element
const reviewButton = document.createElement('button');
reviewButton.id = 'premium-review-button'; // Use the ID from your CSS
reviewButton.innerText = 'Review';

// 2. Add a click listener to the button
reviewButton.addEventListener('click', () => {
  // Get the URL from the page itself
  const currentUrl = window.location.href;
  
  // Updated regex to handle different game URLs like /live/ and /daily/
  const regex = /(?:game|analysis)(?:.*\/)(\d{10,})/
  const match = currentUrl.match(regex);

  if (match && match[1]) {
    const gameId = match[1];
    
    // --- THIS IS THE FIX ---
    // We now listen for a response from the background script.
    chrome.runtime.sendMessage({ action: "startReview", gameId: gameId }, (response) => {
      if (chrome.runtime.lastError) {
        // Handle cases where the background script couldn't be reached.
        alert("An error occurred. Please try again.");
        console.error(chrome.runtime.lastError.message);
      } else if (response && !response.success) {
        // If the background script sends back a failure message, show it.
        alert(response.message);
      }
      // If successful, no alert is needed as the new window will open.
    });
    
  } else {
    alert("Could not find a valid Chess.com game ID on this page.");
  }
});

// 3. Append the button to the page's body
document.body.appendChild(reviewButton);