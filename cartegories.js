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

      const cleanMake = stripAccents(make);
      const cleanModel = stripAccents(model);
      const qid = `${cleanMake}-${cleanModel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
    optionsPool.make = [...new Set(gameDatabase.map(c => c.make))].sort((a, b) => {
      const left = normalizeForSearch(a);
      const right = normalizeForSearch(b);
      return left.localeCompare(right, 'en', { sensitivity: 'base' });
    });
    optionsPool.model = [...new Set(gameDatabase.map(c => c.model))].sort((a, b) => {
      const left = normalizeForSearch(a);
      const right = normalizeForSearch(b);
      return left.localeCompare(right, 'en', { sensitivity: 'base' });
    });

    const allCountries = new Set();
    gameDatabase.forEach(c => {
      const list = c.countries && c.countries.length ? c.countries : parseCountries(c.country);
      list.forEach(cnt => allCountries.add(cnt));
    });
    optionsPool.country = [...allCountries].sort((a, b) => {
      const left = normalizeForSearch(a);
      const right = normalizeForSearch(b);
      return left.localeCompare(right, 'en', { sensitivity: 'base' });
    });

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
    const normalized = normalizeForSearch(query);

    const matches = normalized
      ? list.filter(item => normalizeForSearch(item).includes(normalized))
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
          const poolGallery = roundVehicles.map(v => ({
            imgSrc: v.image,
            title: gameLocked ? `${v.displayLabel}: ${v.year} ${v.make} ${v.model}` : v.displayLabel,
            notes: gameLocked ? (v.notes || '') : '',
            url: gameLocked ? (v.url || '') : ''
          }));
          const idx = roundVehicles.findIndex(v => v.labelId === car.labelId);
          openZoom(poolGallery, idx >= 0 ? idx : 0);
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
        const readMoreHtml = gameLocked ? getReadMoreHtml(car.make, car.model, car.url) : '';
        const linkHtml = readMoreHtml ? `<div class="docked-links" onclick="event.stopPropagation()">${readMoreHtml}</div>` : '';

        dockSlot.innerHTML = `
          <div class="docked-thumbnail ${gameLocked ? 'locked' : ''}">
            <img src="${escapeHtml(car.image)}" alt="${escapeHtml(fullCarName)}" style="cursor: pointer;" title="Click to zoom image">
            <div class="docked-info">
              <span class="docked-label">${escapeHtml(displayLabel)}</span>
              ${linkHtml}
            </div>
            ${!gameLocked ? `<button class="eject-btn" data-eject="${category}">✕</button>` : ''}
          </div>
        `;
        input.disabled = gameLocked;

        const dockedImg = dockSlot.querySelector('img');
        if (dockedImg) {
          dockedImg.addEventListener('click', (e) => {
            e.stopPropagation();
            const poolGallery = roundVehicles.map(v => ({
              imgSrc: v.image,
              title: gameLocked ? `${v.displayLabel}: ${v.year} ${v.make} ${v.model}` : v.displayLabel,
              make: gameLocked ? v.make : '',
              model: gameLocked ? v.model : '',
              notes: gameLocked ? (v.notes || '') : '',
              url: gameLocked ? (v.url || '') : ''
            }));
            const idx = roundVehicles.findIndex(v => v.labelId === car.labelId);
            openZoom(poolGallery, idx >= 0 ? idx : 0);
          });
        }

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
    return normalizeForSearch(trimmed);
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
        make: car.make,
        model: car.model,
        carUrl: car.url || '',
        carImage: car.image,
        carNotes: car.notes || '',
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

      const pointsBadge = `${result.points}/${result.maxPoints} pts`;
      const readMoreHtml = getReadMoreHtml(result.make, result.model, result.carUrl);

      return `
        <div class="result-card ${statusClass}">
          <div class="result-card-top">
            <span class="result-category">${escapeHtml(result.label)}</span>
            <span class="result-status ${statusClass}">${statusText} (${pointsBadge})</span>
          </div>
          <div class="result-card-content">
            <div class="result-thumb-shell" data-img="${escapeHtml(result.carImage)}" data-notes="${escapeHtml(result.carNotes || '')}">
              <img class="result-thumb" src="${escapeHtml(result.carImage)}" alt="${escapeHtml(result.fullCarName)}">
              <span class="thumb-zoom-badge">🔍</span>
            </div>
            <div class="result-body">
              <div class="result-car-title">
                <span class="car-badge">${escapeHtml(result.carLabel)}:</span>
                <span class="car-name-text">${escapeHtml(result.fullCarName)}</span>
              </div>
              <div class="result-guess-row">Guess: <strong>${escapeHtml(result.guess || '—')}</strong></div>
              ${result.isCorrect ? '' : `<div class="result-answer-row">Correct: <strong>${escapeHtml(result.actual)}</strong></div>`}
              ${readMoreHtml ? `<div class="result-card-link" onclick="event.stopPropagation()">${readMoreHtml}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const galleryItems = results.map(result => ({
      imgSrc: result.carImage,
      category: result.label,
      title: `${result.carLabel}: ${result.fullCarName}`,
      fullCarName: result.fullCarName,
      make: result.make,
      model: result.model,
      guess: result.guess,
      actual: result.actual,
      isCorrect: result.isCorrect,
      points: result.points,
      maxPoints: result.maxPoints,
      notes: result.carNotes,
      url: result.carUrl
    }));

    resultsList.querySelectorAll('.result-card').forEach((card, index) => {
      card.addEventListener('click', (e) => {
        openZoom(galleryItems, index);
      });
    });

    const isDaily = currentMode === 'daily';
    const dateSuffix = isDaily ? ` for ${getFormattedDate()}` : '';
    resultsSummary.innerHTML = `I scored <strong>${totalScore} / 10</strong> on Cardle CARtegories${dateSuffix}!`;
    resultsModal.classList.add('active');
    document.body.classList.add('modal-open');
  }

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
    if (!lightbox || !lightbox.classList.contains('active')) {
      document.body.classList.remove('modal-open');
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

  let currentGallery = [];
  let currentGalleryIndex = 0;

  const lightboxPrev = document.getElementById('lightbox-prev');
  const lightboxNext = document.getElementById('lightbox-next');
  const lightboxCounter = document.getElementById('lightbox-counter');

  function openZoom(items, initialIndex = 0) {
    if (!items) return;
    if (typeof items === 'string') {
      currentGallery = [{ imgSrc: items, notes: arguments[1] || '' }];
      currentGalleryIndex = 0;
    } else if (Array.isArray(items)) {
      currentGallery = items;
      currentGalleryIndex = Math.max(0, Math.min(initialIndex, currentGallery.length - 1));
    } else {
      currentGallery = [items];
      currentGalleryIndex = 0;
    }

    renderGalleryItem();
    if (lightbox) {
      lightbox.classList.add('active');
    }
    document.body.classList.add('modal-open');
  }

  function renderGalleryItem() {
    if (!currentGallery || currentGallery.length === 0) return;
    const item = currentGallery[currentGalleryIndex];
    if (!item) return;

    if (lightboxImg) {
      lightboxImg.src = item.imgSrc || item.image || item;
      lightboxImg.alt = item.title || item.fullCarName || 'Enlarged Vehicle View';
    }

    const captionEl = document.getElementById('lightbox-caption');
    if (captionEl) {
      let captionHtml = '';
      if (item.category || item.title || item.fullCarName) {
        const catBadge = item.category ? `<span class="lightbox-cat-badge">${escapeHtml(item.category)}</span>` : '';
        const titleText = item.title || item.fullCarName || '';
        captionHtml += `<div class="lightbox-caption-header">${catBadge}<strong>${escapeHtml(titleText)}</strong></div>`;
        const make = item.make || (item.fullCarName ? item.fullCarName.split(' ')[1] : '');
        const model = item.model || '';
        const wikiUrl = item.url || item.carUrl || '';
        const readMoreHtml = getReadMoreHtml(make, model, wikiUrl);
        if (readMoreHtml) {
          captionHtml += `<div class="lightbox-read-more">${readMoreHtml}</div>`;
        }
      }

      if (item.guess !== undefined && item.guess !== null) {
        const statusClass = item.isCorrect ? 'correct' : (item.points > 0 ? 'partial' : 'incorrect');
        const pointsBadge = item.pointsBadge || (item.points !== undefined ? `${item.points}/${item.maxPoints || 2} pts` : '');
        captionHtml += `<div class="lightbox-guess-info">Guess: <strong>${escapeHtml(item.guess || '—')}</strong> ${item.isCorrect ? '✓' : '| Correct: <strong>' + escapeHtml(item.actual || '') + '</strong> ✕'} <span class="result-status ${statusClass}">${pointsBadge ? '(' + escapeHtml(pointsBadge) + ')' : ''}</span></div>`;
      }

      if (item.notes && item.notes.trim()) {
        captionHtml += `<div class="lightbox-notes">${escapeHtml(item.notes.trim())}</div>`;
      }

      if (captionHtml) {
        captionEl.innerHTML = captionHtml;
        captionEl.classList.remove('hidden');
      } else {
        captionEl.innerHTML = '';
        captionEl.classList.add('hidden');
      }
    }

    const hasMultiple = currentGallery.length > 1;
    if (lightboxPrev) lightboxPrev.classList.toggle('hidden', !hasMultiple);
    if (lightboxNext) lightboxNext.classList.toggle('hidden', !hasMultiple);
    if (lightboxCounter) {
      if (hasMultiple) {
        lightboxCounter.textContent = `${currentGalleryIndex + 1} of ${currentGallery.length}`;
        lightboxCounter.classList.remove('hidden');
      } else {
        lightboxCounter.classList.add('hidden');
      }
    }
  }

  function showNextZoom() {
    if (currentGallery.length > 1) {
      currentGalleryIndex = (currentGalleryIndex + 1) % currentGallery.length;
      renderGalleryItem();
    }
  }

  function showPrevZoom() {
    if (currentGallery.length > 1) {
      currentGalleryIndex = (currentGalleryIndex - 1 + currentGallery.length) % currentGallery.length;
      renderGalleryItem();
    }
  }

  if (lightboxNext) {
    lightboxNext.addEventListener('click', (e) => {
      e.stopPropagation();
      showNextZoom();
    });
  }

  if (lightboxPrev) {
    lightboxPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      showPrevZoom();
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
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > 35 && Math.abs(diffY) < 60) {
        if (diffX < 0) {
          showNextZoom();
        } else {
          showPrevZoom();
        }
      }
    }, { passive: true });
  }

  window.addEventListener('keydown', (e) => {
    if (lightbox && lightbox.classList.contains('active')) {
      if (e.key === 'ArrowRight') {
        showNextZoom();
      } else if (e.key === 'ArrowLeft') {
        showPrevZoom();
      } else if (e.key === 'Escape') {
        closeZoom();
      }
    }
  });

  function closeZoom() {
    if (lightbox) {
      lightbox.classList.remove('active');
    }
    if (!resultsModal || !resultsModal.classList.contains('active')) {
      document.body.classList.remove('modal-open');
    }
  }

  if (modalClose) {
    modalClose.addEventListener('click', closeZoom);
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        closeZoom();
      }
    });
  }

  loadData();
});
