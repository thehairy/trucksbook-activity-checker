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
        // Try the original API endpoint first
        const etsData = await fetch(`https://trucksbook.eu/components/app/profile/game_overview_data_distance.php?user_id=${userId}&game=1&stat=0&data=distance&period=`);
        const atsData = await fetch(`https://trucksbook.eu/components/app/profile/game_overview_data_distance.php?user_id=${userId}&game=2&stat=0&data=distance&period=`);
        
        if (!etsData.ok || !atsData.ok) {
            throw new Error('API endpoint not available');
        }
        
        const etsJson = await etsData.json();
        const atsJson = await atsData.json();
        console.log(etsJson);
        console.log(atsJson);

        const etsLabels = etsJson.labels.reverse();
        const atsLabels = atsJson.labels.reverse();

        const etsDistance = etsJson.values.selected_user.reverse();
        const atsDistance = atsJson.values.selected_user.reverse();
        let lastDelivery = null;

        let etsFound = false;
        for (let i = 0; i < etsLabels.length; i++) {
            if (etsDistance[i] > 0) {
                lastDelivery = etsLabels[i];
                etsFound = true;
                break;
            }
        }

        if (!etsFound) {
            let atsFound = false;
            for (let i = 0; i < atsLabels.length; i++) {
                if (atsDistance[i] > 0) {
                    lastDelivery = atsLabels[i];
                    atsFound = true;
                    break;
                }
            }

            if (!atsFound) {
                resultContainer.innerText = 'No deliveries found';
                resultContainer.classList.remove('hidden');
                return;
            }
        }

        if (lastDelivery) {
            const [lastMonth, lastYear] = lastDelivery.split('/').map(Number);
            const currentDate = new Date();
            let previousMonth = currentDate.getMonth(); // getMonth() returns 0-based month
            let previousYear = currentDate.getFullYear();

            if (previousMonth === 0) {
                previousMonth = 12;
                previousYear -= 1;
            }

            if ((lastYear < previousYear) || (lastYear === previousYear && lastMonth < previousMonth)) {
                // Fetch the last logbook from the month of the last delivery
                const logbookData = await fetch(`https://trucksbook.eu/logbook/${userId}/${lastYear}/${lastMonth}/0/`);
                const logbookSite = await logbookData.text();
                const parser = new DOMParser();
                const logbookDoc = parser.parseFromString(logbookSite, 'text/html');
                // Process logbookJson as needed
                const deliveryUrl = Array.from(Array.from(logbookDoc.getElementById('monthselectmodal').parentNode.children[1].children[1].children[1].children).reverse()[0].children).reverse()[0].children[0].getAttribute('href');
                const deliveryData = await fetch(`https://trucksbook.eu${deliveryUrl}`);
                const deliverySite = await deliveryData.text();
                const deliveryDoc = parser.parseFromString(deliverySite, 'text/html');

                const lastDeliveryDate = new Date(Array.from(Array.from(deliveryDoc.getElementById('planneddistanceinfomodal').parentNode.children[0].children[0].children[1].children[0].children[0].children).reverse()[0].children).reverse()[0].dataset.time);
                const formattedDate = lastDeliveryDate.getDate().toString().padStart(2, '0') + '.' + (lastDeliveryDate.getMonth() + 1).toString().padStart(2, '0') + '.' + lastDeliveryDate.getFullYear();
                resultContainer.innerHTML = 'Last delivery was on <span class="red-text">' + formattedDate + '</span>';
                resultContainer.classList.remove('active');
                
                // Copy the last delivery date to the clipboard
                navigator.clipboard.writeText(formattedDate).then(() => {
                    console.log('Last delivery date copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            } else {
                resultContainer.innerText = 'User is active!';
                resultContainer.classList.add('active');
            }
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        // Fallback: Try scraping the logbook directly
        await fetchDataFromLogbook(userId);
        return;
    }

    // Show the result container
    resultContainer.classList.remove('hidden');
}

// Fallback function when API is not available
async function fetchDataFromLogbook(userId) {
    try {
        const parser = new DOMParser();
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        
        // Calculate previous month
        let previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        let previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        
        // Check up to 24 months back
        for (let i = 0; i < 24; i++) {
            let checkMonth = currentMonth - i;
            let checkYear = currentYear;
            while (checkMonth <= 0) {
                checkMonth += 12;
                checkYear -= 1;
            }
            
            const logbookResponse = await fetch(`https://trucksbook.eu/logbook/${userId}/${checkYear}/${checkMonth}/0/`);
            if (!logbookResponse.ok) continue;
            
            const logbookHtml = await logbookResponse.text();
            const logbookDoc = parser.parseFromString(logbookHtml, 'text/html');
            
            // Try to find deliveries using the original DOM structure
            const monthSelectModal = logbookDoc.getElementById('monthselectmodal');
            if (!monthSelectModal) continue;
            
            try {
                const deliveryTable = monthSelectModal.parentNode.children[1].children[1].children[1];
                if (!deliveryTable || !deliveryTable.children || deliveryTable.children.length === 0) continue;
                
                // Found deliveries! Get the most recent one
                const deliveryRows = Array.from(deliveryTable.children);
                let mostRecentDate = null;
                
                for (const row of deliveryRows) {
                    const timeElements = row.querySelectorAll('[data-time]');
                    for (const element of timeElements) {
                        const timeValue = element.dataset.time;
                        if (timeValue) {
                            const date = new Date(timeValue);
                            if (!isNaN(date.getTime()) && (!mostRecentDate || date > mostRecentDate)) {
                                mostRecentDate = date;
                            }
                        }
                    }
                }
                
                if (mostRecentDate) {
                    const lastMonth = mostRecentDate.getMonth() + 1;
                    const lastYear = mostRecentDate.getFullYear();
                    
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
                        
                        navigator.clipboard.writeText(formattedDate).then(() => {
                            console.log('Last delivery date copied to clipboard');
                        }).catch(err => {
                            console.error('Failed to copy text: ', err);
                        });
                    }
                    resultContainer.classList.remove('hidden');
                    return;
                }
            } catch (domErr) {
                // DOM structure didn't match, try next month
                continue;
            }
        }
        
        // No deliveries found after checking all months
        resultContainer.innerText = 'No deliveries found';
        resultContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error in fallback fetch:', error);
        resultContainer.innerText = 'Error fetching data. Please try again.';
        resultContainer.classList.remove('hidden');
    }
}