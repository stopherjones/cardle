document.addEventListener('DOMContentLoaded', () => {
  let gameDatabase = [];
  let roundVehicles = [];
  let selectedCarId = null;
  let gameLocked = false;
  let roundNumber = 1;
  let score = 0;
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

  // Shared Data Normalisation Pipeline
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

  // Populate unique options for the picker/type-ahead lists
  function populateOptionsPool() {
    optionsPool.make = [...new Set(gameDatabase.map(c => c.make))].sort();
    optionsPool.model = [...new Set(gameDatabase.map(c => c.model))].sort();
    optionsPool.country = [...new Set(gameDatabase.map(c => c.country))].sort();
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
      setupRound();
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

        headerBar.querySelector('.close-search-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          closeAllTypeaheads();
        });
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

    if (matches.length === 0) {
      container.innerHTML = `<div class="suggestion-empty">No matching ${category}s</div>`;
      container.classList.remove('hidden');
      return;
    }

    container.innerHTML = matches.map(item => `
      <button type="button" class="suggestion-item" data-value="${item}">${item}</button>
    `).join('');

    container.classList.remove('hidden');

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

  function setupRound() {
    if (gameDatabase.length < 4) return;

    const shuffled = [...gameDatabase].sort(() => 0.5 - Math.random());
    roundVehicles = shuffled.slice(0, 4).map((car, idx) => ({
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
        dockSlot.innerHTML = `
          <div class="docked-thumbnail">
            <img src="${car.image}" alt="${car.displayLabel}">
            <span class="docked-label">${car.displayLabel}</span>
            <button class="eject-btn" data-eject="${category}">✕</button>
          </div>
        `;
        input.disabled = false;

        dockSlot.querySelector('.eject-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          ejectCar(category);
        });
      } else {
        dockSlot.innerHTML = '';
        input.disabled = true;
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
    let correctCount = 0;

    categoryZones.forEach(zone => {
      const category = zone.dataset.category;
      const carId = assignments[category];
      const car = roundVehicles.find(v => v.labelId === carId);
      const input = zone.querySelector(`[data-input="${category}"]`);
      const guess = input ? input.value.trim() : '';
      const actual = car[category];
      const isCorrect = normaliseForCompare(guess, category) === normaliseForCompare(actual, category);

      if (isCorrect) correctCount += 1;

      results.push({
        category,
        label: CATEGORY_LABELS[category],
        carLabel: car.displayLabel,
        carImage: car.image,
        guess,
        actual: formatActualValue(car, category),
        isCorrect
      });
    });

    score += correctCount;
    if (scoreEl) scoreEl.textContent = String(score);

    showResults(results, correctCount);
    lockGame();
  }

  function showResults(results, correctCount) {
    if (!resultsModal || !resultsList || !resultsSummary) return;

    resultsList.innerHTML = results.map(result => `
      <div class="result-row ${result.isCorrect ? 'correct' : 'incorrect'}">
        <img class="result-thumb" src="${escapeHtml(result.carImage)}" alt="${escapeHtml(result.carLabel)}">
        <div class="result-body">
          <div class="result-header">
            <span class="result-category">${result.label}</span>
            <span class="result-car">${escapeHtml(result.carLabel)}</span>
            <span class="result-status ${result.isCorrect ? 'correct' : 'incorrect'}">
              ${result.isCorrect ? '✓ Correct' : '✗ Incorrect'}
            </span>
          </div>
          <div class="result-guess">Your guess: ${escapeHtml(result.guess)}</div>
          ${result.isCorrect ? '' : `<div class="result-answer">Correct answer: ${escapeHtml(result.actual)}</div>`}
        </div>
      </div>
    `).join('');

    resultsSummary.textContent = `You got ${correctCount} out of ${results.length} correct.`;
    resultsModal.classList.add('active');
  }

  function closeResultsModal() {
    if (resultsModal) {
      resultsModal.classList.remove('active');
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

    renderPool();
  }

  function startNextRound() {
    closeResultsModal();
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
    });

    roundNumber += 1;
    if (roundIndicator) {
      roundIndicator.textContent = `Round ${roundNumber}`;
    }

    setupRound();
    checkSubmissionState();
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', processSubmission);
  }

  if (resultsClose) {
    resultsClose.addEventListener('click', closeResultsModal);
  }

  if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', startNextRound);
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