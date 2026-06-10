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
        gotBtn: document.getElementById('grade-got'),
        missedBtn: document.getElementById('grade-missed'),
        meta: document.getElementById('study-meta'),
        fill: document.getElementById('study-progress-fill'),
        done: document.getElementById('study-done'),
        doneSub: document.getElementById('study-done-sub'),
        doneTitle: document.getElementById('study-done-title')
    };

    // Build the session queue from due terms (shuffled).
    let queue = shuffle(MedCrossProgress.getDueReviewTerms());
    const sessionTotal = queue.length;
    let reviewed = 0, correct = 0;

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

    function showCard() {
        if (queue.length === 0) return finish();
        const item = queue[0];
        els.front.textContent = item.clue || '(no clue)';
        els.answer.textContent = item.term;
        els.category.textContent = item.category ? catName(item.category) : '';
        els.back.hidden = true;
        els.card.classList.remove('flipped');
        els.showBtn.hidden = false;
        els.grade.hidden = true;
        updateMeta();
    }

    function updateMeta() {
        const remaining = queue.length;
        els.meta.textContent = `${reviewed} reviewed · ${remaining} remaining`;
        const pct = sessionTotal ? Math.round((reviewed / sessionTotal) * 100) : 100;
        els.fill.style.width = `${pct}%`;
    }

    function reveal() {
        els.back.hidden = false;
        els.card.classList.add('flipped');
        els.showBtn.hidden = true;
        els.grade.hidden = false;
    }

    function grade(isCorrect) {
        const item = queue.shift();
        MedCrossProgress.gradeReviewTerm(item.term, isCorrect);
        reviewed++;
        if (isCorrect) correct++;
        else queue.push(item); // missed cards come back later in the session
        showCard();
    }

    function finish() {
        els.card.hidden = true;
        els.controls.hidden = true;
        els.meta.hidden = true;
        els.fill.style.width = '100%';
        els.done.hidden = false;
        if (sessionTotal === 0) {
            els.doneTitle.textContent = 'Nothing due right now';
            els.doneSub.textContent = 'Solve puzzles to add terms, or come back later for scheduled reviews.';
        } else {
            const acc = Math.round((correct / reviewed) * 100);
            els.doneTitle.textContent = 'Session complete! 🎓';
            els.doneSub.textContent = `You reviewed ${sessionTotal} term${sessionTotal === 1 ? '' : 's'} with ${acc}% first-try recall. Promoted cards return on a longer schedule.`;
        }
    }

    els.showBtn.addEventListener('click', reveal);
    els.gotBtn.addEventListener('click', () => grade(true));
    els.missedBtn.addEventListener('click', () => grade(false));
    els.card.addEventListener('click', () => { if (els.back.hidden && queue.length) reveal(); });

    document.addEventListener('keydown', (e) => {
        if (els.done.hidden === false) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!els.showBtn.hidden) reveal(); }
        else if (els.grade.hidden === false) {
            if (e.key === '1' || e.key.toLowerCase() === 'x') grade(false);
            else if (e.key === '2' || e.key.toLowerCase() === 'g') grade(true);
        }
    });

    if (sessionTotal === 0) finish();
    else showCard();
});
