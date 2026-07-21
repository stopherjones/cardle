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
    document.getElementById('daily-play-btn').classList.toggle('active', activeMode === 'daily');
    document.getElementById('random-play-btn').classList.toggle('active', activeMode === 'random');
}

function getCarDisplayLabel(car) {
    return `${car.make} ${car.model} (${car.country}, ${car.year})`;
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
    if (!normalizedQuery) {
        clearSuggestions();
        return;
    }

    const matches = searchableCars.filter(car => {
        const searchableText = `${car.make} ${car.model} ${car.country} ${car.year}`.toLowerCase();
        return searchableText.includes(normalizedQuery);
    });

    if (!matches.length) {
        suggestions.innerHTML = '<div class="suggestion-empty">No matches</div>';
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

function resetGameUI() {
    document.getElementById('guess-matrix').innerHTML = '';
    document.getElementById('user-input').value = '';
    clearSuggestions();
    document.getElementById('input-controls').classList.remove('hidden');
    document.getElementById('game-status').classList.add('hidden');
    document.getElementById('status-message').textContent = '';
    document.getElementById('solution-reveal').textContent = '';
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

    // Evaluation Logic Matrices
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

    inputField.value = ""; // Clear input buffer
    currentGameState.guesses.push(selectedCar);
    drawFeedbackRow(selectedCar);

    const isVictory = selectedCar.id === targetCar.id;
    const isExhausted = currentGameState.guesses.length >= MAX_GUESSES;

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
    document.getElementById('input-controls').classList.add('hidden');
    const panel = document.getElementById('game-status');
    const msg = document.getElementById('status-message');
    const reveal = document.getElementById('solution-reveal');

    panel.classList.remove('hidden');
    if (currentGameState.victory) {
        msg.textContent = `${targetCar.make} ${targetCar.model}, ${targetCar.year}, ${targetCar.country || 'Unknown'}`;
        msg.style.color = "var(--colour-correct)";
        reveal.innerHTML = `
            <div class="solution-details">
                <div>${targetCar.notes || 'No notes available.'}</div>
                ${targetCar.url ? `<div><a href="${targetCar.url}" target="_blank" rel="noopener noreferrer">Read more on Wikipedia</a></div>` : ''}
            </div>
        `;
    } else {
        msg.textContent = "Game Over";
        msg.style.color = "#d32f2f";
        reveal.textContent = `Target Car: ${targetCar.make} ${targetCar.model} (${targetCar.year})`;
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

            input.addEventListener('input', () => renderSuggestions(input.value));
            input.addEventListener('focus', () => renderSuggestions(input.value));
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    processGuess();
                }
            });

            suggestions.addEventListener('click', (event) => {
                const suggestionButton = event.target.closest('.suggestion-item');
                if (!suggestionButton) return;

                input.value = suggestionButton.dataset.label;
                clearSuggestions();
            });

            document.addEventListener('click', (event) => {
                if (!input.contains(event.target) && !suggestions.contains(event.target)) {
                    clearSuggestions();
                }
            });

            hydrateSession();
            if (!currentGameState.completed) {
                refreshImageDisplay();
            }

            document.getElementById('submit-btn').addEventListener('click', processGuess);
            document.getElementById('daily-play-btn').addEventListener('click', () => startGame('daily'));
            document.getElementById('random-play-btn').addEventListener('click', () => startGame('random'));
        })
        .catch(err => console.error("Critical database fetch failure:", err));
});