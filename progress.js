/**
 * MedCross Progress Tracking Module
 * Handles save/resume, completion tracking, statistics, streaks,
 * achievements, scoring, and a spaced-review queue.
 * All data is persisted to localStorage.
 */
const MedCrossProgress = (() => {
    const STORAGE_KEY = 'medcross_progress';
    const SETTINGS_KEY = 'medcross_settings';
    const META_KEY = 'medcross_meta'; // streaks, achievements, review queue

    function _load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch { return {}; }
    }

    function _save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Could not save progress.', e);
        }
    }

    function _loadMeta() {
        try {
            const m = JSON.parse(localStorage.getItem(META_KEY)) || {};
            return {
                streak: { current: 0, longest: 0, lastDay: null },
                achievements: {},      // id -> ISO unlock date
                review: [],            // [{ term, clue, category, addedAt }]
                ...m
            };
        } catch {
            return { streak: { current: 0, longest: 0, lastDay: null }, achievements: {}, review: [] };
        }
    }

    function _saveMeta(meta) {
        try {
            localStorage.setItem(META_KEY, JSON.stringify(meta));
        } catch (e) {
            console.warn('Could not save meta.', e);
        }
    }

    function _dayKey(date = new Date()) {
        // Local-date key YYYY-MM-DD
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function _daysBetween(aKey, bKey) {
        const a = new Date(aKey + 'T00:00:00');
        const b = new Date(bKey + 'T00:00:00');
        return Math.round((b - a) / 86400000);
    }

    /** Get progress object for a specific puzzle */
    function getProgress(puzzleId) {
        const data = _load();
        return data[puzzleId] || null;
    }

    function _blank() {
        return {
            completed: false, bestTime: null, attempts: 0, lastPlayed: null,
            answers: [], elapsedSeconds: 0,
            bestScore: null, lastAccuracy: null, lastMistakes: null
        };
    }

    /** Save in-progress answers (array of {row, col, value}) */
    function saveAnswers(puzzleId, answers, elapsedSeconds) {
        const data = _load();
        if (!data[puzzleId]) data[puzzleId] = _blank();
        data[puzzleId].answers = answers;
        data[puzzleId].elapsedSeconds = elapsedSeconds;
        data[puzzleId].lastPlayed = new Date().toISOString();
        _save(data);
    }

    /**
     * Mark a puzzle as completed.
     * stats: { mistakes, hintsUsed, revealsUsed, accuracy, score }
     * Returns { newlyUnlocked: [...achievementIds] }.
     */
    function markCompleted(puzzleId, timeSeconds, stats = {}) {
        const data = _load();
        if (!data[puzzleId]) data[puzzleId] = _blank();
        const entry = data[puzzleId];
        entry.completed = true;
        entry.attempts = (entry.attempts || 0) + 1;
        entry.lastPlayed = new Date().toISOString();
        entry.answers = [];
        if (!entry.bestTime || timeSeconds < entry.bestTime) entry.bestTime = timeSeconds;
        if (typeof stats.accuracy === 'number') entry.lastAccuracy = stats.accuracy;
        if (typeof stats.mistakes === 'number') entry.lastMistakes = stats.mistakes;
        if (typeof stats.score === 'number' && (!entry.bestScore || stats.score > entry.bestScore)) {
            entry.bestScore = stats.score;
        }
        _save(data);

        const streak = _recordPlayDay();
        const newlyUnlocked = _evaluateAchievements({ puzzleId, timeSeconds, stats, streak });
        return { newlyUnlocked, streak };
    }

    /** Clear progress for a specific puzzle */
    function clearPuzzleProgress(puzzleId) {
        const data = _load();
        delete data[puzzleId];
        _save(data);
    }

    /** Get overall stats */
    function getStats() {
        const data = _load();
        const entries = Object.values(data);
        const completed = entries.filter(e => e.completed);
        const times = completed.map(e => e.bestTime).filter(Boolean);
        const accuracies = completed.map(e => e.lastAccuracy).filter(a => typeof a === 'number');

        return {
            totalCompleted: completed.length,
            totalAttempted: entries.length,
            averageTime: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
            bestTime: times.length ? Math.min(...times) : 0,
            totalTime: times.reduce((a, b) => a + b, 0),
            averageAccuracy: accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null,
            totalScore: completed.reduce((sum, e) => sum + (e.bestScore || 0), 0)
        };
    }

    /** Get all puzzle progress entries */
    function getAll() {
        return _load();
    }

    // ---------------------------------------------------------------------
    // Scoring
    // ---------------------------------------------------------------------
    /**
     * Compute a 0-1000 score for a solve.
     * Rewards speed and accuracy, penalizes hints/reveals.
     */
    function computeScore({ timeSeconds, accuracy, hintsUsed = 0, revealsUsed = 0, clueCount = 1 }) {
        const base = 1000;
        const accFactor = Math.max(0, (accuracy ?? 100) / 100);        // 0-1
        const timePenalty = Math.min(400, Math.round((timeSeconds || 0) / Math.max(clueCount, 1) * 8));
        const hintPenalty = hintsUsed * 30;
        const revealPenalty = revealsUsed * 50;
        const score = Math.round(base * accFactor - timePenalty - hintPenalty - revealPenalty);
        return Math.max(0, Math.min(1000, score));
    }

    // ---------------------------------------------------------------------
    // Streaks
    // ---------------------------------------------------------------------
    function _recordPlayDay() {
        const meta = _loadMeta();
        const today = _dayKey();
        const s = meta.streak;
        if (s.lastDay === today) {
            // already counted today
        } else if (s.lastDay && _daysBetween(s.lastDay, today) === 1) {
            s.current += 1;
        } else {
            s.current = 1;
        }
        s.lastDay = today;
        if (s.current > s.longest) s.longest = s.current;
        meta.streak = s;
        _saveMeta(meta);
        return { ...s };
    }

    function getStreak() {
        const meta = _loadMeta();
        const s = meta.streak;
        // If the last play day was before yesterday, the current streak is broken.
        if (s.lastDay) {
            const gap = _daysBetween(s.lastDay, _dayKey());
            if (gap > 1) return { current: 0, longest: s.longest, lastDay: s.lastDay };
        }
        return { ...s };
    }

    // ---------------------------------------------------------------------
    // Achievements
    // ---------------------------------------------------------------------
    const ACHIEVEMENTS = [
        { id: 'first-solve', icon: '🎯', name: 'First Steps', desc: 'Complete your first puzzle.' },
        { id: 'flawless', icon: '💎', name: 'Flawless', desc: 'Solve a puzzle with 100% accuracy and no reveals.' },
        { id: 'no-help', icon: '🧠', name: 'Unaided', desc: 'Solve a puzzle without using any hints or reveals.' },
        { id: 'speed-demon', icon: '⚡', name: 'Speed Demon', desc: 'Solve any puzzle in under 2 minutes.' },
        { id: 'streak-3', icon: '🔥', name: 'On Fire', desc: 'Reach a 3-day solving streak.' },
        { id: 'streak-7', icon: '📅', name: 'Weekly Warrior', desc: 'Reach a 7-day solving streak.' },
        { id: 'ten-solved', icon: '🏅', name: 'Dedicated', desc: 'Complete 10 puzzles.' },
        { id: 'specialist', icon: '🩺', name: 'Specialist', desc: 'Complete every difficulty in a single specialty.' },
        { id: 'high-scorer', icon: '🌟', name: 'High Scorer', desc: 'Earn a score of 900 or more on a puzzle.' }
    ];

    function getAchievements() {
        const meta = _loadMeta();
        return ACHIEVEMENTS.map(a => ({
            ...a,
            unlocked: Boolean(meta.achievements[a.id]),
            unlockedAt: meta.achievements[a.id] || null
        }));
    }

    function _unlock(meta, id) {
        if (!meta.achievements[id]) {
            meta.achievements[id] = new Date().toISOString();
            return true;
        }
        return false;
    }

    function _completedCountBySpecialty() {
        const data = _load();
        const byCat = {};
        for (const [id, e] of Object.entries(data)) {
            if (!e.completed) continue;
            const cat = id.split('-')[0];
            byCat[cat] = (byCat[cat] || 0) + 1;
        }
        return byCat;
    }

    function _evaluateAchievements({ puzzleId, timeSeconds, stats, streak }) {
        const meta = _loadMeta();
        const newly = [];
        const stat = getStats();

        const tryUnlock = (id, cond) => { if (cond && _unlock(meta, id)) newly.push(id); };

        tryUnlock('first-solve', stat.totalCompleted >= 1);
        tryUnlock('flawless', stats.accuracy === 100 && (stats.revealsUsed || 0) === 0);
        tryUnlock('no-help', (stats.hintsUsed || 0) === 0 && (stats.revealsUsed || 0) === 0 && stats.accuracy === 100);
        tryUnlock('speed-demon', timeSeconds > 0 && timeSeconds < 120);
        tryUnlock('streak-3', streak && streak.current >= 3);
        tryUnlock('streak-7', streak && streak.current >= 7);
        tryUnlock('ten-solved', stat.totalCompleted >= 10);
        tryUnlock('high-scorer', (stats.score || 0) >= 900);

        // Specialist: all difficulties in this puzzle's specialty completed
        try {
            const cat = puzzleId.split('-')[0];
            if (typeof medicalCrosswordData !== 'undefined' && medicalCrosswordData[cat]) {
                const totalDiffs = Object.keys(medicalCrosswordData[cat]).length;
                const doneInCat = _completedCountBySpecialty()[cat] || 0;
                tryUnlock('specialist', doneInCat >= totalDiffs);
            }
        } catch { /* medicalCrosswordData not available */ }

        if (newly.length) _saveMeta(meta);
        return newly;
    }

    // ---------------------------------------------------------------------
    // Review queue (terms the user missed or revealed)
    // ---------------------------------------------------------------------
    // Leitner box intervals in days. New terms are due immediately (box 1).
    const LEITNER_INTERVALS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 };
    const MAX_BOX = 5;

    function _addDays(dayKey, days) {
        const d = new Date(dayKey + 'T00:00:00');
        d.setDate(d.getDate() + days);
        return _dayKey(d);
    }

    // Ensure legacy review items have SR fields.
    function _normalizeReviewItem(r) {
        if (r.box == null) r.box = 1;
        if (r.due == null) r.due = _dayKey();      // legacy items are due now
        if (r.reps == null) r.reps = 0;
        if (r.lapses == null) r.lapses = 0;
        return r;
    }

    function addReviewTerms(terms) {
        if (!Array.isArray(terms) || terms.length === 0) return;
        const meta = _loadMeta();
        const existing = new Set(meta.review.map(r => r.term));
        const today = _dayKey();
        for (const t of terms) {
            if (!t || !t.term || existing.has(t.term)) continue;
            meta.review.push({
                term: t.term,
                clue: t.clue || '',
                category: t.category || '',
                addedAt: new Date().toISOString(),
                box: 1, due: today, reps: 0, lapses: 0
            });
            existing.add(t.term);
        }
        // Keep the queue bounded.
        if (meta.review.length > 200) meta.review = meta.review.slice(-200);
        _saveMeta(meta);
    }

    function getReviewQueue() {
        return _loadMeta().review.map(_normalizeReviewItem).slice().reverse();
    }

    /** Items due for study today (or overdue / legacy). */
    function getDueReviewTerms() {
        const today = _dayKey();
        return _loadMeta().review
            .map(_normalizeReviewItem)
            .filter(r => r.due <= today);
    }

    /**
     * Grade a term after recall. correct=true promotes it up a box,
     * correct=false resets it to box 1. Returns the updated item.
     */
    function gradeReviewTerm(term, correct) {
        const meta = _loadMeta();
        const item = meta.review.find(r => r.term === term);
        if (!item) return null;
        _normalizeReviewItem(item);
        const today = _dayKey();
        item.reps += 1;
        if (correct) {
            item.box = Math.min(MAX_BOX, item.box + 1);
        } else {
            item.box = 1;
            item.lapses += 1;
        }
        item.due = _addDays(today, LEITNER_INTERVALS[item.box]);
        item.lastGraded = new Date().toISOString();
        _saveMeta(meta);
        return { ...item };
    }

    function getReviewStats() {
        const today = _dayKey();
        const items = _loadMeta().review.map(_normalizeReviewItem);
        const byBox = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let due = 0, mastered = 0;
        for (const r of items) {
            byBox[r.box] = (byBox[r.box] || 0) + 1;
            if (r.due <= today) due++;
            if (r.box >= MAX_BOX) mastered++;
        }
        return { total: items.length, due, mastered, byBox };
    }

    function removeReviewTerm(term) {
        const meta = _loadMeta();
        meta.review = meta.review.filter(r => r.term !== term);
        _saveMeta(meta);
    }

    function clearReviewQueue() {
        const meta = _loadMeta();
        meta.review = [];
        _saveMeta(meta);
    }

    // ---------------------------------------------------------------------
    // Daily puzzle (deterministic pick from the date)
    // ---------------------------------------------------------------------
    function getDailyPuzzleId(puzzleIds) {
        if (!Array.isArray(puzzleIds) || puzzleIds.length === 0) return null;
        const key = _dayKey();
        let hash = 0;
        for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
        const sorted = [...puzzleIds].sort();
        return sorted[hash % sorted.length];
    }

    function isDailyDone(puzzleId) {
        const meta = _loadMeta();
        return meta.dailyDoneDay === _dayKey() && meta.dailyDoneId === puzzleId;
    }

    function markDailyDone(puzzleId) {
        const meta = _loadMeta();
        meta.dailyDoneDay = _dayKey();
        meta.dailyDoneId = puzzleId;
        _saveMeta(meta);
    }

    // Settings (dark mode, pencil mode, etc.)
    function getSettings() {
        try {
            return { darkMode: false, pencilMode: false, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
        } catch { return { darkMode: false, pencilMode: false }; }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.warn('Could not save settings.', e);
        }
    }

    return {
        getProgress, saveAnswers, markCompleted, clearPuzzleProgress,
        getStats, getAll, getSettings, saveSettings,
        computeScore,
        getStreak,
        getAchievements, ACHIEVEMENTS,
        addReviewTerms, getReviewQueue, getDueReviewTerms, gradeReviewTerm,
        getReviewStats, removeReviewTerm, clearReviewQueue,
        getDailyPuzzleId, isDailyDone, markDailyDone
    };
})();
