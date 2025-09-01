window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('userId');

  if (userId) {
    // Save the User ID to chrome storage
    chrome.storage.local.set({ userId: userId }, () => {
      console.log("User ID saved successfully:", userId);
      // Notify the background script that the config has been updated
      chrome.runtime.sendMessage({ action: "configUpdated" });
      // Close this callback tab
      setTimeout(() => window.close(), 1000); 
    });
  } else {
    console.error("Auth callback did not receive a userId.");
  }
};