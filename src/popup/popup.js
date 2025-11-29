var resultContainer = null;

document.addEventListener('DOMContentLoaded', function() {
    const fetchDataButton = document.getElementById('fetch-data');
    const resultElement = document.getElementById('result');
    const trucksbookUrlPattern = /trucksbook\.eu/;
    resultContainer = document.getElementById('result');

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        if (trucksbookUrlPattern.test(currentTab.url)) {
            fetchDataButton.style.display = 'block';
            resultElement.classList.remove('no-button');
        } else {
            fetchDataButton.style.display = 'none';
            resultElement.classList.add('no-button');
        }
    });

    fetchDataButton.addEventListener('click', function() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            // Show the result container
            resultContainer.classList.remove('hidden');
            resultContainer.innerText = 'Loading...';
            const activeTab = tabs[0];
            const tabUrl = activeTab.url;
            const userId = tabUrl.split("/")[4];
            fetchData(userId);
        });
    });

    // Fetch the stored userId from local storage
    chrome.storage.local.get('userId', function(data) {
        if (data.userId) {
            // Show the result container
            resultContainer.classList.remove('hidden');
            resultContainer.innerText = 'Loading...';
            // Fetch the data
            fetchData(data.userId);
            // Clear the stored userId
            chrome.storage.local.remove('userId');
        }
    });

    // Notify the background script that the popup is open
    const port = chrome.runtime.connect({ name: 'popup' });
});

async function fetchData(userId) {
    try {
        // Fetch the user's logbook page directly
        const logbookResponse = await fetch(`https://trucksbook.eu/logbook/${userId}`);
        if (!logbookResponse.ok) {
            resultContainer.innerText = 'Failed to fetch logbook data';
            resultContainer.classList.remove('hidden');
            return;
        }
        
        const logbookHtml = await logbookResponse.text();
        const parser = new DOMParser();
        const logbookDoc = parser.parseFromString(logbookHtml, 'text/html');
        
        // Find the most recent delivery entry by looking for time elements with data-time attribute
        const timeElements = logbookDoc.querySelectorAll('[data-time]');
        
        if (timeElements.length === 0) {
            resultContainer.innerText = 'No deliveries found';
            resultContainer.classList.remove('hidden');
            return;
        }
        
        // Find the most recent delivery date from time elements
        let mostRecentDate = null;
        for (const element of timeElements) {
            const timeValue = element.dataset.time;
            if (timeValue) {
                const date = new Date(timeValue);
                if (!isNaN(date.getTime())) {
                    if (!mostRecentDate || date > mostRecentDate) {
                        mostRecentDate = date;
                    }
                }
            }
        }
        
        if (!mostRecentDate) {
            resultContainer.innerText = 'No deliveries found';
            resultContainer.classList.remove('hidden');
            return;
        }
        
        // Check if user is active (last delivery within current or previous month)
        const currentDate = new Date();
        let previousMonth = currentDate.getMonth(); // getMonth() returns 0-based month
        let previousYear = currentDate.getFullYear();
        
        if (previousMonth === 0) {
            previousMonth = 12;
            previousYear -= 1;
        } else {
            // Keep as 1-based month for comparison
        }
        
        const lastMonth = mostRecentDate.getMonth() + 1; // Convert to 1-based
        const lastYear = mostRecentDate.getFullYear();
        
        // Check if the last delivery is in the current month or the previous month
        const isCurrentMonth = (lastYear === currentDate.getFullYear() && lastMonth === currentDate.getMonth() + 1);
        const isPreviousMonth = (lastYear === previousYear && lastMonth === previousMonth);
        
        if (isCurrentMonth || isPreviousMonth) {
            resultContainer.innerText = 'User is active!';
            resultContainer.classList.add('active');
        } else {
            const formattedDate = mostRecentDate.getDate().toString().padStart(2, '0') + '.' + 
                                  (mostRecentDate.getMonth() + 1).toString().padStart(2, '0') + '.' + 
                                  mostRecentDate.getFullYear();
            resultContainer.innerHTML = 'Last delivery was on <span class="red-text">' + formattedDate + '</span>';
            resultContainer.classList.remove('active');
            
            // Copy the last delivery date to the clipboard
            navigator.clipboard.writeText(formattedDate).then(() => {
                console.log('Last delivery date copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        resultContainer.innerText = 'Error fetching data. Please try again.';
    }

    // Show the result container
    resultContainer.classList.remove('hidden');
}