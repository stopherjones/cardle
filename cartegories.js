document.addEventListener('DOMContentLoaded', () => {
  let gameDatabase = [];
  let roundVehicles = [];
  let selectedCarId = null;
  let gameLocked = false;
  let roundNumber = 1;
  let score = 0;
  let lastTotalScore = 0;
  let currentMode = 'daily';
  const assignments = { make: null, model: null, country: null, year: null };
  const optionsPool = { make: [], model: [], country: [], year: [] };
  const CATEGORY_LABELS = { make: 'Make', model: 'Model', country: 'Country', year: 'Year' };

  const vehiclePool = document.getElementById('vehicle-pool');
  const categoryZones = document.querySelectorAll('.category-zone');
  const submitBtn = document.getElementById('submit-btn');
  const scoreEl = document.getElementById('score');
  const roundIndicator = document.getElementById('round-indicator');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const modalClose = document.getElementById('modal-close');
  const resultsModal = document.getElementById('results-modal');
  const resultsList = document.getElementById('results-list');
  const resultsSummary = document.getElementById('results-summary');
  const resultsClose = document.getElementById('results-close');
  const nextRoundBtn = document.getElementById('next-round-btn');
  const dailyPlayBtn = document.getElementById('daily-play-btn');
  const randomPlayBtn = document.getElementById('random-play-btn');

  // Country Normalisation and Helper Utilities
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
    const s = String(str).trim().toLowerCase();
    if (['usa', 'us', 'united states of america', 'america'].includes(s)) return 'united states';
    if (['uk', 'great britain', 'britain', 'england'].includes(s)) return 'united kingdom';
    if (['ussr', 'soviet union'].includes(s)) return 'ussr';
    return s;
  }

  function checkCountryMatch(guess, carCountries, carCountryDisplay) {
    if (!guess) return false;
    const normalizedGuess = normalizeCountryName(guess);

    if (normalizeCountryName(carCountryDisplay) === normalizedGuess) return true;

    for (const c of carCountries) {
      if (normalizeCountryName(c) === normalizedGuess) return true;
    }

    const guessCountries = parseCountries(guess);
    for (const gc of guessCountries) {
      for (const cc of carCountries) {
        if (normalizeCountryName(gc) === normalizeCountryName(cc)) return true;
      }
    }

    return false;
  }

  function hasValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim().toLowerCase();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'none' || trimmed === 'n/a') return false;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('data:image/');
  }

  // Shared Data Normalisation Pipeline
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

  // Populate unique options for the picker/type-ahead lists
  function populateOptionsPool() {
    optionsPool.make = [...new Set(gameDatabase.map(c => c.make))].sort();
    optionsPool.model = [...new Set(gameDatabase.map(c => c.model))].sort();

    const allCountries = new Set();
    gameDatabase.forEach(c => {
      const list = c.countries && c.countries.length ? c.countries : parseCountries(c.country);
      list.forEach(cnt => allCountries.add(cnt));
    });
    optionsPool.country = [...allCountries].sort();

    optionsPool.year = [...new Set(gameDatabase.map(c => String(c.year)))].sort((a, b) => a - b);
  }

  async function loadData() {
    try {
      const res = await fetch('vehicles.json');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const rawJson = await res.json();
      const dataset = Array.isArray(rawJson) ? rawJson : (rawJson.vehicles || []);
      
      gameDatabase = normaliseData(dataset);
      populateOptionsPool();
      setupTypeahead();
      updateModeButtons('daily');
      setupRound('daily');
    } catch (err) {
      console.error('Data load error:', err);
      if (vehiclePool) {
        vehiclePool.innerHTML = `<p style="color:var(--danger); grid-column:span 2;">Failed to load vehicles.json</p>`;
      }
    }
  }

  // Type-Ahead / Picker Component Implementation
  function setupTypeahead() {
    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const inputContainer = zone.querySelector('.input-container');
      const input = zone.querySelector(`[data-input="${category}"]`);

      if (!inputContainer || !input) return;
      inputContainer.classList.add('picker-shell');

      let resultsDiv = inputContainer.querySelector('.suggestions-list');
      if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.className = 'suggestions-list hidden';
        resultsDiv.dataset.results = category;
        resultsDiv.setAttribute('role', 'listbox');
        inputContainer.appendChild(resultsDiv);
      }

      if (!inputContainer.querySelector('.search-header-bar')) {
        const headerBar = document.createElement('div');
        headerBar.className = 'search-header-bar';
        headerBar.innerHTML = `
          <span class="search-header-title">Search Vehicles</span>
          <button type="button" class="close-search-btn" aria-label="Close search overlay">Close</button>
        `;
        inputContainer.insertBefore(headerBar, inputContainer.firstChild);

        const closeBtn = headerBar.querySelector('.close-search-btn');
        if (closeBtn) {
          closeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
          });
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllTypeaheads();
          });
        }
      }

      const triggerPicker = () => {
        if (input.disabled) return;
        openSearchOverlay(inputContainer);
        renderTypeahead(category, input.value, resultsDiv, input);
      };

      input.addEventListener('focus', triggerPicker);
      input.addEventListener('input', triggerPicker);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeAllTypeaheads();
        }
      });
      input.addEventListener('blur', () => {
        window.setTimeout(closeAllTypeaheads, 120);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.picker-shell')) {
        closeAllTypeaheads();
      }
    });
  }

  function openSearchOverlay(wrapper) {
    if (!wrapper) return;
    wrapper.classList.add('overlay-open');
    document.body.classList.add('search-overlay-active');
  }

  function closeSearchOverlay(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('overlay-open');
    document.body.classList.remove('search-overlay-active');
    const input = wrapper.querySelector('input');
    if (input) {
      input.blur();
    }
    const suggestions = wrapper.querySelector('.suggestions-list');
    if (suggestions) {
      suggestions.innerHTML = '';
      suggestions.classList.add('hidden');
    }
  }

  function closeAllTypeaheads() {
    document.querySelectorAll('.picker-shell.overlay-open').forEach(wrapper => {
      closeSearchOverlay(wrapper);
    });
  }

  function renderTypeahead(category, query, container, input) {
    const list = optionsPool[category] || [];
    const normalized = query.trim().toLowerCase();

    const matches = normalized
      ? list.filter(item => String(item).toLowerCase().includes(normalized))
      : list;

    let itemsHtml = '';
    if (matches.length === 0) {
      itemsHtml = `<div class="suggestion-empty">No matching ${category}s</div>`;
    } else {
      itemsHtml = matches.map(item => `
        <button type="button" class="suggestion-item" data-value="${item}">${item}</button>
      `).join('');
    }

    container.innerHTML = `
      <button type="button" class="lucky-suggestion-btn">
        <span>🎲</span> I'm feeling lucky
      </button>
      ${itemsHtml}
    `;

    container.classList.remove('hidden');

    const luckyBtn = container.querySelector('.lucky-suggestion-btn');
    if (luckyBtn) {
      luckyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pool = (matches && matches.length > 0) ? matches : list;
        if (pool && pool.length > 0) {
          const randomItem = pool[Math.floor(Math.random() * pool.length)];
          input.value = randomItem;
          const picker = input.closest('.picker-shell');
          if (picker) {
            closeSearchOverlay(picker);
          }
          checkSubmissionState();
        }
      });
    }

    container.querySelectorAll('.suggestion-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const picker = input.closest('.picker-shell');
        input.value = btn.dataset.value;
        if (picker) {
          closeSearchOverlay(picker);
        }
        checkSubmissionState();
      });
    });
  }

  function getDateStamp(date = new Date()) {
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.getDateStamp) {
      return CardleDailyEngine.getDateStamp(date);
    }
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function getDailyVehicles() {
    if (gameDatabase.length < 4) return [];
    if (typeof CardleDailyEngine !== 'undefined' && CardleDailyEngine.getDailyCartegoriesVehicles) {
      return CardleDailyEngine.getDailyCartegoriesVehicles(gameDatabase);
    }
    const dateStamp = getDateStamp();
    let computationHash = 0;
    for (let i = 0; i < dateStamp.length; i++) {
      computationHash = dateStamp.charCodeAt(i) + ((computationHash << 5) - computationHash);
    }
    const startIndex = Math.abs(computationHash) % gameDatabase.length;
    const selected = [];
    const step = 7;
    for (let i = 0; i < gameDatabase.length && selected.length < 4; i++) {
      const idx = (startIndex + i * step) % gameDatabase.length;
      if (!selected.includes(gameDatabase[idx])) {
        selected.push(gameDatabase[idx]);
      }
    }
    return selected;
  }

  function updateModeButtons(mode) {
    currentMode = mode;
    if (dailyPlayBtn) dailyPlayBtn.classList.toggle('active', mode === 'daily');
    if (randomPlayBtn) randomPlayBtn.classList.toggle('active', mode === 'random');
  }

  function setupRound(mode = currentMode) {
    if (gameDatabase.length < 4) return;

    let selectedCars = [];
    if (mode === 'daily') {
      selectedCars = getDailyVehicles();
    } else {
      const shuffled = [...gameDatabase].sort(() => 0.5 - Math.random());
      selectedCars = shuffled.slice(0, 4);
    }

    roundVehicles = selectedCars.map((car, idx) => ({
      ...car,
      labelId: car.id,
      displayLabel: `Car ${String.fromCharCode(65 + idx)}`
    }));

    renderPool();
  }

  function renderPool() {
    if (!vehiclePool) return;

    vehiclePool.innerHTML = '';
    roundVehicles.forEach(car => {
      const isAssigned = Object.values(assignments).includes(car.labelId);
      if (!isAssigned) {
        const card = document.createElement('div');
        card.className = `car-card ${selectedCarId === car.labelId ? 'selected' : ''}`;
        card.draggable = true;

        card.innerHTML = `
          <img src="${car.image}" alt="${car.displayLabel}">
          <button class="zoom-btn" data-img="${car.image}">🔍 Zoom</button>
        `;

        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', car.labelId);
        });

        card.addEventListener('click', (e) => {
          if (gameLocked || e.target.classList.contains('zoom-btn')) return;
          selectedCarId = selectedCarId === car.labelId ? null : car.labelId;
          renderPool();
        });

        card.querySelector('.zoom-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openZoom(car.image);
        });

        vehiclePool.appendChild(card);
      }
    });
  }

  categoryZones.forEach(zone => {
    const category = zone.dataset.category;

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', (e) => {
      if (gameLocked) return;
      e.preventDefault();
      zone.classList.remove('drag-over');
      const carId = e.dataTransfer.getData('text/plain');
      assignCar(carId, category);
    });

    zone.addEventListener('click', (e) => {
      if (gameLocked) return;
      if (selectedCarId && !assignments[category] && !e.target.closest('input, button')) {
        assignCar(selectedCarId, category);
        selectedCarId = null;
      }
    });
  });

  function assignCar(carId, category) {
    if (gameLocked) return;

    for (let cat in assignments) {
      if (assignments[cat] === carId) assignments[cat] = null;
    }
    assignments[category] = carId;
    updateUI();

    const zone = document.querySelector(`.category-zone[data-category="${category}"]`);
    if (zone) {
      const inputContainer = zone.querySelector('.picker-shell');
      const input = zone.querySelector(`[data-input="${category}"]`);
      const resultsDiv = zone.querySelector('.suggestions-list');
      if (inputContainer && input && resultsDiv) {
        setTimeout(() => {
          openSearchOverlay(inputContainer);
          renderTypeahead(category, input.value, resultsDiv, input);
          input.focus();
        }, 10);
      }
    }
  }

  function ejectCar(category) {
    if (gameLocked) return;

    assignments[category] = null;
    const input = document.querySelector(`[data-input="${category}"]`);
    if (input) input.value = '';
    closeAllTypeaheads();
    updateUI();
  }

  function updateUI() {
    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const carId = assignments[category];
      const dockSlot = zone.querySelector('.dock-slot');
      const input = zone.querySelector(`[data-input="${category}"]`);

      if (carId) {
        const car = roundVehicles.find(v => v.labelId === carId);
        const fullCarName = `${car.year} ${car.make} ${car.model}`;
        const displayLabel = gameLocked ? `${car.displayLabel}: ${fullCarName}` : car.displayLabel;
        const linkHtml = (gameLocked && car.url) ? `<a href="${escapeHtml(car.url)}" target="_blank" rel="noopener noreferrer" class="docked-link" title="Learn more about ${escapeHtml(fullCarName)}">🔗 Info ↗</a>` : '';

        dockSlot.innerHTML = `
          <div class="docked-thumbnail ${gameLocked ? 'locked' : ''}">
            <img src="${escapeHtml(car.image)}" alt="${escapeHtml(fullCarName)}">
            <div class="docked-info">
              <span class="docked-label">${escapeHtml(displayLabel)}</span>
              ${linkHtml}
            </div>
            ${!gameLocked ? `<button class="eject-btn" data-eject="${category}">✕</button>` : ''}
          </div>
        `;
        input.disabled = gameLocked;

        if (!gameLocked) {
          const ejectBtn = dockSlot.querySelector('.eject-btn');
          if (ejectBtn) {
            ejectBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              ejectCar(category);
            });
          }
        }
      } else {
        dockSlot.innerHTML = '';
        if (input) {
          input.value = '';
          input.disabled = true;
        }
      }
    });

    renderPool();
    checkSubmissionState();
  }

  function checkSubmissionState() {
    const allAssigned = Object.values(assignments).every(val => val !== null);
    let allInputsFilled = true;

    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const input = zone.querySelector(`[data-input="${category}"]`);
      if (!input.disabled && !input.value.trim()) {
        allInputsFilled = false;
      }
    });

    submitBtn.disabled = gameLocked || !(allAssigned && allInputsFilled);
  }

  function normaliseForCompare(value, category) {
    const trimmed = String(value ?? '').trim();
    if (category === 'year') {
      const num = parseInt(trimmed, 10);
      return Number.isNaN(num) ? trimmed.toLowerCase() : num;
    }
    return trimmed.toLowerCase();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatActualValue(car, category) {
    return category === 'year' ? String(car.year) : car[category];
  }

  function processSubmission() {
    if (gameLocked || submitBtn.disabled) return;

    const results = [];
    let totalScore = 0;

    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const carId = assignments[category];
      const car = roundVehicles.find(v => v.labelId === carId);
      const input = zone.querySelector(`[data-input="${category}"]`);
      const guess = input ? input.value.trim() : '';
      const actual = car[category];
      const fullCarName = `${car.year} ${car.make} ${car.model}`;

      let points = 0;
      let maxPoints = 1;
      let isCorrect = false;

      if (category === 'country') {
        maxPoints = 1;
        isCorrect = checkCountryMatch(guess, car.countries || [car.country], car.country);
        points = isCorrect ? 1 : 0;
      } else if (category === 'make') {
        maxPoints = 1;
        isCorrect = normaliseForCompare(guess, 'make') === normaliseForCompare(actual, 'make');
        points = isCorrect ? 1 : 0;
      } else if (category === 'model') {
        maxPoints = 3;
        isCorrect = normaliseForCompare(guess, 'model') === normaliseForCompare(actual, 'model');
        points = isCorrect ? 3 : 0;
      } else if (category === 'year') {
        maxPoints = 5;
        const guessYear = parseInt(guess, 10);
        const actualYear = parseInt(actual, 10);
        if (!isNaN(guessYear) && !isNaN(actualYear)) {
          const diff = Math.abs(guessYear - actualYear);
          points = Math.max(0, 5 - diff);
          isCorrect = (diff === 0);
        } else {
          isCorrect = normaliseForCompare(guess, 'year') === normaliseForCompare(actual, 'year');
          points = isCorrect ? 5 : 0;
        }
      }

      totalScore += points;

      results.push({
        category,
        label: CATEGORY_LABELS[category],
        carLabel: car.displayLabel,
        fullCarName: fullCarName,
        carUrl: car.url || '',
        carImage: car.image,
        guess,
        actual: formatActualValue(car, category),
        points,
        maxPoints,
        isCorrect
      });
    });

    score += totalScore;
    if (scoreEl) scoreEl.textContent = String(score);

    lockGame();
    showResults(results, totalScore);
  }

  function showResults(results, totalScore) {
    if (!resultsModal || !resultsList || !resultsSummary) return;
    lastTotalScore = totalScore;

    resultsList.innerHTML = results.map(result => {
      let statusClass = 'incorrect';
      let statusText = '✕ Incorrect';

      if (result.isCorrect) {
        statusClass = 'correct';
        statusText = '✓ Correct';
      } else if (result.points > 0) {
        statusClass = 'partial';
        statusText = '~ Close';
      }

      const pointsBadge = `${result.points} / ${result.maxPoints} ${result.maxPoints === 1 ? 'point' : 'points'}`;
      const urlLinkHtml = result.carUrl
        ? `<a href="${escapeHtml(result.carUrl)}" target="_blank" rel="noopener noreferrer" class="result-url-link">🌐 Learn more about ${escapeHtml(result.fullCarName)} ↗</a>`
        : '';

      return `
        <div class="result-row ${statusClass}">
          <img class="result-thumb" src="${escapeHtml(result.carImage)}" alt="${escapeHtml(result.fullCarName)}">
          <div class="result-body">
            <div class="result-header">
              <span class="result-category">${escapeHtml(result.label)}</span>
              <span class="result-status ${statusClass}">
                ${statusText} (${pointsBadge})
              </span>
            </div>
            <div class="result-car-title">
              <span class="car-badge">${escapeHtml(result.carLabel)}:</span>
              <strong class="car-name-text">${escapeHtml(result.fullCarName)}</strong>
            </div>
            <div class="result-guess">Your guess: ${escapeHtml(result.guess)}</div>
            ${result.isCorrect ? '' : `<div class="result-answer">Correct answer: <strong>${escapeHtml(result.actual)}</strong></div>`}
            ${urlLinkHtml ? `<div class="result-link-container">${urlLinkHtml}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    const isDaily = currentMode === 'daily';
    const dateSuffix = isDaily ? ` for ${getFormattedDate()}` : '';
    resultsSummary.innerHTML = `I scored <strong>${totalScore} / 10</strong> on Cardle CARtegories${dateSuffix}!`;
    resultsModal.classList.add('active');
  }

  function getFormattedDate(dateStr) {
    let d = new Date();
    if (dateStr && typeof dateStr === 'string' && !dateStr.startsWith('random')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    }
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function getCARtegoriesShareText() {
    const indexUrl = window.location.origin + '/cartegories.html';
    const isDaily = currentMode === 'daily';
    const dateSuffix = isDaily ? ` for ${getFormattedDate()}` : '';
    const text = `I scored ${lastTotalScore}/10 on Cardle CARtegories${dateSuffix}! 🚗`;
    return {
      title: 'Cardle CARtegories',
      text: text,
      url: indexUrl,
      fullText: `${text}\n${indexUrl}`
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

  function closeResultsModal() {
    if (resultsModal) {
      resultsModal.classList.remove('active');
    }
    const toast = document.getElementById('share-toast');
    if (toast) {
      toast.classList.add('hidden');
    }
  }

  function lockGame() {
    gameLocked = true;
    submitBtn.disabled = true;
    selectedCarId = null;

    categoryZones.forEach(zone => {
      const input = zone.querySelector('[data-input]');
      if (input) input.disabled = true;
    });

    updateUI();
  }

  function startNewGame(mode = currentMode) {
    closeResultsModal();
    updateModeButtons(mode);
    gameLocked = false;
    selectedCarId = null;

    for (const category in assignments) {
      assignments[category] = null;
    }

    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const input = zone.querySelector(`[data-input="${category}"]`);
      if (input) {
        input.value = '';
        input.disabled = true;
      }
      const dockSlot = zone.querySelector('.dock-slot');
      if (dockSlot) {
        dockSlot.innerHTML = '';
      }
    });

    closeAllTypeaheads();
    setupRound(mode);
    updateUI();
  }

  function startNextRound() {
    startNewGame(currentMode === 'daily' ? 'random' : 'random');
  }

  if (dailyPlayBtn) {
    dailyPlayBtn.addEventListener('click', () => startNewGame('daily'));
  }

  if (randomPlayBtn) {
    randomPlayBtn.addEventListener('click', () => startNewGame('random'));
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', processSubmission);
  }

  if (resultsClose) {
    resultsClose.addEventListener('click', closeResultsModal);
  }

  const modalPlayDailyBtn = document.getElementById('modal-play-daily-btn');
  const modalPlayRandomBtn = document.getElementById('modal-play-random-btn');
  const modalShareBtn = document.getElementById('modal-share-btn');
  const shareToast = document.getElementById('share-toast');

  if (modalShareBtn) {
    modalShareBtn.addEventListener('click', () => {
      const shareInfo = getCARtegoriesShareText();
      handleShareResult(shareInfo, modalShareBtn, shareToast);
    });
  }

  if (modalPlayDailyBtn) {
    modalPlayDailyBtn.addEventListener('click', () => {
      startNewGame('daily');
    });
  }

  if (modalPlayRandomBtn) {
    modalPlayRandomBtn.addEventListener('click', () => {
      startNewGame('random');
    });
  }

  if (resultsModal) {
    resultsModal.addEventListener('click', (e) => {
      if (e.target === resultsModal) {
        closeResultsModal();
      }
    });
  }

  document.querySelectorAll('[data-input]').forEach(input => {
    input.addEventListener('input', checkSubmissionState);
  });

  function openZoom(imgSrc) {
    if (lightboxImg) {
      lightboxImg.src = imgSrc;
    }
    if (lightbox) {
      lightbox.classList.add('active');
    }
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      if (lightbox) {
        lightbox.classList.remove('active');
      }
    });
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        lightbox.classList.remove('active');
      }
    });
  }

  loadData();
});
