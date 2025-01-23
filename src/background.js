// This file contains the background script for the Chrome extension. 
// It manages events and can communicate with other parts of the extension.

let popupOpen = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    if (message.type === 'CELL_MIDDLE_CLICK') {
        console.log('CELL_MIDDLE_CLICK received');
        if (!popupOpen) {
            console.log('Opening popup');
            // Open the popup
            chrome.action.openPopup();
            popupOpen = true;
        }
        // Store the message value in local storage to be accessed by the popup
        chrome.storage.local.set({ userId: message.value });
    }
});

chrome.runtime.onConnect.addListener((port) => {
    console.log('Port connected:', port.name);
    if (port.name === 'popup') {
        popupOpen = true;
        port.onDisconnect.addListener(() => {
            console.log('Port disconnected');
            popupOpen = false;
        });
    }
});