document.addEventListener('DOMContentLoaded', () => {
    const settings = MedCrossProgress.getSettings();
    if (settings.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.textContent = settings.darkMode ? 'Light' : 'Dark';
        toggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
            toggle.textContent = isDark ? 'Dark' : 'Light';
            MedCrossProgress.saveSettings({ ...MedCrossProgress.getSettings(), darkMode: !isDark });
        });
    }

    const els = {
        front: document.getElementById('flashcard-front'),
        back: document.getElementById('flashcard-back'),
        answer: document.getElementById('flashcard-answer'),
        category: document.getElementById('flashcard-category'),
        label: document.getElementById('flashcard-label'),
        card: document.getElementById('flashcard'),
        controls: document.getElementById('study-controls'),
        showBtn: document.getElementById('show-answer'),
        grade: document.getElementById('study-grade'),
        gradeBtns: [...document.querySelectorAll('[data-grade]')],
        meta: document.getElementById('study-meta'),
        fill: document.getElementById('study-progress-fill'),
        done: document.getElementById('study-done'),
        doneSub: document.getElementById('study-done-sub'),
        doneTitle: document.getElementById('study-done-title'),
        dueTab: document.getElementById('study-due'),
        allTab: document.getElementById('study-all'),
        aiBtn: document.getElementById('flashcard-ai'),
        aiText: document.getElementById('flashcard-ai-text')
    };

    // Build the session queue from due terms (shuffled).
    const params = new URLSearchParams(window.location.search);
    let mode = params.get('mode') === 'all' ? 'all' : 'due';
    const filterCategory = params.get('category') || '';
    const filterDifficulty = params.get('difficulty') || '';
    let queue = [];
    let sessionTotal = 0;
    let completed = 0, firstTryCorrect = 0;
    let gradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    let missedThisSession = new Set();
    let currentItem = null;

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function catName(v) {
        return (v || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
    }

    function matchesFocusFilter(item) {
        if (filterCategory && item.category !== filterCategory) return false;
        if (filterDifficulty && item.difficulty !== filterDifficulty) return false;
        return true;
    }

    function showCard() {
        if (queue.length === 0) return finish();
        const item = queue[0];
        currentItem = item;
        els.front.textContent = item.clue || '(no clue)';
        els.answer.textContent = item.term;
        const meta = [
            item.category ? catName(item.category) : '',
            item.difficulty ? catName(item.difficulty) : '',
            item.missedCount ? `missed ${item.missedCount}x` : '',
            item.sourcePuzzle ? `from ${item.sourcePuzzle}` : ''
        ].filter(Boolean).join(' · ');
        els.category.textContent = meta;
        els.back.hidden = true;
        els.card.classList.remove('flipped');
        els.showBtn.hidden = false;
        els.grade.hidden = true;
        els.aiBtn.hidden = !(typeof MedAI !== 'undefined' && MedAI.isConfigured());
        els.aiText.hidden = true;
        els.aiText.textContent = '';
        updateMeta();
    }

    function updateMeta() {
        const remaining = queue.length;
        const focus = filterCategory
            ? ` · ${catName(filterCategory)} focus`
            : filterDifficulty
            ? ` · ${catName(filterDifficulty)} focus`
            : '';
        els.meta.textContent = `${completed} completed · ${remaining} in queue${focus}`;
        const pct = sessionTotal ? Math.round((completed / sessionTotal) * 100) : 100;
        els.fill.style.width = `${pct}%`;
    }

    function reveal() {
        els.back.hidden = false;
        els.card.classList.add('flipped');
        els.showBtn.hidden = true;
        els.grade.hidden = false;
    }

    function grade(gradeName) {
        const item = queue.shift();
        if (!item) return;
        const normalized = ['again', 'hard', 'good', 'easy'].includes(gradeName) ? gradeName : 'good';
        MedCrossProgress.gradeReviewTerm(item.term, normalized);
        gradeCounts[normalized] = (gradeCounts[normalized] || 0) + 1;
        if (normalized !== 'again') {
            if (!missedThisSession.has(item.term)) firstTryCorrect++;
            completed++;
        } else {
            missedThisSession.add(item.term);
            queue.push(item); // missed cards come back later in the session
        }
        showCard();
    }

    function finish() {
        els.card.hidden = true;
        els.controls.hidden = true;
        els.meta.hidden = true;
        els.fill.style.width = '100%';
        els.done.hidden = false;
        if (sessionTotal === 0) {
            const filtered = filterCategory || filterDifficulty;
            els.doneTitle.textContent = mode === 'due' ? 'Nothing due right now' : (filtered ? 'No matching cards yet' : 'No cards yet');
            els.doneSub.textContent = mode === 'due'
                ? 'Switch to All to review ahead, solve puzzles to add terms, or come back later.'
                : filtered
                ? 'Try a broader review session or solve more puzzles in this focus area.'
                : 'Terms you miss or reveal in puzzles will appear here.';
        } else {
            const acc = Math.round((firstTryCorrect / sessionTotal) * 100);
            const summary = [
                `${gradeCounts.easy || 0} easy`,
                `${gradeCounts.good || 0} good`,
                `${gradeCounts.hard || 0} hard`,
                `${gradeCounts.again || 0} again`
            ].join(' · ');
            els.doneTitle.textContent = 'Session complete!';
            els.doneSub.textContent = `You reviewed ${sessionTotal} term${sessionTotal === 1 ? '' : 's'} with ${acc}% first-try recall. ${summary}.`;
        }
    }

    function startSession(nextMode = mode) {
        mode = nextMode;
        const source = mode === 'all' ? MedCrossProgress.getReviewQueue() : MedCrossProgress.getDueReviewTerms();
        queue = shuffle(source.filter(matchesFocusFilter));
        sessionTotal = queue.length;
        completed = 0;
        firstTryCorrect = 0;
        gradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };
        missedThisSession = new Set();
        currentItem = null;
        els.card.hidden = false;
        els.controls.hidden = false;
        els.meta.hidden = false;
        els.done.hidden = true;
        els.dueTab.classList.toggle('active', mode === 'due');
        els.allTab.classList.toggle('active', mode === 'all');
        showCard();
    }

    async function explainCurrentCard() {
        if (!currentItem || typeof MedAI === 'undefined' || !MedAI.isConfigured()) return;
        els.aiBtn.disabled = true;
        els.aiText.hidden = false;
        els.aiText.textContent = 'Generating explanation...';
        try {
            els.aiText.textContent = await MedAI.flashcardExplain(currentItem.term, currentItem.clue, currentItem.category);
        } catch (e) {
            els.aiText.textContent = e.message || 'Could not load an explanation.';
        } finally {
            els.aiBtn.disabled = false;
        }
    }

    els.showBtn?.addEventListener('click', reveal);
    els.gradeBtns.forEach(btn => btn.addEventListener('click', () => grade(btn.dataset.grade)));
    els.dueTab?.addEventListener('click', () => startSession('due'));
    els.allTab?.addEventListener('click', () => startSession('all'));
    els.aiBtn?.addEventListener('click', explainCurrentCard);
    els.card?.addEventListener('click', () => { if (els.back.hidden && queue.length) reveal(); });
    document.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => { window.location.href = btn.dataset.nav; });
    });

    document.addEventListener('keydown', (e) => {
        if (els.done.hidden === false) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!els.showBtn.hidden) reveal(); }
        else if (els.grade.hidden === false) {
            if (e.key === '1' || e.key.toLowerCase() === 'x') grade('again');
            else if (e.key === '2' || e.key.toLowerCase() === 'h') grade('hard');
            else if (e.key === '3' || e.key.toLowerCase() === 'g') grade('good');
            else if (e.key === '4' || e.key.toLowerCase() === 'e') grade('easy');
        }
    });

    startSession(mode);
});
