// This file contains the content script that runs in the context of web pages.
// It reads specific data from the website's DOM and sends that data to the background script or popup.

document.addEventListener('mousedown', function(event) {
    if (event.button === 1 && window.location.href.includes('docs.google.com/spreadsheets')) {
        const cell = Array.from(document.getElementsByClassName('cell-input'))?.find(e => !e.id)?.innerText?.replace('\n','') ?? '';
        // Check if cell is truthy and only consists of numbers
        if (cell && !isNaN(cell)) {
            chrome.runtime.sendMessage({ type: 'CELL_MIDDLE_CLICK', value: cell });
        }
    }
});