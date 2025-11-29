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
    const MAX_MONTHS_TO_CHECK = 24; // Maximum months of history to search
    
    try {
        const parser = new DOMParser();
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1; // 1-based
        const currentYear = currentDate.getFullYear();
        
        // Calculate previous month (1-based)
        let previousMonth;
        let previousYear;
        if (currentMonth === 1) {
            previousMonth = 12;
            previousYear = currentYear - 1;
        } else {
            previousMonth = currentMonth - 1;
            previousYear = currentYear;
        }
        
        // Helper function to calculate month/year for a given offset from current month
        function getMonthYear(offset) {
            let month = currentMonth - offset;
            let year = currentYear;
            while (month <= 0) {
                month += 12;
                year -= 1;
            }
            return { month, year };
        }
        
        let mostRecentDate = null;
        let foundDelivery = false;
        let consecutiveFailures = 0;
        
        // Check months backwards starting from current month
        // Stop when we find a month with deliveries
        for (let i = 0; i < MAX_MONTHS_TO_CHECK && !foundDelivery; i++) {
            const { month: checkMonth, year: checkYear } = getMonthYear(i);
            
            // Fetch logbook for this specific month
            const logbookResponse = await fetch(`https://trucksbook.eu/logbook/${userId}/${checkYear}/${checkMonth}/0/`);
            if (!logbookResponse.ok) {
                consecutiveFailures++;
                if (consecutiveFailures >= 3) {
                    console.warn('Multiple consecutive fetch failures, possible connectivity issue');
                }
                continue;
            }
            consecutiveFailures = 0; // Reset on success
            
            const logbookHtml = await logbookResponse.text();
            const logbookDoc = parser.parseFromString(logbookHtml, 'text/html');
            
            // Try to find the delivery table using the original code's approach
            // The original code used: logbookDoc.getElementById('monthselectmodal').parentNode.children[1].children[1].children[1].children
            // This navigates to a specific table structure containing deliveries
            const monthSelectModal = logbookDoc.getElementById('monthselectmodal');
            if (!monthSelectModal) {
                continue;
            }
            
            try {
                // Navigate to the delivery table rows (same structure as original code)
                const deliveryTable = monthSelectModal.parentNode.children[1].children[1].children[1];
                if (!deliveryTable || !deliveryTable.children || deliveryTable.children.length === 0) {
                    // No deliveries in this month
                    continue;
                }
                
                // Get all delivery rows
                const deliveryRows = Array.from(deliveryTable.children);
                
                if (deliveryRows.length === 0) {
                    continue;
                }
                
                // Find the most recent delivery in this month
                // Deliveries should be sorted, but we'll check all to find the most recent
                for (const row of deliveryRows) {
                    // Look for the delivery link/element with data-time
                    const timeElements = row.querySelectorAll('[data-time]');
                    for (const element of timeElements) {
                        const timeValue = element.dataset.time;
                        if (timeValue) {
                            const date = new Date(timeValue);
                            if (!isNaN(date.getTime())) {
                                if (!mostRecentDate || date > mostRecentDate) {
                                    mostRecentDate = date;
                                }
                                foundDelivery = true;
                            }
                        }
                    }
                }
            } catch (domError) {
                // DOM structure didn't match expected format, try next month
                console.warn('Could not parse logbook structure for', checkMonth, checkYear);
                continue;
            }
        }
        
        if (!mostRecentDate) {
            resultContainer.innerText = 'No deliveries found';
            resultContainer.classList.remove('hidden');
            return;
        }
        
        const lastMonth = mostRecentDate.getMonth() + 1; // Convert to 1-based
        const lastYear = mostRecentDate.getFullYear();
        
        // Check if the last delivery is in the current month or the previous month
        const isCurrentMonth = (lastYear === currentYear && lastMonth === currentMonth);
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