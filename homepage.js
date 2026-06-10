const DIFFICULTY_LABELS = {
    m1: 'M1 Level', m2: 'M2 Level', clinical: 'Clinical Years',
    usmle: 'USMLE Level', residency: 'Residency'
};
const DIFFICULTY_STARS = { m1: '★☆☆☆☆', m2: '★★☆☆☆', clinical: '★★★☆☆', usmle: '★★★★☆', residency: '★★★★★' };
const CATEGORY_ICONS = {
    cardiology: '❤️', neurology: '🧠', pulmonology: '🫁', gastroenterology: '🍽️',
    nephrology: '🥛', endocrinology: '⚖️', hematology: '🩸', immunology: '🛡️',
    rheumatology: '🦴', infectiousDisease: '🧫', oncology: '🎗️', psychiatry: '💬',
    dermatology: '🧴', orthopedics: '🦵', obstetricsGynecology: '👶', pediatrics: '🧸',
    geriatrics: '🧓', emergencyMedicine: '🚑', pharmacology: '💊', anatomy: '📚',
    fmt: '🦠'
};
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
    // Dark mode
    const settings = MedCrossProgress.getSettings();
    if (settings.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
    const toggle = document.getElementById('theme-toggle');
    toggle.textContent = settings.darkMode ? '☀️' : '🌙';
    toggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
        toggle.textContent = isDark ? '🌙' : '☀️';
        MedCrossProgress.saveSettings({ ...MedCrossProgress.getSettings(), darkMode: !isDark });
    });

    const generatedPuzzles = generatePuzzles();
    localStorage.setItem('generatedPuzzles', JSON.stringify(generatedPuzzles));
    renderStatsBar();
    renderReviewNudge();
    renderDailyPuzzle(generatedPuzzles);
    renderAchievementsPreview();
    initializeUI(generatedPuzzles);
});

function renderReviewNudge() {
    const el = document.getElementById('review-nudge');
    if (!el) return;
    const stats = MedCrossProgress.getReviewStats();
    if (!stats.due) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <a href="study.html" class="review-nudge-card">
            <span class="review-nudge-icon">📚</span>
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
        <div class="daily-card ${done ? 'done' : ''}" style="background:${CATEGORY_GRADIENTS[daily.category] || 'linear-gradient(135deg,#667eea,#764ba2)'}">
            <div class="daily-badge">${done ? '✅ Completed Today' : '🗓️ Puzzle of the Day'}</div>
            <div class="daily-icon">${CATEGORY_ICONS[daily.category] || '🩺'}</div>
            <div class="daily-info">
                <h3>${daily.title}</h3>
                <p>${daily.clueCount} clues · ${shortDifficultyLabel(daily.difficulty)} · ${formatCategoryName(daily.category)}</p>
            </div>
            <button class="daily-start" type="button">${done ? 'Play Again' : 'Play Today'}</button>
        </div>
    `;
    section.querySelector('.daily-start').addEventListener('click', () => startPuzzle(dailyId));
}

function renderAchievementsPreview() {
    const section = document.getElementById('achievements-preview');
    if (!section) return;
    const achievements = MedCrossProgress.getAchievements();
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    section.innerHTML = `
        <div class="ach-preview-header">
            <h2>🏆 Achievements <span class="ach-count">${unlockedCount}/${achievements.length}</span></h2>
            <a href="stats.html" class="ach-viewall">View all →</a>
        </div>
        <div class="ach-preview-row">
            ${achievements.map(a => `
                <div class="ach-chip ${a.unlocked ? 'unlocked' : 'locked'}" title="${a.name}: ${a.desc}">
                    <span class="ach-chip-icon">${a.unlocked ? a.icon : '🔒'}</span>
                    <span class="ach-chip-name">${a.name}</span>
                </div>
            `).join('')}
        </div>
    `;
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
        }
    }
    return generatedPuzzles;
}

function renderStatsBar() {
    const stats = MedCrossProgress.getStats();
    const streak = MedCrossProgress.getStreak();
    const totalPuzzles = Object.keys(medicalCrosswordData).reduce((sum, cat) => sum + Object.keys(medicalCrosswordData[cat]).length, 0);
    const bar = document.getElementById('stats-bar');
    bar.innerHTML = `
        <div class="stat-item"><div class="stat-value">🔥 ${streak.current}</div><div class="stat-label">Day Streak</div></div>
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
    for (const category of Object.keys(medicalCrosswordData)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'category-card';
        if (currentFilters.category === category) card.classList.add('active');
        card.style.background = CATEGORY_GRADIENTS[category] || 'linear-gradient(135deg, #667eea, #764ba2)';
        card.dataset.category = category;
        card.innerHTML = `
            <div class="category-icon">${CATEGORY_ICONS[category] || '➕'}</div>
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
}

function renderDifficultyCards(puzzles, currentFilters) {
    const grid = document.getElementById('difficulty-grid');
    grid.innerHTML = '';
    for (const difficulty of getDifficulties()) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'difficulty-card';
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
        ...Object.keys(medicalCrosswordData).map(c => ({ value: c, label: formatCategoryName(c) }))
    ]);
    replaceOptions(document.getElementById('difficulty-filter'), [
        { value: 'all', label: 'All Difficulties' },
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
        badgeHTML = `<span class="completion-badge completed">✅ Completed${progress.bestTime ? ' · ' + formatTime(progress.bestTime) : ''}</span>`;
    } else if (progress && progress.answers && progress.answers.length > 0) {
        badgeHTML = `<span class="completion-badge in-progress">⏳ In Progress</span>`;
    }

    card.innerHTML = `
        <div class="puzzle-header">
            <h3 class="puzzle-title">${puzzle.title}</h3>
            <span class="puzzle-difficulty">${shortDifficultyLabel(puzzle.difficulty)}</span>
        </div>
        <p class="puzzle-description">${puzzle.description}</p>
        ${badgeHTML}
        <div class="puzzle-footer">
            <span class="puzzle-size">${puzzle.clueCount} clues</span>
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

function formatCategoryName(v) { return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()); }
function shortDifficultyLabel(d) { return { m1: 'M1', m2: 'M2', clinical: 'Clinical', usmle: 'USMLE', residency: 'Residency' }[d] || formatCategoryName(d); }
function difficultyDescription(d) { return { m1: 'Basic medical sciences', m2: 'Pathophysiology', clinical: 'Clinical applications', usmle: 'Board exam preparation', residency: 'Advanced specialty knowledge' }[d] || 'Medical crossword difficulty'; }
