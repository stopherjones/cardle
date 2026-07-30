// State Engine Configuration Management
const MAX_GUESSES = 8;
let gameDatabase = [];
let targetCar = null;
let searchableCars = [];
let currentGameState = {
    date: "",
    guesses: [],
    completed: false,
    victory: false,
    mode: "daily",
    overlayHiddenIndices: [],
    revealOrder: []
};

// Helper Utilities for Normalisation and Search
function stripAccents(str) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.stripAccents) {
        return CardleDailyEngine.stripAccents(str);
    }
    if (!str) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeForSearch(str) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.normalizeForSearch) {
        return CardleDailyEngine.normalizeForSearch(str);
    }
    if (!str) return '';
    return stripAccents(str).toLowerCase().trim();
}

function getReadMoreHtml(make, model, wikiUrl) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.getReadMoreHtml) {
        return CardleDailyEngine.getReadMoreHtml(make, model, wikiUrl);
    }
    const links = [];
    if (wikiUrl) {
        links.push(`<a href="${escapeHtml(wikiUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia</a>`);
    }
    const searchQuery = `${make || ''} ${model || ''}`.trim();
    if (searchQuery) {
        const googleAiUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&udm=50`;
        links.push(`<a href="${escapeHtml(googleAiUrl)}" target="_blank" rel="noopener noreferrer">Google AI</a>`);
    }
    if (links.length === 0) return '';
    return `<span class="read-more-label">Read more:</span> ${links.join(' <span class="read-more-pipe">|</span> ')}`;
}

function parseCountries(countryInput) {
    if (Array.isArray(countryInput)) {
        return countryInput.map(c => String(c).trim()).filter(Boolean);
    }
    if (!countryInput) return ['Unknown'];
    const rawStr = String(countryInput).trim();
    const list = rawStr.split(/,|\/|&|\band\b/i).map(c => c.trim()).filter(Boolean);
    return list.length > 0 ? list : [rawStr];
}

function normalizeCountryName(str) {
    if (!str) return '';
    const s = normalizeForSearch(str);
    if (['usa', 'us', 'united states of america', 'america'].includes(s)) return 'united states';
    if (['uk', 'great britain', 'britain', 'england'].includes(s)) return 'united kingdom';
    if (['ussr', 'soviet union'].includes(s)) return 'ussr';
    return s;
}

function checkCountryOverlap(countries1, countries2) {
    const list1 = (countries1 || []).map(normalizeCountryName);
    const list2 = (countries2 || []).map(normalizeCountryName);
    return list1.some(c1 => list2.includes(c1));
}

function hasValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim().toLowerCase();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'none' || trimmed === 'n/a') return false;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('data:image/');
}

// 1. Data Normalisation and Sanitisation Pipeline
function normaliseData(rawItems) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.normaliseData) {
        return CardleDailyEngine.normaliseData(rawItems);
    }
    const list = Array.isArray(rawItems) ? rawItems : (rawItems?.vehicles || []);
    const registry = {};

    list.forEach(item => {
        const make = String(item.Make ?? item.make ?? item.manufacturerLabel ?? '').trim();
        const model = String(item.Model ?? item.model ?? item.carLabel ?? '').trim();
        const countryRaw = String(item.Country ?? item.country ?? item.countryLabel ?? 'Unknown').trim();
        const countryList = parseCountries(countryRaw);
        const manufacturingYear = parseInt(item.Year ?? item.year, 10);
        const image = String(item.imageurl ?? item.image ?? item.imageUrl ?? '').trim();
        const notes = String(item.notes ?? item.Notes ?? '').trim();
        const url = String(item.url ?? item.URL ?? item.link ?? item.sourceUrl ?? '').trim();

        if (isNaN(manufacturingYear) || !make || !model || !hasValidImageUrl(image)) return;

        const qid = `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        if (!registry[qid]) {
            registry[qid] = {
                id: qid,
                model,
                make,
                country: countryRaw || 'Unknown',
                countries: countryList.length ? countryList : ['Unknown'],
                year: manufacturingYear,
                image,
                notes,
                url
            };
        }
    });

    return Object.values(registry).sort((a, b) => a.id.localeCompare(b.id));
}

function getDateStamp(date = new Date()) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.getDateStamp) {
        return CardleDailyEngine.getDateStamp(date);
    }
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// 2. Deterministic Chronological Cycle Mapping (No repeats until all cars chosen)
function calculateDailyTarget(carsList) {
    const dateStamp = getDateStamp();
    currentGameState.date = dateStamp;

    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.getDailyCardleCar) {
        return CardleDailyEngine.getDailyCardleCar(carsList);
    }

    let computationHash = 0;
    for (let i = 0; i < dateStamp.length; i++) {
        computationHash = dateStamp.charCodeAt(i) + ((computationHash << 5) - computationHash);
    }
    
    const targetIdx = Math.abs(computationHash) % carsList.length;
    return carsList[targetIdx];
}

function selectTargetForMode(carsList, mode) {
    if (mode === 'random') {
        currentGameState.date = `random-${Date.now()}`;
        return carsList[Math.floor(Math.random() * carsList.length)];
    }

    return calculateDailyTarget(carsList);
}

function shuffleArray(items, seedKey = null) {
    const shuffled = [...items];
    let getRandom = Math.random;

    if (seedKey) {
        let hash = 0;
        const strKey = String(seedKey);
        for (let i = 0; i < strKey.length; i++) {
            hash = strKey.charCodeAt(i) + ((hash << 5) - hash);
        }
        let seed = Math.abs(hash) || 12345;
        getRandom = function () {
            let t = (seed += 0x6d2b79f5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(getRandom() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function createRandomRevealOrder(cellCount = 8, seedKey = null) {
    return shuffleArray(Array.from({ length: cellCount }, (_, index) => index), seedKey);
}

function updateModeButtons(activeMode) {
    const dailyButton = document.getElementById('daily-play-btn');
    const randomButton = document.getElementById('random-play-btn');

    if (dailyButton) {
        dailyButton.classList.toggle('active', activeMode === 'daily');
    }

    if (randomButton) {
        randomButton.classList.toggle('active', activeMode === 'random');
    }
}

function getCarDisplayLabel(car) {
    return `${car.make} ${car.model} (${car.country}, ${car.year})`;
}

// Search Overlay Controls
function openSearchOverlay() {
    const wrapper = document.querySelector('.input-wrapper');
    if (wrapper) {
        wrapper.classList.add('overlay-open');
        document.body.classList.add('search-overlay-active');
    }
}

function closeSearchOverlay() {
    const wrapper = document.querySelector('.input-wrapper');
    const input = document.getElementById('user-input');
    if (wrapper) {
        wrapper.classList.remove('overlay-open');
        document.body.classList.remove('search-overlay-active');
    }
    if (input) {
        input.blur();
    }
    clearSuggestions();
}

function clearSuggestions() {
    const suggestions = document.getElementById('car-suggestions');
    if (suggestions) {
        suggestions.innerHTML = '';
        suggestions.classList.add('hidden');
    }
}

function renderSuggestions(query) {
    const suggestions = document.getElementById('car-suggestions');
    const input = document.getElementById('user-input');
    if (!suggestions) return;

    const normalizedQuery = normalizeForSearch(query);
    
    // In overlay mode, show popular/all top results if query is empty
    let matches = searchableCars;
    if (normalizedQuery) {
        matches = searchableCars.filter(car => {
            const searchableText = normalizeForSearch(`${car.make} ${car.model} ${car.country} ${car.year}`);
            return searchableText.includes(normalizedQuery);
        });
    }

    let itemsHtml = '';
    if (!matches.length) {
        itemsHtml = '<div class="suggestion-empty">No matching vehicles found</div>';
    } else {
        itemsHtml = matches.slice(0, 50).map(car => `
            <button type="button" class="suggestion-item" data-label="${escapeHtml(getCarDisplayLabel(car))}">
                ${escapeHtml(getCarDisplayLabel(car))}
            </button>
        `).join('');
    }

    suggestions.innerHTML = `
        <button type="button" class="lucky-suggestion-btn" id="lucky-suggestion-btn">
            <span>🎲</span> I'm feeling lucky
        </button>
        ${itemsHtml}
    `;
    suggestions.classList.remove('hidden');

    const luckyBtn = document.getElementById('lucky-suggestion-btn');
    if (luckyBtn) {
        luckyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pool = (matches && matches.length > 0) ? matches : searchableCars;
            if (pool && pool.length > 0) {
                const randomCar = pool[Math.floor(Math.random() * pool.length)];
                if (input) {
                    input.value = getCarDisplayLabel(randomCar);
                }
                processGuess();
            }
        });
    }
}

function findCarByInput(inputString) {
    const trimmedInput = inputString.trim();
    if (!trimmedInput) return null;

    const normalizedInput = normalizeForSearch(trimmedInput);

    const exactLabelMatch = searchableCars.find(car => normalizeForSearch(getCarDisplayLabel(car)) === normalizedInput);
    if (exactLabelMatch) return exactLabelMatch;

    const simpleMatch = searchableCars.find(car => normalizeForSearch(`${car.make} ${car.model}`) === normalizedInput);
    if (simpleMatch) return simpleMatch;

    const modelMatch = searchableCars.find(car => normalizeForSearch(car.model) === normalizedInput);
    if (modelMatch) return modelMatch;

    const yearMatch = searchableCars.find(car => String(car.year) === normalizedInput);
    if (yearMatch) return yearMatch;

    const countryMatch = searchableCars.find(car => {
        const normInput = normalizeCountryName(normalizedInput);
        return (car.countries || [car.country]).some(c => normalizeCountryName(c) === normInput);
    });
    if (countryMatch) return countryMatch;

    return searchableCars.find(car => {
        const searchableText = normalizeForSearch(`${car.make} ${car.model} ${car.country} ${car.year}`);
        return searchableText.includes(normalizedInput);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function resetGameUI() {
    const guessMatrix = document.getElementById('guess-matrix');
    const userInput = document.getElementById('user-input');
    const inputControls = document.getElementById('input-controls');
    const gameStatus = document.getElementById('game-status');
    const statusMessage = document.getElementById('status-message');
    const solutionReveal = document.getElementById('solution-reveal');
    const resultsModal = document.getElementById('results-modal');

    if (guessMatrix) {
        guessMatrix.innerHTML = '';
    }

    if (userInput) {
        userInput.value = '';
    }

    closeSearchOverlay();

    if (inputControls) {
        inputControls.classList.remove('hidden');
    }

    if (gameStatus) {
        gameStatus.classList.add('hidden');
    }

    if (statusMessage) {
        statusMessage.textContent = '';
    }

    if (solutionReveal) {
        solutionReveal.textContent = '';
    }

    if (resultsModal) {
        resultsModal.classList.remove('active');
    }
}

function startGame(mode = 'daily') {
    const dateStamp = mode === 'daily' ? getDateStamp() : `random-${Date.now()}`;
    currentGameState = {
        date: dateStamp,
        guesses: [],
        completed: false,
        victory: false,
        mode,
        overlayHiddenIndices: [],
        revealOrder: createRandomRevealOrder(8, mode === 'daily' ? `${dateStamp}-reveal` : null)
    };

    if (!gameDatabase.length) {
        console.error('No playable vehicles with images are available.');
        return;
    }

    targetCar = selectTargetForMode(gameDatabase, mode);
    resetGameUI();
    updateModeButtons(mode);
    document.getElementById('target-image').src = targetCar.image;
    buildOverlay();
    removeRandomOverlayCell();
    refreshImageDisplay();
}

// 3. UI Matrix Render Component
function drawFeedbackRow(guessObj) {
    const container = document.getElementById('guess-matrix');
    const row = document.createElement('div');
    row.className = 'guess-row';

    const makeMatch = guessObj.make === targetCar.make;
    const modelMatch = guessObj.model === targetCar.model;
    const countryMatch = checkCountryOverlap(
        guessObj.countries || [guessObj.country],
        targetCar.countries || [targetCar.country]
    );
    
    let yearClass = "cell-wrong";
    let yearSymbol = "";
    if (guessObj.year === targetCar.year) {
        yearClass = "cell-correct";
    } else {
        yearClass = "cell-directional";
        yearSymbol = guessObj.year < targetCar.year ? " ↑" : " ↓";
    }

    row.innerHTML = `
        <div class="guess-cell ${makeMatch ? 'cell-correct' : 'cell-wrong'}">${guessObj.make}</div>
        <div class="guess-cell ${modelMatch ? 'cell-correct' : 'cell-wrong'}">${guessObj.model}</div>
        <div class="guess-cell ${countryMatch ? 'cell-correct' : 'cell-wrong'}">${guessObj.country}</div>
        <div class="guess-cell ${yearClass}">${guessObj.year}${yearSymbol}</div>
    `;
    container.appendChild(row);
}

// 4. Image Display State
function buildOverlay() {
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;

    const cells = overlay.querySelectorAll('.overlay-cell');
    if (cells.length === 0) {
        for (let i = 0; i < 8; i += 1) {
            const cell = document.createElement('div');
            cell.className = 'overlay-cell';
            overlay.appendChild(cell);
        }
    }

    const tilePositions = shuffleArray([
        [1, 1], [1, 2], [1, 3], [1, 4],
        [2, 1], [2, 2], [2, 3], [2, 4]
    ], currentGameState.mode === 'daily' ? `${currentGameState.date}-tiles` : null);

    Array.from(overlay.querySelectorAll('.overlay-cell')).forEach((cell, index) => {
        const [row, column] = tilePositions[index];
        cell.style.gridRow = row;
        cell.style.gridColumn = column;
    });

    overlay.classList.remove('revealed');
    applyOverlayState();
}

function applyOverlayState() {
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;

    const cells = Array.from(overlay.querySelectorAll('.overlay-cell'));
    cells.forEach((cell, index) => {
        cell.classList.toggle('hidden', currentGameState.overlayHiddenIndices.includes(index));
    });
}

function revealFullImage() {
    currentGameState.overlayHiddenIndices = [];
    applyOverlayState();
    const overlay = document.getElementById('image-overlay');
    if (overlay) {
        overlay.classList.add('revealed');
    }
}

function removeRandomOverlayCell() {
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;

    const nextIndex = currentGameState.revealOrder.shift();
    if (nextIndex === undefined) {
        revealFullImage();
        return;
    }

    if (!currentGameState.overlayHiddenIndices.includes(nextIndex)) {
        currentGameState.overlayHiddenIndices.push(nextIndex);
    }
    applyOverlayState();
}

function refreshImageDisplay() {
    const img = document.getElementById('target-image');
    const overlay = document.getElementById('image-overlay');
    if (img) {
        img.className = '';
        img.style.filter = 'none';
        if (currentGameState.isGameOver) {
            img.style.cursor = 'pointer';
            img.title = 'Click to zoom image';
        } else {
            img.style.cursor = 'default';
            img.removeAttribute('title');
        }
    }
    if (overlay) {
        overlay.classList.toggle('revealed', currentGameState.completed && currentGameState.victory);
    }
    applyOverlayState();
}

// 5. User Input Handler Event Pipeline
function processGuess() {
    if (currentGameState.completed) return;

    const inputField = document.getElementById('user-input');
    const inputString = inputField.value.trim();
    
    const selectedCar = findCarByInput(inputString);

    if (!selectedCar) {
        alert("Please select a valid option directly from the provided drop-down listing.");
        return;
    }

    inputField.value = "";
    closeSearchOverlay();

    currentGameState.guesses.push(selectedCar);
    drawFeedbackRow(selectedCar);

    const isVictory = selectedCar.id === targetCar.id;

    if (isVictory) {
        currentGameState.completed = true;
        currentGameState.victory = true;
        revealFullImage();
        displayTerminationState();
    } else if (currentGameState.guesses.length < MAX_GUESSES) {
        removeRandomOverlayCell();
    } else {
        currentGameState.completed = true;
        currentGameState.victory = false;
        revealFullImage();
        displayTerminationState();
    }

    refreshImageDisplay();
    localStorage.setItem('cardle_session', JSON.stringify(currentGameState));
}

// Date formatting helper for daily games (e.g., "23 July 2026")
function getFormattedDate(dateStr) {
    let year, month, day;
    if (dateStr && typeof dateStr === 'string' && !dateStr.startsWith('random')) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        }
    }
    if (year === undefined) {
        const now = new Date();
        year = now.getUTCFullYear();
        month = now.getUTCMonth();
        day = now.getUTCDate();
    }
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${day} ${months[month]} ${year}`;
}

let appGallery = [];
let appGalleryIndex = 0;

function openZoom(items, initialIndex = 0) {
    const lightbox = document.getElementById('lightbox');
    if (!items) return;

    if (typeof items === 'string') {
        appGallery = [{ imgSrc: items, notes: arguments[1] || '' }];
        appGalleryIndex = 0;
    } else if (Array.isArray(items)) {
        appGallery = items;
        appGalleryIndex = Math.max(0, Math.min(initialIndex, appGallery.length - 1));
    } else {
        appGallery = [items];
        appGalleryIndex = 0;
    }

    renderAppGalleryItem();
    if (lightbox) lightbox.classList.add('active');
    document.body.classList.add('modal-open');
}

function renderAppGalleryItem() {
    if (!appGallery || appGallery.length === 0) return;
    const item = appGallery[appGalleryIndex];
    if (!item) return;

    const lightboxImg = document.getElementById('lightbox-img');
    const captionEl = document.getElementById('lightbox-caption');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    const counterEl = document.getElementById('lightbox-counter');

    if (lightboxImg) {
        lightboxImg.src = item.imgSrc || item.image || item;
        lightboxImg.alt = item.title || (item.make ? `${item.make} ${item.model}` : 'Enlarged Vehicle View');
    }

    if (captionEl) {
        let captionHtml = '';
        let readMoreHtml = '';
        if (item.title || (item.make && item.model)) {
            const titleText = item.title || `${item.make} ${item.model}`;
            const subText = item.sub ? ` (${item.sub})` : '';
            captionHtml += `<div class="lightbox-caption-header"><strong>${escapeHtml(titleText)}${escapeHtml(subText)}</strong></div>`;
            const make = item.make || (item.title ? item.title.split(' ')[0] : '');
            const model = item.model || '';
            const wikiUrl = item.url || item.carUrl || '';
            readMoreHtml = getReadMoreHtml(make, model, wikiUrl);
        }

        if (item.notes && item.notes.trim()) {
            captionHtml += `<div class="lightbox-notes">${escapeHtml(item.notes.trim())}</div>`;
        }

        if (readMoreHtml) {
            captionHtml += `<div class="lightbox-read-more">${readMoreHtml}</div>`;
        }

        if (captionHtml) {
            captionEl.innerHTML = captionHtml;
            captionEl.classList.remove('hidden');
        } else if (item.notesText) {
            captionEl.textContent = item.notesText;
            captionEl.classList.remove('hidden');
        } else {
            captionEl.innerHTML = '';
            captionEl.classList.add('hidden');
        }
    }

    const hasMultiple = appGallery.length > 1;
    if (prevBtn) prevBtn.classList.toggle('hidden', !hasMultiple);
    if (nextBtn) nextBtn.classList.toggle('hidden', !hasMultiple);
    if (counterEl) {
        if (hasMultiple) {
            counterEl.textContent = `${appGalleryIndex + 1} of ${appGallery.length}`;
            counterEl.classList.remove('hidden');
        } else {
            counterEl.classList.add('hidden');
        }
    }
}

function showNextAppZoom() {
    if (appGallery.length > 1) {
        appGalleryIndex = (appGalleryIndex + 1) % appGallery.length;
        renderAppGalleryItem();
    }
}

function showPrevAppZoom() {
    if (appGallery.length > 1) {
        appGalleryIndex = (appGalleryIndex - 1 + appGallery.length) % appGallery.length;
        renderAppGalleryItem();
    }
}

// 6. Game Termination Evaluation Display
function displayTerminationState() {
    const inputControls = document.getElementById('input-controls');
    const panel = document.getElementById('game-status');
    const modal = document.getElementById('results-modal');
    const titleEl = document.getElementById('results-title');
    const bodyEl = document.getElementById('results-body');

    if (inputControls) {
        inputControls.classList.add('hidden');
    }

    if (panel) {
        panel.classList.remove('hidden');
    }

    if (!modal || !titleEl || !bodyEl || !targetCar) return;

    const isWin = currentGameState.victory;
    titleEl.textContent = isWin ? 'Splendid!' : 'Game Over';
    titleEl.style.color = isWin ? 'var(--colour-correct)' : 'var(--danger)';

    const isDaily = currentGameState.mode === 'daily';
    const dateSuffix = isDaily ? ` for ${getFormattedDate(currentGameState.date)}` : '';

    const badgeClass = isWin ? 'victory' : 'defeat';
    const badgeText = isWin
        ? `I got Cardle in ${currentGameState.guesses.length}/${MAX_GUESSES} guesses${dateSuffix}!`
        : `I played Cardle (${MAX_GUESSES}/${MAX_GUESSES} guesses${dateSuffix})`;

    bodyEl.innerHTML = `
        <div class="results-photo-hint">💡 Click on car photo for details and info</div>
        <div class="result-card">
            <div class="result-card-header">
                <div class="result-thumb-shell" data-img="${escapeHtml(targetCar.image)}" data-notes="${escapeHtml(targetCar.notes || '')}" title="Click to zoom image">
                    <img class="result-card-img" src="${escapeHtml(targetCar.image)}" alt="${escapeHtml(targetCar.make + ' ' + targetCar.model)}">
                    <span class="thumb-zoom-badge">🔍</span>
                </div>
                <div class="result-card-info">
                    <div class="result-card-title">${escapeHtml(targetCar.make)} ${escapeHtml(targetCar.model)}</div>
                    <div class="result-card-sub">${escapeHtml(targetCar.country || 'Unknown')}, ${targetCar.year}</div>
                    <span class="result-card-badge ${badgeClass}">${badgeText}</span>
                </div>
            </div>
            ${targetCar.notes ? `<div class="result-card-notes">${escapeHtml(targetCar.notes)}</div>` : ''}
            <div class="result-card-link">${getReadMoreHtml(targetCar.make, targetCar.model, targetCar.url)}</div>
        </div>
    `;

    const imgShell = bodyEl.querySelector('.result-thumb-shell');
    if (imgShell) {
        imgShell.addEventListener('click', () => {
            const gallery = [];
            const seenImages = new Set();
            currentGameState.guesses.forEach(g => {
                if (g && g.image && !seenImages.has(g.image)) {
                    seenImages.add(g.image);
                    const isTarget = g.id === targetCar.id;
                    gallery.push({
                        imgSrc: g.image,
                        title: isTarget ? `${g.make} ${g.model} (Target Car)` : `${g.make} ${g.model}`,
                        sub: `${g.country || ''}, ${g.year || ''}`,
                        notes: g.notes || '',
                        url: g.url || ''
                    });
                }
            });
            if (targetCar && targetCar.image && !seenImages.has(targetCar.image)) {
                seenImages.add(targetCar.image);
                gallery.push({
                    imgSrc: targetCar.image,
                    title: `${targetCar.make} ${targetCar.model} (Target Car)`,
                    sub: `${targetCar.country || ''}, ${targetCar.year || ''}`,
                    notes: targetCar.notes || '',
                    url: targetCar.url || ''
                });
            }
            const targetIdx = gallery.findIndex(item => item.imgSrc === targetCar.image);
            openZoom(gallery, targetIdx >= 0 ? targetIdx : 0);
        });
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');
}

function getStandardShareText() {
    const isWin = currentGameState.victory;
    const count = currentGameState.guesses.length;
    const indexUrl = 'https://stopherjones.github.io/cardle/index.html';

    const isDaily = currentGameState.mode === 'daily';
    const dateSuffix = isDaily ? ` for ${getFormattedDate(currentGameState.date)}` : '';

    let shareMessage = isWin
        ? `I got Cardle in ${count}/${MAX_GUESSES} guesses${dateSuffix}! 🚗`
        : `I played Cardle (${MAX_GUESSES}/${MAX_GUESSES} guesses${dateSuffix}) 🚗`;

    return {
        title: 'Cardle',
        text: shareMessage,
        url: indexUrl,
        fullText: `${shareMessage}\n${indexUrl}`
    };
}

async function handleShareResult(shareInfo, shareBtn, toastEl) {
    let copied = false;

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareInfo.fullText);
            copied = true;
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = shareInfo.fullText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            copied = true;
        } catch (err) {
            console.error("Copy failed", err);
        }
        document.body.removeChild(textarea);
    }

    if (copied) {
        if (shareBtn) {
            const origHTML = shareBtn.innerHTML;
            shareBtn.classList.add('copied');
            shareBtn.innerHTML = 'Copied! 📋';
            setTimeout(() => {
                shareBtn.classList.remove('copied');
                shareBtn.innerHTML = origHTML;
            }, 2000);
        }
        if (toastEl) {
            toastEl.textContent = 'Copied results to clipboard!';
            toastEl.classList.remove('hidden');
            setTimeout(() => {
                toastEl.classList.add('hidden');
            }, 3000);
        }
    }
}

// 7. Local Storage Session Hydration Engine
function hydrateSession() {
    const cache = localStorage.getItem('cardle_session');
    if (!cache) return;

    try {
        const parsedCache = JSON.parse(cache);
        if (parsedCache.mode === currentGameState.mode && parsedCache.date === currentGameState.date) {
            currentGameState = parsedCache;
            if (!Array.isArray(currentGameState.overlayHiddenIndices)) {
                currentGameState.overlayHiddenIndices = [];
            }
            if (!Array.isArray(currentGameState.revealOrder)) {
                currentGameState.revealOrder = createRandomRevealOrder(8, currentGameState.mode === 'daily' ? `${currentGameState.date}-reveal` : null);
            }
            currentGameState.guesses.forEach(g => drawFeedbackRow(g));
            if (currentGameState.completed) {
                revealFullImage();
                displayTerminationState();
            } else {
                buildOverlay();
                refreshImageDisplay();
            }
        }
    } catch (e) {
        console.error("Session restoration error:", e);
    }
}

// Initialization Lifecycle Hook
window.addEventListener('DOMContentLoaded', () => {
    fetch('vehicles.json')
        .then(res => {
            if (!res.ok) {
                throw new Error(`Unable to load game data (${res.status})`);
            }
            return res.json();
        })
        .then(rawJson => {
            gameDatabase = normaliseData(rawJson);
            startGame('daily');

            searchableCars = [...gameDatabase].sort((a, b) => {
                const left = normalizeForSearch(`${a.make} ${a.model}`);
                const right = normalizeForSearch(`${b.make} ${b.model}`);
                return left.localeCompare(right, 'en', { sensitivity: 'base' });
            });

            const input = document.getElementById('user-input');
            const suggestions = document.getElementById('car-suggestions');
            const inputWrapper = document.querySelector('.input-wrapper');
            const submitButton = document.getElementById('submit-btn');
            const dailyButton = document.getElementById('daily-play-btn');
            const randomButton = document.getElementById('random-play-btn');

            if (inputWrapper && !document.querySelector('.search-header-bar')) {
                const headerBar = document.createElement('div');
                headerBar.className = 'search-header-bar';
                headerBar.innerHTML = `
                    <span class="search-header-title">Search Vehicles</span>
                    <button type="button" class="close-search-btn" id="close-search-btn">Close</button>
                `;
                inputWrapper.insertBefore(headerBar, inputWrapper.firstChild);

                const closeButton = document.getElementById('close-search-btn');
                if (closeButton) {
                    closeButton.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                    });
                    closeButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        closeSearchOverlay();
                    });
                }
            }

            if (input) {
                input.addEventListener('focus', () => {
                    openSearchOverlay();
                    renderSuggestions(input.value);
                });

                input.addEventListener('input', () => renderSuggestions(input.value));

                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        processGuess();
                    } else if (event.key === 'Escape') {
                        closeSearchOverlay();
                    }
                });
            }

            if (suggestions) {
                suggestions.addEventListener('click', (event) => {
                    const suggestionButton = event.target.closest('.suggestion-item');
                    if (!suggestionButton) return;

                    input.value = suggestionButton.dataset.label;
                    processGuess();
                });
            }

            if (inputWrapper) {
                document.addEventListener('click', (event) => {
                    if (!inputWrapper.contains(event.target)) {
                        closeSearchOverlay();
                    }
                });
            }

            hydrateSession();
            if (!currentGameState.completed) {
                refreshImageDisplay();
            }

            const targetImgEl = document.getElementById('target-image');
            if (targetImgEl) {
                targetImgEl.addEventListener('click', () => {
                    if (!targetCar || !currentGameState.isGameOver) return;
                    const gallery = [];
                    const seenImages = new Set();
                    const showTargetDetails = currentGameState.isGameOver;
                    currentGameState.guesses.forEach(g => {
                        if (g && g.image && !seenImages.has(g.image)) {
                            seenImages.add(g.image);
                            const isTarget = g.id === targetCar.id;
                            gallery.push({
                                imgSrc: g.image,
                                title: isTarget && !showTargetDetails ? 'Target Car' : `${g.make} ${g.model}`,
                                sub: isTarget && !showTargetDetails ? '' : `${g.country || ''}, ${g.year || ''}`,
                                notes: isTarget && !showTargetDetails ? '' : (g.notes || ''),
                                url: isTarget && !showTargetDetails ? '' : (g.url || '')
                            });
                        }
                    });
                    if (targetCar && targetCar.image && !seenImages.has(targetCar.image)) {
                        seenImages.add(targetCar.image);
                        gallery.push({
                            imgSrc: targetCar.image,
                            title: showTargetDetails ? `${targetCar.make} ${targetCar.model} (Target Car)` : 'Target Car',
                            sub: showTargetDetails ? `${targetCar.country || ''}, ${targetCar.year || ''}` : '',
                            notes: showTargetDetails ? (targetCar.notes || '') : '',
                            url: showTargetDetails ? (targetCar.url || '') : ''
                        });
                    }
                    const targetIdx = gallery.findIndex(item => item.imgSrc === targetCar.image);
                    openZoom(gallery, targetIdx >= 0 ? targetIdx : 0);
                });
            }

            if (submitButton) {
                submitButton.addEventListener('click', processGuess);
            }

            if (dailyButton) {
                dailyButton.addEventListener('click', () => startGame('daily'));
            }

            if (randomButton) {
                randomButton.addEventListener('click', () => startGame('random'));
            }

            const howToPlayBtn = document.getElementById('how-to-play-btn');
            const infoModal = document.getElementById('info-modal');
            const infoModalClose = document.getElementById('info-modal-close');

            if (howToPlayBtn && infoModal) {
                howToPlayBtn.addEventListener('click', () => {
                    infoModal.classList.add('active');
                    document.body.classList.add('modal-open');
                });
            }

            if (infoModalClose && infoModal) {
                infoModalClose.addEventListener('click', () => {
                    infoModal.classList.remove('active');
                    document.body.classList.remove('modal-open');
                });
            }

            if (infoModal) {
                infoModal.addEventListener('click', (e) => {
                    if (e.target === infoModal) {
                        infoModal.classList.remove('active');
                        document.body.classList.remove('modal-open');
                    }
                });
            }

            const resultsClose = document.getElementById('results-close');
            const resultsModal = document.getElementById('results-modal');
            const lightbox = document.getElementById('lightbox');
            const modalClose = document.getElementById('modal-close');
            const nextGameBtn = document.getElementById('next-game-btn');
            const viewResultsBtn = document.getElementById('view-results-btn');
            const inlinePlayAgainBtn = document.getElementById('inline-play-again-btn');

            const closeZoomModal = () => {
                if (lightbox) lightbox.classList.remove('active');
                if (!resultsModal || !resultsModal.classList.contains('active')) {
                    document.body.classList.remove('modal-open');
                }
            };

            const closeResultsPopup = () => {
                if (resultsModal) resultsModal.classList.remove('active');
                if (!lightbox || !lightbox.classList.contains('active')) {
                    document.body.classList.remove('modal-open');
                }
            };

            if (modalClose) {
                modalClose.addEventListener('click', closeZoomModal);
            }

            const lightboxPrev = document.getElementById('lightbox-prev');
            const lightboxNext = document.getElementById('lightbox-next');

            if (lightboxNext) {
                lightboxNext.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showNextAppZoom();
                });
            }

            if (lightboxPrev) {
                lightboxPrev.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showPrevAppZoom();
                });
            }

            let touchStartX = 0;
            let touchStartY = 0;

            if (lightbox) {
                lightbox.addEventListener('touchstart', (e) => {
                    if (e.touches && e.touches.length === 1) {
                        touchStartX = e.touches[0].clientX;
                        touchStartY = e.touches[0].clientY;
                    }
                }, { passive: true });

                lightbox.addEventListener('touchend', (e) => {
                    if (!e.changedTouches || e.changedTouches.length === 0) return;
                    const diffX = e.changedTouches[0].clientX - touchStartX;
                    const diffY = e.changedTouches[0].clientY - touchStartY;

                    if (Math.abs(diffX) > 35 && Math.abs(diffY) < 60) {
                        if (diffX < 0) {
                            showNextAppZoom();
                        } else {
                            showPrevAppZoom();
                        }
                    }
                }, { passive: true });

                lightbox.addEventListener('click', (e) => {
                    if (e.target === lightbox) {
                        closeZoomModal();
                    }
                });
            }

            window.addEventListener('keydown', (e) => {
                if (lightbox && lightbox.classList.contains('active')) {
                    if (e.key === 'ArrowRight') {
                        showNextAppZoom();
                    } else if (e.key === 'ArrowLeft') {
                        showPrevAppZoom();
                    } else if (e.key === 'Escape') {
                        closeZoomModal();
                    }
                }
            });

            if (resultsClose && resultsModal) {
                resultsClose.addEventListener('click', closeResultsPopup);

                resultsModal.addEventListener('click', (event) => {
                    if (event.target === resultsModal) {
                        closeResultsPopup();
                    }
                });
            }

            const modalPlayDailyBtn = document.getElementById('modal-play-daily-btn');
            const modalPlayRandomBtn = document.getElementById('modal-play-random-btn');
            const modalShareBtn = document.getElementById('modal-share-btn');
            const shareToast = document.getElementById('share-toast');

            if (modalShareBtn) {
                modalShareBtn.addEventListener('click', () => {
                    const shareInfo = getStandardShareText();
                    handleShareResult(shareInfo, modalShareBtn, shareToast);
                });
            }

            if (modalPlayDailyBtn) {
                modalPlayDailyBtn.addEventListener('click', () => {
                    if (resultsModal) resultsModal.classList.remove('active');
                    startGame('daily');
                });
            }

            if (modalPlayRandomBtn) {
                modalPlayRandomBtn.addEventListener('click', () => {
                    if (resultsModal) resultsModal.classList.remove('active');
                    startGame('random');
                });
            }

            if (viewResultsBtn && resultsModal) {
                viewResultsBtn.addEventListener('click', () => {
                    resultsModal.classList.add('active');
                });
            }

            if (inlinePlayAgainBtn) {
                inlinePlayAgainBtn.addEventListener('click', () => {
                    startGame('random');
                });
            }
        })
        .catch(err => console.error("Critical database fetch failure:", err));
});