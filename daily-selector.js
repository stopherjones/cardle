// Shared Daily Car Selection & Cycle Engine
(function (global) {
    function parseCountries(countryInput) {
        if (Array.isArray(countryInput)) {
            return countryInput.map(c => String(c).trim()).filter(Boolean);
        }
        if (!countryInput) return ['Unknown'];
        const rawStr = String(countryInput).trim();
        const list = rawStr.split(/,|\/|&|\band\b/i).map(c => c.trim()).filter(Boolean);
        return list.length > 0 ? list : [rawStr];
    }

    function hasValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim().toLowerCase();
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'none' || trimmed === 'n/a') return false;
        return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('data:image/');
    }

    function normaliseData(rawItems) {
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

        // Deterministic sort by ID to guarantee identical dataset ordering everywhere
        return Object.values(registry).sort((a, b) => a.id.localeCompare(b.id));
    }

    function getDayIndex(dateObj = new Date()) {
        const epoch = new Date(2025, 0, 1);
        const current = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        const diffDays = Math.floor((current - epoch) / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    }

    function getDateStamp(dateObj = new Date()) {
        return `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
    }

    function mulberry32(seed) {
        return function () {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Full permutation cycle - no repeats until every car in carsList has been chosen
    function getDailyCardleCar(carsList, dateObj = new Date()) {
        if (!carsList || carsList.length === 0) return null;
        const total = carsList.length;
        const dayIndex = getDayIndex(dateObj);
        const cycleNumber = Math.floor(dayIndex / total);
        const positionInCycle = dayIndex % total;

        const seed = 13377331 + cycleNumber * 99991;
        const rand = mulberry32(seed);

        const indices = Array.from({ length: total }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const targetIndex = indices[positionInCycle];
        return carsList[targetIndex];
    }

    // CARtegories daily selection - explicitly excludes the daily Cardle car
    function getDailyCartegoriesVehicles(carsList, dateObj = new Date()) {
        if (!carsList || carsList.length < 5) return [];
        const dailyCardleCar = getDailyCardleCar(carsList, dateObj);
        const cartegoriesPool = carsList.filter(car => car.id !== dailyCardleCar?.id);

        const dayIndex = getDayIndex(dateObj);
        const rand = mulberry32(88888 + dayIndex * 77777);

        const shuffled = [...cartegoriesPool];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled.slice(0, 4);
    }

    global.CardleDailyEngine = {
        parseCountries,
        hasValidImageUrl,
        normaliseData,
        getDayIndex,
        getDateStamp,
        getDailyCardleCar,
        getDailyCartegoriesVehicles
    };
})(typeof window !== 'undefined' ? window : this);
