// State Engine Configuration Management
const MAX_GUESSES = 6;
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

// 1. Data Normalisation and Sanitisation Pipeline
function normaliseData(rawItems) {
    const registry = {};

    rawItems.forEach(item => {
        const make = String(item.Make ?? item.make ?? item.manufacturerLabel ?? '').trim();
        const model = String(item.Model ?? item.model ?? item.carLabel ?? '').trim();
        const country = String(item.Country ?? item.country ?? item.countryLabel ?? 'Unknown').trim();
        const manufacturingYear = parseInt(item.Year ?? item.year, 10);
        const image = String(item.imageurl ?? item.image ?? item.imageUrl ?? '').trim();
        const notes = String(item.notes ?? item.Notes ?? '').trim();
        const url = String(item.url ?? item.URL ?? item.link ?? item.sourceUrl ?? '').trim();

        if (isNaN(manufacturingYear) || !make || !model || !image) return;

        const qid = `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        if (!registry[qid]) {
            registry[qid] = {
                id: qid,
                model,
                make,
                country: country || 'Unknown',
                year: manufacturingYear,
                image,
                notes,
                url
            };
        }
    });

    return Object.values(registry);
}

function getDateStamp(date = new Date()) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// 2. Deterministic Chronological Seed Mapping
function calculateDailyTarget(carsList) {
    const dateStamp = getDateStamp();
    currentGameState.date = dateStamp;

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

function shuffleArray(items) {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled;
}

function createRandomRevealOrder(cellCount = 6) {
    return shuffleArray(Array.from({ length: cellCount }, (_, index) => index));
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
    if (!suggestions) return;

    const normalizedQuery = query.trim().toLowerCase();
    
    // In overlay mode, show popular/all top results if query is empty
    let matches = searchableCars;
    if (normalizedQuery) {
        matches = searchableCars.filter(car => {
            const searchableText = `${car.make} ${car.model} ${car.country} ${car.year}`.toLowerCase();
            return searchableText.includes(normalizedQuery);
        });
    }

    if (!matches.length) {
        suggestions.innerHTML = '<div class="suggestion-empty">No matching vehicles found</div>';
        suggestions.classList.remove('hidden');
        return;
    }

    suggestions.innerHTML = matches.slice(0, 50).map(car => `
        <button type="button" class="suggestion-item" data-label="${getCarDisplayLabel(car)}">
            ${getCarDisplayLabel(car)}
        </button>
    `).join('');
    suggestions.classList.remove('hidden');
}

function findCarByInput(inputString) {
    const trimmedInput = inputString.trim();
    if (!trimmedInput) return null;

    const normalizedInput = trimmedInput.toLowerCase();

    const exactLabelMatch = searchableCars.find(car => getCarDisplayLabel(car).toLowerCase() === normalizedInput);
    if (exactLabelMatch) return exactLabelMatch;

    const simpleMatch = searchableCars.find(car => `${car.make} ${car.model}`.toLowerCase() === normalizedInput);
    if (simpleMatch) return simpleMatch;

    const modelMatch = searchableCars.find(car => car.model.toLowerCase() === normalizedInput);
    if (modelMatch) return modelMatch;

    const yearMatch = searchableCars.find(car => String(car.year) === normalizedInput);
    if (yearMatch) return yearMatch;

    const countryMatch = searchableCars.find(car => car.country.toLowerCase() === normalizedInput);
    if (countryMatch) return countryMatch;

    return searchableCars.find(car => {
        const searchableText = `${car.make} ${car.model} ${car.country} ${car.year}`.toLowerCase();
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
    currentGameState = {
        date: mode === 'daily' ? getDateStamp() : `random-${Date.now()}`,
        guesses: [],
        completed: false,
        victory: false,
        mode,
        overlayHiddenIndices: [],
        revealOrder: createRandomRevealOrder()
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
    const countryMatch = guessObj.country === targetCar.country;
    
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
        for (let i = 0; i < 6; i += 1) {
            const cell = document.createElement('div');
            cell.className = 'overlay-cell';
            overlay.appendChild(cell);
        }
    }

    const tilePositions = shuffleArray([
        [1, 1], [1, 2], [1, 3],
        [2, 1], [2, 2], [2, 3]
    ]);

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

    const badgeClass = isWin ? 'victory' : 'defeat';
    const badgeText = isWin
        ? `Guessed in ${currentGameState.guesses.length}/${MAX_GUESSES} tries!`
        : `Out of guesses (${MAX_GUESSES}/${MAX_GUESSES})`;

    bodyEl.innerHTML = `
        <div class="result-card">
            <div class="result-card-header">
                <img class="result-card-img" src="${escapeHtml(targetCar.image)}" alt="${escapeHtml(targetCar.make + ' ' + targetCar.model)}">
                <div class="result-card-info">
                    <div class="result-card-title">${escapeHtml(targetCar.make)} ${escapeHtml(targetCar.model)}</div>
                    <div class="result-card-sub">${escapeHtml(targetCar.country || 'Unknown')}, ${targetCar.year}</div>
                    <span class="result-card-badge ${badgeClass}">${badgeText}</span>
                </div>
            </div>
            ${targetCar.notes ? `<div class="result-card-notes">${escapeHtml(targetCar.notes)}</div>` : ''}
            ${targetCar.url ? `<div class="result-card-link"><a href="${escapeHtml(targetCar.url)}" target="_blank" rel="noopener noreferrer">Read more on Wikipedia →</a></div>` : ''}
        </div>
    `;

    modal.classList.add('active');
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
                currentGameState.revealOrder = createRandomRevealOrder();
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
                const left = `${a.make} ${a.model}`.toLowerCase();
                const right = `${b.make} ${b.model}`.toLowerCase();
                return left.localeCompare(right);
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

            if (submitButton) {
                submitButton.addEventListener('click', processGuess);
            }

            if (dailyButton) {
                dailyButton.addEventListener('click', () => startGame('daily'));
            }

            if (randomButton) {
                randomButton.addEventListener('click', () => startGame('random'));
            }

            const resultsClose = document.getElementById('results-close');
            const resultsModal = document.getElementById('results-modal');
            const nextGameBtn = document.getElementById('next-game-btn');
            const viewResultsBtn = document.getElementById('view-results-btn');
            const inlinePlayAgainBtn = document.getElementById('inline-play-again-btn');

            if (resultsClose && resultsModal) {
                resultsClose.addEventListener('click', () => {
                    resultsModal.classList.remove('active');
                });

                resultsModal.addEventListener('click', (event) => {
                    if (event.target === resultsModal) {
                        resultsModal.classList.remove('active');
                    }
                });
            }

            const modalPlayDailyBtn = document.getElementById('modal-play-daily-btn');
            const modalPlayRandomBtn = document.getElementById('modal-play-random-btn');

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