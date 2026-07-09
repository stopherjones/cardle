// State Engine Configuration Management
const MAX_GUESSES = 6;
let gameDatabase = [];
let targetCar = null;
let currentGameState = {
    date: "",
    guesses: [],
    completed: false,
    victory: false,
    mode: "daily"
};

// 1. Data Normalisation and Sanitisation Pipeline
function normaliseData(rawItems) {
    const registry = {};

    rawItems.forEach(item => {
        // Extract plain year integers
        const manufacturingYear = parseInt(item.year, 10);
        
        // Context Filtering: Exclude anomalies outside the 20th Century spectrum
        if (isNaN(manufacturingYear) || manufacturingYear < 1900 || manufacturingYear > 1999) return;
        
        // Structural Sanitisation: Reject fallback system entities missing clean identifiers
        if (!item.carLabel || item.carLabel.startsWith('Q') || !item.image) return;

        // Isolate short-code string QID keys
        const qid = item.car.split('/').pop();

        if (!registry[qid]) {
            registry[qid] = {
                id: qid,
                model: item.carLabel.trim(),
                make: item.manufacturerLabel ? item.manufacturerLabel.trim() : "Unknown",
                country: item.countryLabel ? item.countryLabel.trim() : "Unknown",
                year: manufacturingYear,
                image: item.image
            };
        } else {
            // Append multi-property items cleanly to resolve flat join arrays
            if (item.manufacturerLabel && !registry[qid].make.includes(item.manufacturerLabel.trim())) {
                registry[qid].make += ` / ${item.manufacturerLabel.trim()}`;
            }
            if (item.countryLabel && !registry[qid].country.includes(item.countryLabel.trim())) {
                registry[qid].country += ` / ${item.countryLabel.trim()}`;
            }
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
        mode
    };

    targetCar = selectTargetForMode(gameDatabase, mode);
    resetGameUI();
    updateModeButtons(mode);
    document.getElementById('target-image').src = targetCar.image;
    adjustImageBlur(0);
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

// 4. Blur State Modifier Loop
function adjustImageBlur(guessCount) {
    const img = document.getElementById('target-image');
    img.className = ""; // Reset base class mutations
    
    if (currentGameState.completed) {
        img.classList.add('unblurred');
        return;
    }

    switch(guessCount) {
        case 0: img.classList.add('blurred-image'); break;
        case 1: img.classList.add('blur-step-1'); break;
        case 2: img.classList.add('blur-step-2'); break;
        case 3: img.classList.add('blur-step-3'); break;
        case 4: img.classList.add('blur-step-4'); break;
        case 5: img.classList.add('blur-step-5'); break;
        default: img.classList.add('unblurred');
    }
}

// 5. User Input Handler Event Pipeline
function processGuess() {
    if (currentGameState.completed) return;

    const inputField = document.getElementById('user-input');
    const inputString = inputField.value.trim();
    
    // Find matched object inside validated dictionary references
    const selectedCar = gameDatabase.find(c => `${c.make} ${c.model}`.toLowerCase() === inputString.toLowerCase() || c.model.toLowerCase() === inputString.toLowerCase());

    if (!selectedCar) {
        alert("Please select a valid option directly from the provided drop-down listing.");
        return;
    }

    inputField.value = ""; // Clear input buffer
    currentGameState.guesses.push(selectedCar);
    drawFeedbackRow(selectedCar);

    const isVictory = selectedCar.id === targetCar.id;
    const isExhausted = currentGameState.guesses.length >= MAX_GUESSES;

    if (isVictory || isExhausted) {
        currentGameState.completed = true;
        currentGameState.victory = isVictory;
        displayTerminationState();
    }

    adjustImageBlur(currentGameState.guesses.length);
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
            currentGameState.guesses.forEach(g => drawFeedbackRow(g));
            if (currentGameState.completed) {
                displayTerminationState();
            }
            adjustImageBlur(currentGameState.guesses.length);
        }
    } catch (e) {
        console.error("Session restoration error:", e);
    }
}

// Initialization Lifecycle Hook
window.addEventListener('DOMContentLoaded', () => {
    fetch('query.json')
        .then(res => {
            if (!res.ok) {
                throw new Error(`Unable to load game data (${res.status})`);
            }
            return res.json();
        })
        .then(rawJson => {
            gameDatabase = normaliseData(rawJson);
            startGame('daily');

            // Populate HTML5 native datalist elements for UI suggestions
            const datalist = document.getElementById('car-options');
            gameDatabase.forEach(car => {
                const opt = document.createElement('option');
                opt.value = `${car.make} ${car.model}`;
                datalist.appendChild(opt);
            });

            hydrateSession();
            if (!currentGameState.completed) {
                adjustImageBlur(currentGameState.guesses.length);
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