const DIFFICULTY_LABELS = {
    m1: 'M1 Level', m2: 'M2 Level', clinical: 'Clinical Years',
    usmle: 'USMLE Level', residency: 'Residency', api: 'Topic', notes: 'Notes', mini: 'Mini'
};
const DIFFICULTY_STARS = { m1: '★☆☆☆☆', m2: '★★☆☆☆', clinical: '★★★☆☆', usmle: '★★★★☆', residency: '★★★★★', api: '✦', notes: '✦', mini: '◆' };
const CATEGORY_DESCRIPTIONS = {
    cardiology: 'Heart and circulatory system', neurology: 'Brain and nervous system',
    pulmonology: 'Respiratory system', gastroenterology: 'Digestive system',
    nephrology: 'Kidneys and urinary system', endocrinology: 'Hormones and glands',
    hematology: 'Blood and clotting disorders', immunology: 'Immune system and defense',
    rheumatology: 'Joints and autoimmune disease', infectiousDisease: 'Pathogens and antimicrobials',
    oncology: 'Cancer biology and treatment', psychiatry: 'Mental health and behavior',
    dermatology: 'Skin, hair, and nails', orthopedics: 'Bones, joints, and trauma',
    obstetricsGynecology: 'Pregnancy and reproductive care', pediatrics: 'Child and adolescent medicine',
    geriatrics: 'Aging and older adult care', emergencyMedicine: 'Acute care and resuscitation',
    pharmacology: 'Drugs and mechanisms', anatomy: 'Body structures and landmarks',
    fmt: 'Fecal microbiota transplantation'
};
const CATEGORY_LUCIDE_ICONS = {
    cardiology: 'heart-pulse', neurology: 'brain', pulmonology: 'wind', gastroenterology: 'apple',
    nephrology: 'droplets', endocrinology: 'scale', hematology: 'droplet', immunology: 'shield',
    rheumatology: 'activity', infectiousDisease: 'bug', oncology: 'ribbon', psychiatry: 'message-circle',
    dermatology: 'search', orthopedics: 'bone', obstetricsGynecology: 'baby', pediatrics: 'smile',
    geriatrics: 'users', emergencyMedicine: 'ambulance', pharmacology: 'pill', anatomy: 'user',
    fmt: 'microscope'
};
// Unique gradients per category
const CATEGORY_GRADIENTS = {
    cardiology: 'linear-gradient(135deg, #e74c3c, #c0392b)', neurology: 'linear-gradient(135deg, #3498db, #2980b9)',
    pulmonology: 'linear-gradient(135deg, #1abc9c, #16a085)', gastroenterology: 'linear-gradient(135deg, #e67e22, #d35400)',
    nephrology: 'linear-gradient(135deg, #9b59b6, #8e44ad)', endocrinology: 'linear-gradient(135deg, #f39c12, #e67e22)',
    hematology: 'linear-gradient(135deg, #e74c3c, #c0392b)', immunology: 'linear-gradient(135deg, #27ae60, #229954)',
    rheumatology: 'linear-gradient(135deg, #5dade2, #2e86c1)', infectiousDisease: 'linear-gradient(135deg, #48c9b0, #1abc9c)',
    oncology: 'linear-gradient(135deg, #af7ac5, #8e44ad)', psychiatry: 'linear-gradient(135deg, #5499c7, #2471a3)',
    dermatology: 'linear-gradient(135deg, #f0b27a, #e59866)', orthopedics: 'linear-gradient(135deg, #58d68d, #28b463)',
    obstetricsGynecology: 'linear-gradient(135deg, #f1948a, #ec7063)', pediatrics: 'linear-gradient(135deg, #7fb3d8, #5499c7)',
    geriatrics: 'linear-gradient(135deg, #aab7b8, #808b96)', emergencyMedicine: 'linear-gradient(135deg, #ec7063, #cb4335)',
    pharmacology: 'linear-gradient(135deg, #667eea, #764ba2)', anatomy: 'linear-gradient(135deg, #82e0aa, #58d68d)',
    fmt: 'linear-gradient(135deg, #43b89c, #2e8b6e)'
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    const generatedPuzzles = generatePuzzles();
    localStorage.setItem('generatedPuzzles', JSON.stringify(generatedPuzzles));
    const allPuzzles = [...getCustomPuzzleCards(), ...generatedPuzzles];
    renderStatsBar();
    renderReviewNudge();
    renderCustomPuzzleMaker();
    renderDailyPuzzle(generatedPuzzles);
    renderAchievementsPreview();
    initializeUI(allPuzzles);
});

function renderReviewNudge() {
    const el = document.getElementById('review-nudge');
    if (!el) return;
    const stats = MedCrossProgress.getReviewStats();
    if (!stats.due) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <a href="study.html" class="review-nudge-card">
            <span class="review-nudge-text">
                <strong>${stats.due} term${stats.due === 1 ? '' : 's'} due for review</strong>
                <span>Spaced repetition keeps what you missed from slipping away.</span>
            </span>
            <span class="review-nudge-cta">Study →</span>
        </a>
    `;
}

function renderDailyPuzzle(puzzles) {
    const section = document.getElementById('daily-section');
    if (!section) return;
    const dailyId = MedCrossProgress.getDailyPuzzleId(puzzles.map(p => p.id));
    const daily = puzzles.find(p => p.id === dailyId);
    if (!daily) { section.innerHTML = ''; return; }
    const done = MedCrossProgress.isDailyDone(dailyId);
    section.innerHTML = `
        <div class="daily-card ${done ? 'done' : ''}">
            <div class="daily-badge"><i data-lucide="${done ? 'check-circle' : 'calendar'}"></i> ${done ? 'Completed Today' : 'Puzzle of the Day'}</div>
            <div class="daily-icon"><i data-lucide="${CATEGORY_LUCIDE_ICONS[daily.category] || 'activity'}"></i></div>
            <div class="daily-info">
                <h3>${daily.title}</h3>
                <p>${daily.clueCount} clues · ${shortDifficultyLabel(daily.difficulty)} · ${formatCategoryName(daily.category)}</p>
            </div>
            <button class="daily-start" type="button">${done ? 'Play Again' : 'Play Today'}</button>
        </div>
    `;
    section.querySelector('.daily-start').addEventListener('click', () => startPuzzle(dailyId));
    if (window.lucide) window.lucide.createIcons({ root: section });
}

function renderAchievementsPreview() {
    const section = document.getElementById('achievements-preview');
    if (!section) return;
    const achievements = MedCrossProgress.getAchievements();
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    section.innerHTML = `
        <div class="ach-preview-header">
            <h2><i data-lucide="award"></i> Achievements <span class="ach-count">${unlockedCount}/${achievements.length}</span></h2>
            <a href="stats.html" class="ach-viewall">View all <i data-lucide="arrow-right"></i></a>
        </div>
        <div class="ach-preview-row">
            ${achievements.map(a => `
                <div class="ach-chip ${a.unlocked ? 'unlocked' : 'locked'}" title="${a.name}: ${a.desc}">
                    <span class="ach-chip-icon">${a.unlocked ? '' : ''}</span>
                    <span class="ach-chip-name">${a.name}</span>
                </div>
            `).join('')}
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: section });
}

function generatePuzzles() {
    const generatedPuzzles = [];
    for (const category of Object.keys(medicalCrosswordData)) {
        for (const difficulty of Object.keys(medicalCrosswordData[category])) {
            const clueCount = medicalCrosswordData[category][difficulty].length;
            generatedPuzzles.push({
                id: `${category}-${difficulty}`,
                title: `${formatCategoryName(category)} ${shortDifficultyLabel(difficulty)}`,
                category, categoryLabel: formatCategoryName(category),
                difficulty, difficultyLabel: DIFFICULTY_LABELS[difficulty] || formatCategoryName(difficulty),
                size: `Dynamic`, clueCount,
                description: `${DIFFICULTY_LABELS[difficulty] || difficulty} crossword covering ${formatCategoryName(category)}.`
            });
            generatedPuzzles.push({
                id: `${category}-${difficulty}-mini`,
                title: `${formatCategoryName(category)} ${shortDifficultyLabel(difficulty)} Mini`,
                category, categoryLabel: formatCategoryName(category),
                difficulty: 'mini',
                difficultyLabel: 'Mini',
                size: '5x5',
                clueCount: 10,
                description: `A compact checked mini built from ${formatCategoryName(category)} terms when possible, with a general medical fallback.`
            });
        }
    }
    return generatedPuzzles;
}

function getCustomPuzzleCards() {
    return MedCrossProgress.getCustomPuzzles().map(p => ({
        id: p.id,
        title: p.title || 'Custom Puzzle',
        category: 'custom',
        categoryLabel: 'Custom',
        difficulty: p.difficulty || 'custom',
        difficultyLabel: p.difficulty === 'api' ? 'Topic' : 'Notes',
        size: p.size || 'Custom',
        clueCount: (p.data?.clues?.across?.length || 0) + (p.data?.clues?.down?.length || 0),
        description: p.description || 'Generated from custom medical terms.'
    }));
}

function renderCustomPuzzleMaker() {
    const section = document.getElementById('notes-create-section');
    if (!section) return;
    const aiReady = typeof MedAI !== 'undefined' && MedAI.isConfigured();
    const apiReady = typeof MedCrossAPISources !== 'undefined';
    section.innerHTML = `
        <div class="notes-create-card">
            <div>
                <div class="notes-kicker">Custom practice</div>
                <h2>Create a custom puzzle</h2>
                <p>Paste notes or type any medical topic and MedCross will build the word bank.</p>
            </div>
            <button id="open-notes-creator" class="notes-create-btn" type="button">Create Puzzle</button>
        </div>
        <div class="notes-modal" id="notes-modal" hidden>
            <div class="notes-modal-content">
                <div class="notes-modal-header">
                    <h3>Create Custom Puzzle</h3>
                    <button id="notes-close" type="button" aria-label="Close">x</button>
                </div>
                <div class="creator-tabs" role="tablist" aria-label="Custom puzzle source">
                    <button class="creator-tab active" id="creator-notes-tab" type="button" data-mode="notes">Notes</button>
                    <button class="creator-tab" id="creator-api-tab" type="button" data-mode="api">Topic</button>
                </div>
                <div class="creator-panel" id="creator-notes-panel">
                    <div class="notes-upload-row">
                        <button id="notes-upload-btn" class="notes-upload-btn" type="button">Upload notes</button>
                        <input id="notes-file-input" type="file" accept=".txt,.md,.markdown,.csv,.pdf,.docx,text/plain,application/pdf" multiple hidden>
                        <span class="notes-upload-hint">.txt, .md, .pdf, .docx — or drop files here</span>
                    </div>
                    <div class="notes-file-list" id="notes-file-list"></div>
                    <textarea id="notes-input" class="notes-input" placeholder="Paste medical notes here, or upload files above..."></textarea>
                </div>
                <div class="creator-panel api-panel" id="creator-api-panel" hidden>
                    <label class="creator-label" for="api-query">Topic</label>
                    <input id="api-query" class="creator-input" type="text" placeholder="Examples: asthma, renal failure, beta blockers, ECG interpretation">
                    <p class="creator-help">MedCross searches medical APIs automatically and uses Gemini to improve the word bank when your key is configured.</p>
                </div>
                <div class="notes-status" id="notes-status">${notesStatusCopy(aiReady)}</div>
                <div class="notes-actions">
                    <button id="notes-generate" class="notes-create-btn" type="button">Generate from Notes</button>
                    <button id="api-generate" class="notes-create-btn" type="button" hidden ${apiReady || aiReady ? '' : 'disabled'}>Build from Topic</button>
                </div>
            </div>
        </div>
    `;

    const modal = document.getElementById('notes-modal');
    document.body.appendChild(modal);
    const openButton = document.getElementById('open-notes-creator');
    const heroCreateButton = document.getElementById('hero-create-puzzle');
    const closeButton = document.getElementById('notes-close');
    const notesButton = document.getElementById('notes-generate');
    const apiButton = document.getElementById('api-generate');
    openButton.onclick = () => { modal.hidden = false; };
    if (heroCreateButton) {
        heroCreateButton.onclick = () => {
            modal.hidden = false;
            setCreatorMode('api', { aiReady, apiReady });
            document.getElementById('api-query')?.focus();
        };
    }
    closeButton.onclick = () => { modal.hidden = true; };
    notesButton.onclick = createPuzzleFromNotes;
    apiButton.onclick = createPuzzleFromAPI;
    document.querySelectorAll('.creator-tab').forEach(tab => {
        tab.addEventListener('click', () => setCreatorMode(tab.dataset.mode, { aiReady, apiReady }));
    });
    initNotesUpload();
}

function notesStatusCopy(aiReady) {
    return aiReady
        ? 'Upload files or paste notes. Gemini will extract 15-30 terms and clues.'
        : 'Upload files or paste notes. Without a Gemini key, terms are matched from the built-in medical database.';
}

// Uploaded note files for the current creator session: { name, text, chars }
const uploadedNoteFiles = [];

function initNotesUpload() {
    const uploadBtn = document.getElementById('notes-upload-btn');
    const fileInput = document.getElementById('notes-file-input');
    const panel = document.getElementById('creator-notes-panel');
    if (!uploadBtn || !fileInput || !panel) return;

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        addNoteFiles([...fileInput.files]);
        fileInput.value = '';
    });

    panel.addEventListener('dragover', e => { e.preventDefault(); panel.classList.add('drag-over'); });
    panel.addEventListener('dragleave', () => panel.classList.remove('drag-over'));
    panel.addEventListener('drop', e => {
        e.preventDefault();
        panel.classList.remove('drag-over');
        addNoteFiles([...(e.dataTransfer?.files || [])]);
    });
}

async function addNoteFiles(files) {
    if (!files.length) return;
    const status = document.getElementById('notes-status');
    for (const file of files) {
        if (uploadedNoteFiles.some(f => f.name === file.name)) continue;
        status.textContent = `Reading ${file.name}...`;
        try {
            uploadedNoteFiles.push(await MedCrossNotes.readFile(file));
        } catch (e) {
            status.textContent = e.message;
            renderNoteFileChips();
            return;
        }
    }
    const total = uploadedNoteFiles.reduce((sum, f) => sum + f.chars, 0);
    const size = total < 1000 ? `${total} characters` : `${Math.round(total / 1000)}k characters`;
    status.textContent = `${uploadedNoteFiles.length} file${uploadedNoteFiles.length === 1 ? '' : 's'} loaded (${size}). Ready to generate.`;
    renderNoteFileChips();
}

function renderNoteFileChips() {
    const list = document.getElementById('notes-file-list');
    if (!list) return;
    list.innerHTML = uploadedNoteFiles.map((f, i) => `
        <span class="notes-file-chip">
            <span class="notes-file-name">${escapeHtml(f.name)}</span>
            <button type="button" class="notes-file-remove" data-index="${i}" aria-label="Remove ${escapeHtml(f.name)}">x</button>
        </span>
    `).join('');
    list.querySelectorAll('.notes-file-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            uploadedNoteFiles.splice(Number(btn.dataset.index), 1);
            renderNoteFileChips();
        });
    });
}

function setCreatorMode(mode, { aiReady, apiReady }) {
    const notesMode = mode === 'notes';
    document.getElementById('creator-notes-tab').classList.toggle('active', notesMode);
    document.getElementById('creator-api-tab').classList.toggle('active', !notesMode);
    document.getElementById('creator-notes-panel').hidden = !notesMode;
    document.getElementById('creator-api-panel').hidden = notesMode;
    document.getElementById('notes-generate').hidden = !notesMode;
    document.getElementById('api-generate').hidden = notesMode;
    document.getElementById('notes-status').textContent = notesMode
        ? notesStatusCopy(aiReady)
        : (apiReady || aiReady ? '' : 'Add Gemini or load the API source client to create a topic puzzle.');
}

async function createPuzzleFromNotes() {
    const input = document.getElementById('notes-input');
    const status = document.getElementById('notes-status');
    const btn = document.getElementById('notes-generate');
    const combined = [...uploadedNoteFiles.map(f => f.text), input.value.trim()]
        .filter(Boolean).join('\n\n');
    if (combined.length < 120) {
        status.textContent = 'Upload a notes file or paste at least a paragraph so there is enough material.';
        return;
    }
    btn.disabled = true;
    status.textContent = 'Preparing notes...';
    try {
        const prepared = MedCrossNotes.condense(combined);
        const aiReady = typeof MedAI !== 'undefined' && MedAI.isConfigured();

        let entries = MedCrossNotes.getCachedEntries(prepared);
        if (entries) {
            status.textContent = 'Reusing terms already extracted from these notes...';
        } else if (aiReady) {
            status.textContent = 'Extracting crossword terms with Gemini...';
            try {
                entries = await MedAI.extractPuzzleTermsFromNotes(prepared);
            } catch (aiError) {
                console.warn('[MedCross] Gemini notes extraction failed:', aiError.message);
                status.textContent = 'Gemini was unavailable. Matching terms from the medical database...';
                entries = MedCrossNotes.extractTermsLocally(prepared);
            }
        } else {
            status.textContent = 'Matching terms from the built-in medical database...';
            entries = MedCrossNotes.extractTermsLocally(prepared);
        }

        if (!entries || entries.length < 6) {
            throw new Error(aiReady
                ? 'Not enough crossword terms were found in those notes. Try more detailed notes.'
                : 'Not enough known medical terms were found. Add a Gemini key in config.js for smarter extraction, or use more detailed notes.');
        }
        MedCrossNotes.cacheEntries(prepared, entries);

        const firstFile = uploadedNoteFiles[0]?.name.replace(/\.[^.]+$/, '');
        openCustomPuzzleFromEntries(entries, {
            idPrefix: 'custom-notes',
            title: firstFile ? `Notes Puzzle: ${firstFile}` : `Notes Puzzle ${new Date().toLocaleDateString()}`,
            sourceTitle: firstFile || 'Notes',
            difficulty: 'notes',
            description: firstFile ? `Generated from your uploaded notes (${firstFile}).` : 'Generated from your pasted study notes.',
            status
        });
    } catch (e) {
        status.textContent = e.message || 'Could not create a puzzle from those notes.';
        btn.disabled = false;
    }
}

async function createPuzzleFromAPI() {
    const query = document.getElementById('api-query').value.trim();
    const status = document.getElementById('notes-status');
    const btn = document.getElementById('api-generate');
    if (query.length < 2) {
        status.textContent = 'Type a medical topic first.';
        return;
    }
    btn.disabled = true;
    status.textContent = 'Searching medical APIs...';
    try {
        let apiEntries = [];
        if (typeof MedCrossAPISources !== 'undefined') {
            try {
                apiEntries = await MedCrossAPISources.fetchTopicEntries({ query, limit: 30 });
            } catch (apiError) {
                console.warn('[MedCross] API topic search failed:', apiError.message);
            }
        }

        let entries = apiEntries;
        if (typeof MedAI !== 'undefined' && MedAI.isConfigured()) {
            status.textContent = apiEntries.length
                ? 'Refining the word bank with Gemini...'
                : 'Building a word bank with Gemini...';
            try {
                entries = await MedAI.generateTopicPuzzleEntries(query, apiEntries);
            } catch (aiError) {
                console.warn('[MedCross] Gemini topic generation failed:', aiError.message);
                if (!apiEntries.length) throw aiError;
                entries = apiEntries;
                status.textContent = 'Gemini was unavailable. Building from API terms...';
            }
        }

        if (!entries || entries.length < 5) {
            throw new Error('Not enough topic terms were found. Try a more specific medical topic.');
        }

        openCustomPuzzleFromEntries(entries, {
            idPrefix: 'custom-topic',
            title: `Topic Puzzle: ${query}`,
            sourceTitle: query,
            difficulty: 'api',
            description: `Generated automatically from medical APIs${typeof MedAI !== 'undefined' && MedAI.isConfigured() ? ' and Gemini' : ''} for "${query}".`,
            sourceEntries: apiEntries,
            status
        });
    } catch (e) {
        status.textContent = e.message || 'Could not build a crossword from that topic.';
        btn.disabled = false;
    }
}

function openCustomPuzzleFromEntries(entries, options) {
    options.status.textContent = 'Building puzzle grid...';
    const generator = new CrosswordGenerator({});
    const data = generator.generateFromEntries(entries, { title: options.sourceTitle });
    const id = `${options.idPrefix}-${Date.now()}`;
    const puzzle = {
        id,
        title: options.title,
        category: 'custom',
        difficulty: options.difficulty,
        size: `${data.cols}x${data.rows}`,
        description: options.description,
        data,
        sourceEntries: options.sourceEntries || entries,
        createdAt: new Date().toISOString()
    };
    MedCrossProgress.saveCustomPuzzle(puzzle);
    localStorage.setItem('selectedPuzzleId', id);
    options.status.textContent = 'Puzzle ready. Opening it now...';
    window.location.href = `puzzle.html?id=${encodeURIComponent(id)}&v=2`;
}

function renderStatsBar() {
    const stats = MedCrossProgress.getStats();
    const streak = MedCrossProgress.getStreak();
    const totalPuzzles = Object.keys(medicalCrosswordData).reduce((sum, cat) => sum + Object.keys(medicalCrosswordData[cat]).length, 0);
    const bar = document.getElementById('stats-bar');
    bar.innerHTML = `
        <div class="stat-item"><div class="stat-value">${streak.current}</div><div class="stat-label">Day Streak</div></div>
        <div class="stat-item"><div class="stat-value">${stats.totalCompleted}</div><div class="stat-label">Completed</div></div>
        <div class="stat-item"><div class="stat-value">${totalPuzzles}</div><div class="stat-label">Total Puzzles</div></div>
        <div class="stat-item"><div class="stat-value">${stats.averageAccuracy != null ? stats.averageAccuracy + '%' : '--'}</div><div class="stat-label">Avg Accuracy</div></div>
        <div class="stat-item"><div class="stat-value">${stats.averageTime ? formatTime(stats.averageTime) : '--:--'}</div><div class="stat-label">Avg Time</div></div>
    `;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function initializeUI(puzzles) {
    let currentFilters = { category: 'all', difficulty: 'all', search: '' };

    renderCategoryCards(puzzles, currentFilters);
    renderDifficultyCards(puzzles, currentFilters);
    renderFilterOptions(puzzles);

    document.getElementById('category-filter').addEventListener('change', (e) => {
        currentFilters.category = e.target.value;
        renderCategoryCards(puzzles, currentFilters);
        displayPuzzles(puzzles, currentFilters);
    });
    document.getElementById('difficulty-filter').addEventListener('change', (e) => {
        currentFilters.difficulty = e.target.value;
        renderDifficultyCards(puzzles, currentFilters);
        displayPuzzles(puzzles, currentFilters);
    });
    document.getElementById('puzzle-search').addEventListener('input', (e) => {
        currentFilters.search = e.target.value.toLowerCase();
        displayPuzzles(puzzles, currentFilters);
    });

    displayPuzzles(puzzles, currentFilters);
}

function renderCategoryCards(puzzles, currentFilters) {
    const grid = document.getElementById('category-grid');
    grid.innerHTML = '';
    let i = 0;
    for (const category of Object.keys(medicalCrosswordData)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'category-card';
        card.style.animationDelay = `${i * 0.05}s`;
        i++;
        if (currentFilters.category === category) card.classList.add('active');
        card.dataset.category = category;
        card.innerHTML = `
            <div class="category-icon"><i data-lucide="${CATEGORY_LUCIDE_ICONS[category] || 'activity'}"></i></div>
            <h3>${formatCategoryName(category)}</h3>
            <p>${CATEGORY_DESCRIPTIONS[category] || 'Medical specialty'}</p>
            <span class="puzzle-count">${puzzles.filter(p => p.category === category).length} puzzles</span>
        `;
        card.addEventListener('click', () => {
            currentFilters.category = currentFilters.category === category ? 'all' : category;
            document.getElementById('category-filter').value = currentFilters.category;
            renderCategoryCards(puzzles, currentFilters);
            displayPuzzles(puzzles, currentFilters);
        });
        grid.appendChild(card);
    }
    if (window.lucide) window.lucide.createIcons({ root: grid });
}

function renderDifficultyCards(puzzles, currentFilters) {
    const grid = document.getElementById('difficulty-grid');
    grid.innerHTML = '';
    let i = 0;
    for (const difficulty of getDifficulties()) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'difficulty-card';
        card.style.animationDelay = `${i * 0.05}s`;
        i++;
        if (currentFilters.difficulty === difficulty) card.classList.add('active');
        card.innerHTML = `
            <h3>${DIFFICULTY_LABELS[difficulty] || formatCategoryName(difficulty)}</h3>
            <p>${difficultyDescription(difficulty)}</p>
            <div class="difficulty-stars">${DIFFICULTY_STARS[difficulty] || '★'}</div>
        `;
        card.addEventListener('click', () => {
            currentFilters.difficulty = currentFilters.difficulty === difficulty ? 'all' : difficulty;
            document.getElementById('difficulty-filter').value = currentFilters.difficulty;
            renderDifficultyCards(puzzles, currentFilters);
            displayPuzzles(puzzles, currentFilters);
        });
        grid.appendChild(card);
    }
}

function renderFilterOptions(puzzles) {
    replaceOptions(document.getElementById('category-filter'), [
        { value: 'all', label: 'All Categories' },
        { value: 'custom', label: 'Custom' },
        ...Object.keys(medicalCrosswordData).map(c => ({ value: c, label: formatCategoryName(c) }))
    ]);
    replaceOptions(document.getElementById('difficulty-filter'), [
        { value: 'all', label: 'All Difficulties' },
        { value: 'notes', label: 'Notes' },
        { value: 'api', label: 'Topic' },
        { value: 'mini', label: 'Mini' },
        ...getDifficulties().map(d => ({ value: d, label: DIFFICULTY_LABELS[d] || formatCategoryName(d) }))
    ]);
}

function replaceOptions(select, options) {
    select.innerHTML = '';
    for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        select.appendChild(opt);
    }
}

function displayPuzzles(puzzles, filters) {
    const grid = document.getElementById('puzzles-grid');
    grid.innerHTML = '';
    const filtered = puzzles.filter(p => {
        if (filters.category !== 'all' && p.category !== filters.category) return false;
        if (filters.difficulty !== 'all' && p.difficulty !== filters.difficulty) return false;
        if (filters.search && !p.title.toLowerCase().includes(filters.search) && !p.categoryLabel.toLowerCase().includes(filters.search)) return false;
        return true;
    });
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="no-puzzles"><h3>No puzzles found</h3><p>Try adjusting your filters.</p></div>';
        return;
    }
    filtered.forEach((p, i) => {
        const card = createPuzzleCard(p);
        card.style.animationDelay = `${i * 0.05}s`;
        grid.appendChild(card);
    });
}

function createPuzzleCard(puzzle) {
    const card = document.createElement('article');
    card.className = 'puzzle-card';

    const progress = MedCrossProgress.getProgress(puzzle.id);
    let badgeHTML = '';
    if (progress && progress.completed) {
        badgeHTML = `<span class="completion-badge completed">Completed${progress.bestTime ? ' · ' + formatTime(progress.bestTime) : ''}</span>`;
    } else if (progress && progress.answers && progress.answers.length > 0) {
        badgeHTML = `<span class="completion-badge in-progress">In Progress</span>`;
    }

    card.innerHTML = `
        <div class="puzzle-header">
            <h3 class="puzzle-title">${escapeHtml(puzzle.title)}</h3>
            <span class="puzzle-difficulty">${escapeHtml(shortDifficultyLabel(puzzle.difficulty))}</span>
        </div>
        <p class="puzzle-description">${escapeHtml(puzzle.description)}</p>
        ${badgeHTML}
        <div class="puzzle-footer">
            <span class="puzzle-size">${puzzle.difficulty === 'mini' ? '5x5 grid' : `${Number(puzzle.clueCount) || 0} clues`}</span>
            <button class="start-button" type="button">${progress && progress.answers && progress.answers.length > 0 ? 'Resume' : 'Start Puzzle'}</button>
        </div>
    `;
    card.querySelector('.start-button').addEventListener('click', () => startPuzzle(puzzle.id));
    return card;
}

function startPuzzle(id) {
    localStorage.setItem('selectedPuzzleId', id);
    window.location.href = `puzzle.html?id=${encodeURIComponent(id)}&v=2`;
}

function getDifficulties() {
    const set = new Set();
    for (const cat of Object.keys(medicalCrosswordData)) {
        Object.keys(medicalCrosswordData[cat]).forEach(d => set.add(d));
    }
    return ['m1', 'm2', 'clinical', 'usmle', 'residency'].filter(d => set.has(d));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function formatCategoryName(v) { return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()); }
function shortDifficultyLabel(d) { return { m1: 'M1', m2: 'M2', clinical: 'Clinical', usmle: 'USMLE', residency: 'Residency', api: 'Topic', notes: 'Notes', mini: 'Mini' }[d] || formatCategoryName(d); }
function difficultyDescription(d) { return { m1: 'Basic medical sciences', m2: 'Pathophysiology', clinical: 'Clinical applications', usmle: 'Board exam preparation', residency: 'Advanced specialty knowledge', api: 'Automatic topic puzzle', notes: 'Custom study notes', mini: 'Dense 5x5 crossword' }[d] || 'Medical crossword difficulty'; }
