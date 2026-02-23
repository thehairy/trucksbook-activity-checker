// ── Utilities ──────────────────────────────────────────────────

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Phase helpers ──────────────────────────────────────────────
function showPhase(id) {
    ['phase-input', 'phase-loading', 'phase-results'].forEach(p => {
        const el = document.getElementById(p);
        if (p === id) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

function logStep(icon, textHTML) {
    const log = document.getElementById('step-log');
    const entry = document.createElement('div');
    entry.className = 'step-entry';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'step-icon';
    iconSpan.textContent = icon;
    const textSpan = document.createElement('span');
    textSpan.className = 'step-text';
    textSpan.innerHTML = textHTML; // caller must escape user values
    entry.appendChild(iconSpan);
    entry.appendChild(textSpan);
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

// ── Stored results for download ────────────────────────────────
let _results = [];

// ── URLs ───────────────────────────────────────────────────────
const BASE_URL = "https://trucksbook.eu";

// ── Entry point ────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', startProcess);
document.getElementById('downloadBtn').addEventListener('click', () => downloadExcelCSV(_results));
document.getElementById('refreshBtn').addEventListener('click', resetToStart);

function resetToStart() {
    _results = [];
    document.querySelector('#previewTable tbody').innerHTML = '';
    document.getElementById('step-log').innerHTML = '';
    document.getElementById('progressFill').style.width = '0%';
    showPhase('phase-input');
}

async function startProcess() {
    const input = document.getElementById('idInput').value;
    const progressFill = document.getElementById('progressFill');
    const tbody = document.querySelector('#previewTable tbody');

    // 1. Clean IDs
    const ids = input.split(/[\s,]+/).filter(id => id.trim().length > 0 && !isNaN(id));

    if (ids.length === 0) {
        alert('Please enter valid numeric IDs.');
        return;
    }

    // 2. Switch to loading phase
    showPhase('phase-loading');
    tbody.innerHTML = '';
    _results = [];
    let processedCount = 0;

    // Dates
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }

    logStep('🚀', `Starting check for <strong>${ids.length}</strong> user(s)…`);

    // 3. Process loop
    for (const userId of ids) {
        const safeId = escapeHTML(userId);
        logStep('🔍', `Checking activity for user <strong>${safeId}</strong>…`);

        // A. Check Activity (current & previous month)
        let isActive = await checkLogbookActivity(userId, currentYear, currentMonth);
        if (!isActive) {
            await delay(200);
            isActive = await checkLogbookActivity(userId, prevYear, prevMonth);
        }

        let statusStr = isActive ? 'Aktiv' : 'Inaktiv';
        let lastDate = '';

        // B. If inactive, find the exact last date
        if (!isActive) {
            logStep('📅', `Finding last delivery date for user <strong>${safeId}</strong>…`);
            lastDate = await findLastDateRecursive(userId, currentYear, 3);
        } else {
            lastDate = 'Aktiv';
        }

        const safeDate = escapeHTML(lastDate);
        logStep(isActive ? '✅' : '⚪', `User <strong>${safeId}</strong> → ${statusStr}${lastDate && lastDate !== 'Aktiv' ? ' (' + safeDate + ')' : ''}`);

        // C. Save result
        _results.push({ id: userId, status: statusStr, date: lastDate });

        // Progress bar
        processedCount++;
        const pct = (processedCount / ids.length) * 100;
        progressFill.style.width = pct + '%';

        await delay(300);
    }

    logStep('🎉', 'All done! Building results table…');

    // 4. Populate results table
    _results.forEach(item => {
        const tr = document.createElement('tr');
        const badgeClass = item.status === 'Aktiv' ? 'badge-active' : 'badge-inactive';
        const tdId = document.createElement('td');
        tdId.textContent = item.id;
        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass}`;
        badge.textContent = item.status;
        tdStatus.appendChild(badge);
        const tdDate = document.createElement('td');
        tdDate.textContent = item.date;
        tr.appendChild(tdId);
        tr.appendChild(tdStatus);
        tr.appendChild(tdDate);
        tbody.appendChild(tr);
    });

    // 5. Switch to results phase
    showPhase('phase-results');
}

// ── Core logic functions ───────────────────────────────────────

async function checkLogbookActivity(userId, year, month) {
    const url = `${BASE_URL}/logbook/${userId}/${year}/${month}/0/`;
    try {
        const doc = await fetchHTML(url);
        // Only look inside the main column (.col-lg-8) to avoid sidebar tables
        const mainColumn = doc.querySelector('.col-lg-8');
        if (!mainColumn) return false;

        const table = mainColumn.querySelector('table.table-striped.table-hover');
        if (!table) return false;

        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) return false;

        let hasData = false;
        rows.forEach(row => {
            if (row.querySelectorAll('td').length > 3) hasData = true;
        });
        return hasData;
    } catch (e) {
        return false;
    }
}

async function findLastDateRecursive(userId, startYear, depth) {
    if (depth <= 0) return 'Keine Daten (>3 Jahre)';

    const url = `${BASE_URL}/logbook-month-select?user_id=${userId}&year=${startYear}&game=0`;

    try {
        const doc = await fetchHTML(url);
        const table = doc.querySelector('table.table-striped.table-hover') || doc.querySelector('table');

        if (!table) {
            await delay(200);
            return await findLastDateRecursive(userId, startYear - 1, depth - 1);
        }

        const rows = table.querySelectorAll('tbody tr');
        let foundMonthIndex = -1;

        for (let i = rows.length - 1; i >= 0; i--) {
            const cols = rows[i].querySelectorAll('td');
            const distanceText = cols[1] ? cols[1].textContent.trim() : '';
            if (/\d/.test(distanceText) && distanceText !== '0 km') {
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
        console.error('Error parsing month overview:', e);
        return 'Fehler';
    }
}

async function getExactDateFromLogbook(userId, year, month) {
    const url = `${BASE_URL}/logbook/${userId}/${year}/${month}/0/`;
    try {
        const doc = await fetchHTML(url);

        const mainContent = doc.querySelector('.col-lg-8');
        if (!mainContent) return `${month}.${year}`;

        const table = mainContent.querySelector('table.table-striped.table-hover');
        if (!table) return `${month}.${year}`;

        const rows = table.querySelectorAll('tbody tr');
        if (rows.length === 0) return `${month}.${year}`;

        const lastRow = rows[rows.length - 1];
        const detailsBtn = lastRow.querySelector('a.btn-primary');
        if (detailsBtn) {
            const detailsUrl = detailsBtn.getAttribute('href');
            if (detailsUrl) {
                await delay(200);
                const exactDate = await fetchDateFromDeliveryPage(BASE_URL + detailsUrl);
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
        const timeElement = doc.querySelector('.local-time') || doc.querySelector('.local-servertime');

        if (timeElement) {
            const isoString = timeElement.getAttribute('data-time');
            if (isoString) {
                const dateObj = new Date(isoString);
                if (!isNaN(dateObj)) {
                    const day   = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const year  = dateObj.getFullYear();
                    return `${day}.${month}.${year}`;
                }
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}


async function fetchHTML(url) {
    const response = await fetch(url);
    const text = await response.text();
    return new DOMParser().parseFromString(text, 'text/html');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadExcelCSV(data) {
    let csvContent = 'data:text/csv;charset=utf-8,';
    data.forEach(item => {
        csvContent += `${item.id};${item.status}\n`;
        csvContent += `Letzter Eintrag:;${item.date}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'trucksbook_activity.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}