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
    const etsData = await fetch(`https://trucksbook.eu/components/app/profile/game_overview_data_distance.php?user_id=${userId}&game=1&stat=0&data=distance&period=`)
    const atsData = await fetch(`https://trucksbook.eu/components/app/profile/game_overview_data_distance.php?user_id=${userId}&game=2&stat=0&data=distance&period=`)
    
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

    // Show the result container
    resultContainer.classList.remove('hidden');
}