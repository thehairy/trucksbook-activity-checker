document.getElementById('startBtn').addEventListener('click', startProcess);

// URLs
const BASE_URL = "https://trucksbook.eu";

async function startProcess() {
    const input = document.getElementById('idInput').value;
    const btn = document.getElementById('startBtn');
    const statusDiv = document.getElementById('status');
    const progressFill = document.getElementById('progressFill');
    const tbody = document.querySelector("#previewTable tbody");

    // 1. Clean IDs
    const ids = input.split(/[\s,]+/).filter(id => id.trim().length > 0 && !isNaN(id));

    if (ids.length === 0) {
        statusDiv.textContent = "Please enter valid numeric IDs.";
        return;
    }

    // 2. Setup UI
    btn.disabled = true;
    tbody.innerHTML = "";
    let results = []; 
    let processedCount = 0;

    // Dates
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

    statusDiv.textContent = `Starting check for ${ids.length} users...`;

    // 3. Process Loop
    for (const userId of ids) {
        statusDiv.textContent = `Checking User ${userId}...`;
        
        // A. Check Activity (Current & Prev Month)
        let isActive = await checkLogbookActivity(userId, currentYear, currentMonth);
        if (!isActive) {
            await delay(200);
            isActive = await checkLogbookActivity(userId, prevYear, prevMonth);
        }

        let statusStr = isActive ? "Aktiv" : "Inaktiv";
        let lastDate = "";

        // B. If Inactive, find the exact last date
        if (!isActive) {
            statusDiv.textContent = `Finding last date for ${userId}...`;
            // Search back 3 years
            lastDate = await findLastDateRecursive(userId, currentYear, 3);
        } else {
            lastDate = "Aktiv"; 
        }

        // C. Save Data
        results.push({ id: userId, status: statusStr, date: lastDate });
        
        // Update Preview
        let tr = document.createElement("tr");
        tr.innerHTML = `<td>${userId}</td><td>${statusStr}</td><td>${lastDate}</td>`;
        tbody.appendChild(tr);

        // Progress
        processedCount++;
        const pct = (processedCount / ids.length) * 100;
        progressFill.style.width = pct + "%";
        
        await delay(300);
    }

    // 4. Generate CSV
    downloadExcelCSV(results);
    
    statusDiv.textContent = "Done! File downloaded.";
    btn.disabled = false;
}

// --- CORE LOGIC FUNCTIONS ---

async function checkLogbookActivity(userId, year, month) {
    const url = `${BASE_URL}/logbook/${userId}/${year}/${month}/0/`;
    try {
        const doc = await fetchHTML(url);
        // SCOPE: Only look inside the main column (.col-lg-8) to avoid sidebar tables
        const mainColumn = doc.querySelector(".col-lg-8");
        if (!mainColumn) return false;

        const table = mainColumn.querySelector("table.table-striped.table-hover");
        if (!table) return false;
        
        const rows = table.querySelectorAll("tbody tr");
        if (rows.length === 0) return false;

        let hasData = false;
        rows.forEach(row => {
            // Real delivery rows have many columns (>3).
            if (row.querySelectorAll("td").length > 3) hasData = true;
        });
        return hasData;
    } catch (e) {
        return false;
    }
}

async function findLastDateRecursive(userId, startYear, depth) {
    if (depth <= 0) return "Keine Daten (>3 Jahre)";

    const url = `${BASE_URL}/logbook-month-select?user_id=${userId}&year=${startYear}&game=0`;
    
    try {
        const doc = await fetchHTML(url);
        // Try the specific class first; fall back to any table on this page.
        const table = doc.querySelector("table.table-striped.table-hover") || doc.querySelector("table");
        
        if (!table) {
            await delay(200);
            return await findLastDateRecursive(userId, startYear - 1, depth - 1);
        }

        const rows = table.querySelectorAll("tbody tr");
        
        // Loop backwards (Dec -> Jan)
        let foundMonthIndex = -1;
        
        for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i];
            const cols = row.querySelectorAll("td");
            
            // Look for digits in the distance column
            const distanceText = cols[1] ? cols[1].textContent.trim() : "";
            const hasNumber = /\d/.test(distanceText);
            
            if (hasNumber && distanceText !== "0 km") {
                foundMonthIndex = i;
                break; 
            }
        }

        if (foundMonthIndex !== -1) {
            const month = foundMonthIndex + 1;
            return await getExactDateFromLogbook(userId, startYear, month);
        } else {
            await delay(200);
            return await findLastDateRecursive(userId, startYear - 1, depth - 1);
        }

    } catch (e) {
        console.error("Error parsing month overview:", e);
        return "Fehler";
    }
}

async function getExactDateFromLogbook(userId, year, month) {
    const url = `${BASE_URL}/logbook/${userId}/${year}/${month}/0/`;
    try {
        const doc = await fetchHTML(url);
        
        // --- CRITICAL FIX START ---
        // 1. Target the main content column (col-lg-8)
        const mainContent = doc.querySelector('.col-lg-8');
        if (!mainContent) return `${month}.${year}`;

        // 2. Find the main logbook table inside that column
        const table = mainContent.querySelector('table.table-striped.table-hover');
        if (!table) return `${month}.${year}`;

        // 3. Get rows only from THIS table
        const rows = table.querySelectorAll("tbody tr");
        if (rows.length === 0) return `${month}.${year}`;
        // --- CRITICAL FIX END ---

        // TrucksBook adds rows sequentially (1 to N).
        // The last row is the latest delivery of the month.
        const lastRow = rows[rows.length - 1];
        
        // Find "Details" button in this row
        const detailsBtn = lastRow.querySelector("a.btn-primary");
        if (detailsBtn) {
            const detailsUrl = detailsBtn.getAttribute("href");
            if (detailsUrl) {
                await delay(200);
                const fullDetailsUrl = BASE_URL + detailsUrl;
                const exactDate = await fetchDateFromDeliveryPage(fullDetailsUrl);
                if (exactDate) return exactDate;
            }
        }
        
        return `${month}.${year}`; 

    } catch (e) {
        console.error(e);
        return `${month}.${year}`;
    }
}

async function fetchDateFromDeliveryPage(url) {
    try {
        const doc = await fetchHTML(url);
        
        // Look for <td class="local-time" data-time="...">
        const timeElement = doc.querySelector('.local-time') || doc.querySelector('.local-servertime');

        if (timeElement) {
            const isoString = timeElement.getAttribute('data-time'); 
            if (isoString) {
                const dateObj = new Date(isoString);
                if (!isNaN(dateObj)) {
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const year = dateObj.getFullYear();
                    return `${day}.${month}.${year}`;
                }
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// --- HELPER UTILS ---

async function fetchHTML(url) {
    const response = await fetch(url);
    const text = await response.text();
    return new DOMParser().parseFromString(text, "text/html");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadExcelCSV(data) {
    let csvContent = "data:text/csv;charset=utf-8,";
    data.forEach(item => {
        csvContent += `${item.id};${item.status}\n`;
        csvContent += `Letzter Eintrag:;${item.date}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "trucksbook_activity.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}