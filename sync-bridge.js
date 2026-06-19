window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;

    // 1. Answer the Ping on page load
    if (event.data && event.data.action === 'PING_EXTENSION') {
        chrome.storage.local.get(['userId'], (data) => {
            window.postMessage({
                action: 'EXTENSION_STATUS',
                connected: !!data.userId 
            }, window.location.origin);
        });
        return;
    }

    // 2. Forward Auth and wait for success confirmation
    if (event.data && event.data.action === 'SYNC_AUTH') {
        // Pass a callback to hear back from background.js
        chrome.runtime.sendMessage(event.data, (response) => {
            if (response && response.success) {
                window.postMessage({ 
                    action: 'EXTENSION_STATUS', 
                    connected: true 
                }, window.location.origin);
            }
        });
    }

    // 3. Forward Logout
    if (event.data && event.data.action === 'SYNC_LOGOUT') {
        chrome.runtime.sendMessage(event.data);
    }
});