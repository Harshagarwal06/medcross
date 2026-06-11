const DIFFICULTY_ORDER = ['m1', 'm2', 'clinical', 'usmle', 'residency'];
const DIFF_SHORT = { m1: 'M1', m2: 'M2', clinical: 'Clinical', usmle: 'USMLE', residency: 'Residency' };
const CAT_ICONS = {
    cardiology: '❤️', neurology: '🧠', pulmonology: '🫁', gastroenterology: '🍽️',
    nephrology: '🥛', endocrinology: '⚖️', hematology: '🩸', immunology: '🛡️',
    rheumatology: '🦴', infectiousDisease: '🧫', oncology: '🎗️', psychiatry: '💬',
    dermatology: '🧴', orthopedics: '🦵', obstetricsGynecology: '👶', pediatrics: '🧸',
    geriatrics: '🧓', emergencyMedicine: '🚑', pharmacology: '💊', anatomy: '📚'
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

    renderOverview();
    renderAchievements();
    renderSpecialties();
    renderWeakAreas();
    renderDailyCalendar();
    renderReviewQueue();

    document.getElementById('clear-review').addEventListener('click', () => {
        if (confirm('Clear your entire review queue?')) {
            MedCrossProgress.clearReviewQueue();
            renderReviewQueue();
        }
    });
});

function fmtTime(s) {
    if (!s) return '--:--';
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function catName(v) { return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()); }

function renderOverview() {
    const stats = MedCrossProgress.getStats();
    const streak = MedCrossProgress.getStreak();
    const el = document.getElementById('stats-overview');
    el.innerHTML = `
        <div class="ov-card"><div class="ov-value">🔥 ${streak.current}</div><div class="ov-label">Current Streak</div></div>
        <div class="ov-card"><div class="ov-value">🏅 ${streak.longest}</div><div class="ov-label">Longest Streak</div></div>
        <div class="ov-card"><div class="ov-value">${stats.totalCompleted}</div><div class="ov-label">Puzzles Solved</div></div>
        <div class="ov-card"><div class="ov-value">${stats.averageAccuracy != null ? stats.averageAccuracy + '%' : '--'}</div><div class="ov-label">Avg Accuracy</div></div>
        <div class="ov-card"><div class="ov-value">${fmtTime(stats.bestTime)}</div><div class="ov-label">Best Time</div></div>
        <div class="ov-card"><div class="ov-value">${stats.totalScore.toLocaleString()}</div><div class="ov-label">Total Score</div></div>
    `;
}

function renderAchievements() {
    const el = document.getElementById('ach-gallery');
    const achievements = MedCrossProgress.getAchievements();
    el.innerHTML = achievements.map(a => `
        <div class="ach-tile ${a.unlocked ? 'unlocked' : 'locked'}">
            <div class="ach-tile-icon">${a.unlocked ? a.icon : '🔒'}</div>
            <div class="ach-tile-name">${a.name}</div>
            <div class="ach-tile-desc">${a.desc}</div>
            ${a.unlocked ? `<div class="ach-tile-date">Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}</div>` : ''}
        </div>
    `).join('');
}

function renderSpecialties() {
    const el = document.getElementById('specialty-grid');
    const all = MedCrossProgress.getAll();
    const cats = Object.keys(medicalCrosswordData);
    el.innerHTML = cats.map(cat => {
        const diffs = Object.keys(medicalCrosswordData[cat]);
        const total = diffs.length;
        let done = 0, bestTime = null;
        for (const d of diffs) {
            const p = all[`${cat}-${d}`];
            if (p && p.completed) {
                done++;
                if (p.bestTime && (bestTime === null || p.bestTime < bestTime)) bestTime = p.bestTime;
            }
        }
        const pct = total ? Math.round((done / total) * 100) : 0;
        return `
            <div class="spec-card ${done === total && total > 0 ? 'complete' : ''}">
                <div class="spec-top">
                    <span class="spec-icon">${CAT_ICONS[cat] || '🩺'}</span>
                    <span class="spec-name">${catName(cat)}</span>
                </div>
                <div class="spec-bar-track"><div class="spec-bar-fill" style="width:${pct}%"></div></div>
                <div class="spec-meta">
                    <span>${done}/${total} levels</span>
                    <span>${bestTime ? '⏱ ' + fmtTime(bestTime) : ''}</span>
                </div>
            </div>
        `;
    }).join('');
}

function allPuzzleIds() {
    const ids = [];
    for (const cat of Object.keys(medicalCrosswordData)) {
        for (const diff of Object.keys(medicalCrosswordData[cat])) ids.push(`${cat}-${diff}`);
    }
    return ids;
}

function renderWeakAreas() {
    const el = document.getElementById('weak-grid');
    if (!el) return;
    const weak = MedCrossProgress.getWeakAreas();
    const rows = [
        ...weak.categories.map(w => ({ ...w, type: 'Specialty', label: catName(w.key), action: `Review ${w.reviewTerms || 0} ${catName(w.key)} term${w.reviewTerms === 1 ? '' : 's'}` })),
        ...weak.difficulties.map(w => ({ ...w, type: 'Level', label: DIFF_SHORT[w.key] || catName(w.key), action: `Try another ${DIFF_SHORT[w.key] || catName(w.key)} puzzle` }))
    ].slice(0, 6);
    if (!rows.length) {
        el.innerHTML = '<div class="review-empty">Solve a few puzzles to unlock personalized focus areas.</div>';
        return;
    }
    el.innerHTML = rows.map(w => `
        <div class="weak-card">
            <div class="weak-type">${w.type}</div>
            <div class="weak-title">${w.label}</div>
            <div class="weak-meta">${w.solves} solve${w.solves === 1 ? '' : 's'} · ${w.avgAccuracy}% avg accuracy · ${w.avgScore} avg score</div>
            <div class="weak-action">${w.action}</div>
        </div>
    `).join('');
}

function renderDailyCalendar() {
    const el = document.getElementById('daily-calendar');
    if (!el) return;
    const days = MedCrossProgress.getDailyHistory(21, allPuzzleIds());
    el.innerHTML = `
        <div class="daily-calendar-strip">
            ${days.map(d => {
                const label = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
                return `<div class="daily-day ${d.completed ? 'done' : ''} ${d.today ? 'today' : ''}" title="${label}${d.completed ? ' completed' : ''}">
                    <span>${label.split(' ')[0]}</span>
                    <strong>${label.split(' ').slice(1).join(' ')}</strong>
                </div>`;
            }).join('')}
        </div>
        <div class="daily-calendar-note">Completed days are highlighted. Today’s puzzle remains deterministic and works offline.</div>
    `;
}

const BOX_LABELS = { 1: 'New', 2: 'Learning', 3: 'Familiar', 4: 'Strong', 5: 'Mastered' };
const TODAY_KEY = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

function renderReviewQueue() {
    const el = document.getElementById('review-list');
    const queue = MedCrossProgress.getReviewQueue();
    const stats = MedCrossProgress.getReviewStats();

    // Update the Study Now CTA.
    const studyBtn = document.getElementById('study-now');
    if (studyBtn) {
        if (stats.due > 0) {
            studyBtn.textContent = `Study Now (${stats.due} due)`;
            studyBtn.classList.remove('disabled');
            studyBtn.removeAttribute('aria-disabled');
        } else if (stats.total > 0) {
            studyBtn.textContent = 'All reviewed ✓';
            studyBtn.classList.add('disabled');
            studyBtn.setAttribute('aria-disabled', 'true');
        } else {
            studyBtn.textContent = 'Study Now';
            studyBtn.classList.add('disabled');
            studyBtn.setAttribute('aria-disabled', 'true');
        }
    }

    if (!queue.length) {
        el.innerHTML = '<div class="review-empty">Nothing to review yet. Terms you miss or reveal will appear here. 🎉</div>';
        return;
    }
    el.innerHTML = queue.map(item => {
        const isDue = (item.due || TODAY_KEY) <= TODAY_KEY;
        return `
        <div class="review-item" data-term="${item.term}">
            <div class="review-main">
                <div class="review-term">${item.term}
                    <span class="box-badge box-${item.box || 1}">${BOX_LABELS[item.box || 1]}</span>
                    ${isDue ? '<span class="due-badge">Due</span>' : ''}
                </div>
                <div class="review-clue">${item.clue}${item.category ? ' · ' + catName(item.category) : ''}${item.difficulty ? ' · ' + (DIFF_SHORT[item.difficulty] || catName(item.difficulty)) : ''}</div>
                <div class="review-clue">Missed ${item.missedCount || 1}x${item.sourcePuzzle ? ' · Source: ' + item.sourcePuzzle : ''}${item.lastResult ? ' · Last: ' + item.lastResult : ''}</div>
            </div>
            <button class="review-remove" title="Mark as learned">✓ Learned</button>
        </div>`;
    }).join('');
    el.querySelectorAll('.review-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const term = e.target.closest('.review-item').dataset.term;
            MedCrossProgress.removeReviewTerm(term);
            renderReviewQueue();
        });
    });
}
