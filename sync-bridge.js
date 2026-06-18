console.log("🟢🟢🟢 BRIDGE SCRIPT INJECTED AND LISTENING! 🟢🟢🟢");

window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;

    // 1. Answer the Ping on page load
    if (event.data && event.data.action === 'PING_EXTENSION') {
        console.log("🏓 Bridge heard PING! Checking extension storage...");
        chrome.storage.local.get(['userId'], (data) => {
            console.log("🏓 Storage result:", data.userId ? "Found ID" : "No ID");
            window.postMessage({
                action: 'EXTENSION_STATUS',
                connected: !!data.userId 
            }, window.location.origin);
        });
        return;
    }

    // 2. Forward Auth and wait for success confirmation
    if (event.data && event.data.action === 'SYNC_AUTH') {
        console.log("🚀 Bridge forwarding SYNC_AUTH to background...");
        
        // Pass a callback to hear back from background.js
        chrome.runtime.sendMessage(event.data, (response) => {
            if (response && response.success) {
                console.log("✅ Background confirmed sync! Instantly telling dashboard...");
                window.postMessage({ 
                    action: 'EXTENSION_STATUS', 
                    connected: true 
                }, window.location.origin);
            }
        });
    }

    // 3. Forward Logout
    if (event.data && event.data.action === 'SYNC_LOGOUT') {
        console.log("🚀 Bridge forwarding SYNC_LOGOUT to background...");
        chrome.runtime.sendMessage(event.data);
    }
});