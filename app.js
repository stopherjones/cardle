// State Engine Configuration Management
const MAX_GUESSES = 6;
let gameDatabase = [];
let targetCar = null;
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

        if (isNaN(manufacturingYear) || !make || !model || !image) return;

        const qid = `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        if (!registry[qid]) {
            registry[qid] = {
                id: qid,
                model,
                make,
                country: country || 'Unknown',
                year: manufacturingYear,
                image
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

function resetGameUI() {
    document.getElementById('guess-matrix').innerHTML = '';
    document.getElementById('user-input').value = '';
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
    
    // Find matched object inside validated dictionary references
    const normalizedInput = inputString.toLowerCase();
    const selectedCar = gameDatabase.find(c => {
        const simpleMatch = `${c.make} ${c.model}`.toLowerCase() === normalizedInput;
        const modelMatch = c.model.toLowerCase() === normalizedInput;
        const formattedMatch = `${c.make} ${c.model} (${c.year})`.toLowerCase() === normalizedInput;
        const countryFormattedMatch = `${c.make} ${c.model} (${c.country}, ${c.year})`.toLowerCase() === normalizedInput;
        return simpleMatch || modelMatch || formattedMatch || countryFormattedMatch;
    });

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
        msg.textContent = "Victory achieved!";
        msg.style.color = "var(--colour-correct)";
    } else {
        msg.textContent = "Game Over";
        msg.style.color = "#d32f2f";
    }
    reveal.textContent = `Target Car: ${targetCar.make} ${targetCar.model} (${targetCar.year})`;
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

            // Populate the dropdown options for the guess selector
            const select = document.getElementById('user-input');
            select.innerHTML = '<option value="">Select a car...</option>';
            const sortedCars = [...gameDatabase].sort((a, b) => {
                const left = `${a.make} ${a.model}`.toLowerCase();
                const right = `${b.make} ${b.model}`.toLowerCase();
                return left.localeCompare(right);
            });

            sortedCars.forEach(car => {
                const opt = document.createElement('option');
                const displayLabel = `${car.make} ${car.model} (${car.country}, ${car.year})`;
                opt.value = displayLabel;
                opt.textContent = displayLabel;
                select.appendChild(opt);
            });

            hydrateSession();
            if (!currentGameState.completed) {
                refreshImageDisplay();
            }

            document.getElementById('submit-btn').addEventListener('click', processGuess);
            document.getElementById('user-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') processGuess();
            });
            document.getElementById('daily-play-btn').addEventListener('click', () => startGame('daily'));
            document.getElementById('random-play-btn').addEventListener('click', () => startGame('random'));
        })
        .catch(err => console.error("Critical database fetch failure:", err));
});