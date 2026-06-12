const PUZZLE_DIFFICULTY_LABELS = { m1: 'M1', m2: 'M2', clinical: 'Clinical', usmle: 'USMLE', residency: 'Residency', notes: 'Notes', api: 'Topic', mini: 'Mini' };

function goBack() { window.location.href = 'index.html'; }
function getPuzzleIdFromUrl() { return new URLSearchParams(window.location.search).get('id'); }

function getPuzzleById(puzzleId) {
    if (puzzleId && puzzleId.startsWith('custom-')) {
        const custom = MedCrossProgress.getCustomPuzzles().find(p => p.id === puzzleId);
        if (custom) return custom;
    }

    const cachedPuzzle = getCachedPuzzleById(puzzleId);
    if (cachedPuzzle && cachedPuzzle.data) {
        if (cachedPuzzle.data.stats?.curatedFallback) {
            const normalized = {
                ...cachedPuzzle,
                title: 'Medical Mini',
                category: 'generalMedicine',
                difficulty: 'mini'
            };
            upsertCachedPuzzle(normalized);
            return normalized;
        }
        return cachedPuzzle;
    }

    const parts = puzzleId.split('-');
    const isMini = parts[parts.length - 1] === 'mini';
    if (isMini) parts.pop();
    const [category, ...difficultyParts] = parts;
    const difficulty = difficultyParts.join('-');
    if (!medicalCrosswordData[category] || !medicalCrosswordData[category][difficulty]) return null;

    const generator = new CrosswordGenerator(medicalCrosswordData);
    const generatedData = isMini
        ? generator.generateMiniCrossword(category, difficulty)
        : generator.generateCrossword(category, difficulty);
    const isCuratedMiniFallback = Boolean(isMini && generatedData.stats?.curatedFallback);
    const puzzle = {
        id: puzzleId,
        title: isCuratedMiniFallback
            ? 'Medical Mini'
            : isMini
            ? `${formatPuzzleName(category)} ${PUZZLE_DIFFICULTY_LABELS[difficulty] || formatPuzzleName(difficulty)} Mini`
            : `${formatPuzzleName(category)} ${PUZZLE_DIFFICULTY_LABELS[difficulty] || formatPuzzleName(difficulty)}`,
        category: isCuratedMiniFallback ? 'generalMedicine' : category,
        difficulty: isMini ? 'mini' : difficulty,
        sourceDifficulty: difficulty,
        size: `${generatedData.cols}x${generatedData.rows}`,
        data: generatedData
    };
    upsertCachedPuzzle(puzzle);
    return puzzle;
}

function getCachedPuzzleById(puzzleId) {
    try {
        const db = localStorage.getItem('generatedPuzzles');
        if (!db) return null;
        const puzzles = JSON.parse(db);
        return Array.isArray(puzzles) ? puzzles.find(p => p.id === puzzleId) || null : null;
    } catch { return null; }
}

function upsertCachedPuzzle(puzzle) {
    try {
        const db = localStorage.getItem('generatedPuzzles');
        const puzzles = db ? JSON.parse(db) : [];
        const safe = Array.isArray(puzzles) ? puzzles.filter(p => p.id !== puzzle.id) : [];
        safe.push(puzzle);
        localStorage.setItem('generatedPuzzles', JSON.stringify(safe));
    } catch (e) { console.warn('Could not update puzzle cache.', e); }
}

document.addEventListener('DOMContentLoaded', () => {

    const selectedPuzzleId = getPuzzleIdFromUrl() || localStorage.getItem('selectedPuzzleId');
    if (!selectedPuzzleId) {
        showToast('No puzzle was selected. Returning to the puzzle list.');
        setTimeout(goBack, 900);
        return;
    }
    localStorage.setItem('selectedPuzzleId', selectedPuzzleId);

    const puzzle = getPuzzleById(selectedPuzzleId);
    if (!puzzle) {
        showToast('Could not find puzzle data. Returning to the puzzle list.');
        setTimeout(goBack, 900);
        return;
    }

    const puzzleData = puzzle.data;
    const gridElement = document.getElementById('crossword-grid');
    const acrossCluesElement = document.getElementById('across-clues');
    const downCluesElement = document.getElementById('down-clues');
    const timerElement = document.getElementById('timer');
    const cluesContainer = document.getElementById('clues-container');
    const actionSelect = document.getElementById('action-select');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    let currentDirection = 'across';
    let activeCell = null;
    let timerInterval;
    let timerStarted = false;
    let elapsedSeconds = 0;
    let isSolved = false;
    let hintsRemaining = 3;
    let totalCells = 0;

    // Stats tracking for scoring / accuracy / review queue
    let mistakeCount = 0;
    let hintsUsed = 0;
    let revealsUsed = 0;
    const wrongCellKeys = new Set();   // cells that ever held a wrong letter
    const revealedCellKeys = new Set(); // cells filled via reveal/hint
    let pencilMode = MedCrossProgress.getSettings().pencilMode || false;
    let autoCheck = MedCrossProgress.getSettings().autoCheck || false;

    // NYT-style state
    let timerPaused = false;
    let assistUsed = false;        // any check/reveal disqualifies the gold star
    let keepTryingShown = false;   // "filled but wrong" modal shown for current fill

    function ensureToastRoot() {
        let root = document.getElementById('app-toast-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'app-toast-root';
            root.className = 'app-toast-root';
            root.setAttribute('aria-live', 'polite');
            document.body.appendChild(root);
        }
        return root;
    }

    function showToast(message, tone = 'info') {
        const root = ensureToastRoot();
        const toast = document.createElement('div');
        toast.className = `app-toast ${tone}`;
        toast.textContent = message;
        root.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 220);
        }, 2400);
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function showAppDialog({ title, body, confirmText = 'Continue', cancelText = 'Cancel', textValue = '' }) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-dialog-overlay active';
            overlay.innerHTML = `
                <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
                    <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
                    <p>${escapeHtml(body)}</p>
                    ${textValue ? `<textarea class="app-dialog-text" readonly>${escapeHtml(textValue)}</textarea>` : ''}
                    <div class="app-dialog-actions">
                        <button class="modal-btn modal-btn-secondary" data-dialog-cancel>${escapeHtml(cancelText)}</button>
                        <button class="modal-btn modal-btn-primary" data-dialog-confirm>${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const close = (value) => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 160);
                resolve(value);
            };
            overlay.querySelector('[data-dialog-cancel]').addEventListener('click', () => close(false));
            overlay.querySelector('[data-dialog-confirm]').addEventListener('click', () => close(true));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
            overlay.querySelector('[data-dialog-confirm]').focus();
        });
    }

    function surfacePuzzleQualityWarnings() {
        if (typeof MedCrossValidation === 'undefined') return;
        const validation = MedCrossValidation.validatePuzzle(puzzleData);
        puzzle.validation = validation;
        if (!validation.warnings.length) return;
        console.warn('[MedCross] Puzzle validation warnings:', validation);
        if (!validation.valid) {
            showToast('This puzzle has a structural issue. Try another puzzle if solving feels odd.', 'warning');
            return;
        }
        const meaningful = validation.warnings.filter(w => w.severity !== 'info');
        if (meaningful.length && validation.stats.checkedPct < 30) {
            showToast('This generated grid has fewer crossings than usual.', 'info');
        }
    }

    surfacePuzzleQualityWarnings();
    updateHeader(puzzle);
    applyGridSizing(puzzleData.grid.length, puzzleData.grid[0].length);
    initializePuzzle();

    // Re-size cells whenever the window is resized (e.g. phone rotation,
    // desktop panel resize) so the grid never overflows its column.
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => applyGridSizing(puzzleData.grid.length, puzzleData.grid[0].length), 100);
    });
    bindControls();
    bindGridInteractions();
    restoreProgress();
    setupStartModal();

    function updateHeader(p) {
        document.getElementById('puzzle-title').textContent = p.title;
        document.getElementById('puzzle-category').textContent = formatPuzzleName(p.category);
        document.getElementById('puzzle-difficulty').textContent = PUZZLE_DIFFICULTY_LABELS[p.difficulty] || formatPuzzleName(p.difficulty);
    }

    function applyGridSizing(rows, cols) {
        // Measure the actual rendered width of the puzzle column so the grid
        // never bleeds into the clues panel — even on large monitors with big grids.
        const container = document.getElementById('puzzle-container');
        const availW = (container ? container.clientWidth : window.innerWidth) - 8;
        const availH = window.innerHeight * 0.68;

        const maxByW = Math.floor(availW / Math.max(cols, 1));
        const maxByH = Math.floor(availH / Math.max(rows, 1));
        const cellSize = Math.max(18, Math.min(40, maxByW, maxByH));

        gridElement.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
        gridElement.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
        gridElement.style.setProperty('--cell-size', `${cellSize}px`);
        gridElement.style.setProperty('--cell-font-size', `${Math.max(12, Math.floor(cellSize * 0.52))}px`);
    }

    function initializePuzzle() {
        gridElement.innerHTML = '';
        acrossCluesElement.innerHTML = '';
        downCluesElement.innerHTML = '';
        totalCells = 0;

        const numberedCells = {};
        renderClues(puzzleData.clues.across, acrossCluesElement, numberedCells);
        renderClues(puzzleData.clues.down, downCluesElement, numberedCells);

        puzzleData.grid.forEach((row, ri) => {
            row.forEach((cell, ci) => {
                const div = document.createElement('div');
                div.dataset.row = ri;
                div.dataset.col = ci;
                if (cell === 0) { div.classList.add('black-cell'); gridElement.appendChild(div); return; }
                div.classList.add('grid-cell');
                div.setAttribute('role', 'gridcell');
                totalCells++;
                const num = numberedCells[`${ri},${ci}`];
                if (num) { const s = document.createElement('span'); s.className = 'clue-number'; s.textContent = num; div.appendChild(s); }
                const input = document.createElement('input');
                input.type = 'text'; input.maxLength = 1; input.autocomplete = 'off'; input.inputMode = 'text';
                input.setAttribute('aria-label', `Row ${ri + 1}, column ${ci + 1}`);
                div.appendChild(input);
                gridElement.appendChild(div);
            });
        });
        updateProgressBar();
    }

    function renderClues(clues, container, numberedCells) {
        clues.forEach(clue => {
            const li = document.createElement('li');
            li.dataset.row = clue.row; li.dataset.col = clue.col; li.dataset.direction = clue.direction;
            const number = document.createElement('span');
            number.className = 'clue-number-list';
            number.textContent = `${clue.number}.`;
            li.append(number, document.createTextNode(` ${clue.clue || ''}`));
            container.appendChild(li);
            if (!numberedCells[`${clue.row},${clue.col}`]) numberedCells[`${clue.row},${clue.col}`] = clue.number;
        });
    }

    function bindControls() {
        document.getElementById('back-button')?.addEventListener('click', goBack);
        document.getElementById('check-button').addEventListener('click', checkGrid);
        document.getElementById('reveal-button').addEventListener('click', revealEntirePuzzle);
        document.getElementById('hint-button').addEventListener('click', useHint);

        const pencilBtn = document.getElementById('pencil-button');
        const syncPencilBtn = () => {
            pencilBtn.classList.toggle('active', pencilMode);
            pencilBtn.setAttribute('aria-pressed', String(pencilMode));
        };
        syncPencilBtn();
        pencilBtn.addEventListener('click', () => {
            pencilMode = !pencilMode;
            MedCrossProgress.saveSettings({ ...MedCrossProgress.getSettings(), pencilMode });
            syncPencilBtn();
            if (activeCell) activeCell.querySelector('input').focus();
        });

        const autoCheckBtn = document.getElementById('autocheck-button');
        const syncAutoCheckBtn = () => {
            autoCheckBtn.classList.toggle('active', autoCheck);
            autoCheckBtn.setAttribute('aria-pressed', String(autoCheck));
        };
        syncAutoCheckBtn();
        autoCheckBtn.addEventListener('click', () => {
            autoCheck = !autoCheck;
            MedCrossProgress.saveSettings({ ...MedCrossProgress.getSettings(), autoCheck });
            syncAutoCheckBtn();
            if (autoCheck) applyAutoCheckAll();
            else gridElement.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('correct', 'incorrect'));
            if (activeCell) activeCell.querySelector('input').focus();
        });

        document.getElementById('apply-action').addEventListener('click', async () => {
            const action = actionSelect.value;
            if (!action) return;
            const needsCell = ['reveal-letter', 'reveal-word', 'check-letter', 'check-word'].includes(action);
            if (needsCell && !activeCell) {
                showToast('Select a cell first.');
                actionSelect.value = '';
                return;
            }
            switch (action) {
                case 'reveal-letter': revealsUsed++; revealCell(activeCell); break;
                case 'reveal-word': revealsUsed++; getHighlightedCells().forEach(revealCell); break;
                case 'reveal-grid': if (!(await revealEntirePuzzle())) return; break;
                case 'check-letter': checkCell(activeCell); break;
                case 'check-word': getHighlightedCells().forEach(checkCell); break;
                case 'check-grid': checkGrid(); break;
            }
            actionSelect.value = '';
            updateProgressBar();
            if (checkPuzzleState()) finishPuzzle();
        });

        // Pause / resume (NYT-style)
        document.getElementById('pause-button').addEventListener('click', () => {
            timerPaused ? resumeGame() : pauseGame();
        });
        document.getElementById('resume-button').addEventListener('click', resumeGame);
        document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

        // Clue bar prev/next arrows
        document.getElementById('prev-clue-btn').addEventListener('click', (e) => { e.stopPropagation(); jumpToClue(-1); });
        document.getElementById('next-clue-btn').addEventListener('click', (e) => { e.stopPropagation(); jumpToClue(1); });

        // "Not quite right" modal
        const keepTryingModal = document.getElementById('keep-trying-modal');
        document.getElementById('keep-trying-close').addEventListener('click', () => {
            keepTryingModal.classList.remove('active');
            if (activeCell) activeCell.querySelector('input').focus();
        });
        document.getElementById('keep-trying-check').addEventListener('click', () => {
            keepTryingModal.classList.remove('active');
            checkGrid();
        });

        // Modal buttons
        document.getElementById('modal-new-puzzle').addEventListener('click', () => {
            MedCrossProgress.clearPuzzleProgress(selectedPuzzleId);
            upsertCachedPuzzle({ ...puzzle, data: null }); // Force regeneration
            window.location.reload();
        });
        document.getElementById('modal-share').addEventListener('click', shareResults);
        document.getElementById('modal-back-home')?.addEventListener('click', goBack);
    }

    function bindGridInteractions() {
        cluesContainer.addEventListener('click', (e) => {
            if (timerPaused) return;
            const li = e.target.closest('li');
            if (!li) return;
            startTimer();
            currentDirection = li.dataset.direction;
            activeCell = gridElement.querySelector(`[data-row="${li.dataset.row}"][data-col="${li.dataset.col}"]`);
            highlightWord();
            activeCell.querySelector('input').focus();
        });

        gridElement.addEventListener('click', (e) => {
            if (timerPaused) return;
            const cell = e.target.closest('.grid-cell');
            if (!cell) return;
            startTimer();
            if (cell === activeCell) {
                const toggled = currentDirection === 'across' ? 'down' : 'across';
                currentDirection = directionHasClue(cell, toggled) ? toggled : currentDirection;
            } else {
                activeCell = cell;
                currentDirection = bestDirectionForCell(cell);
            }
            highlightWord();
            cell.querySelector('input').focus();
        });

        gridElement.addEventListener('input', (e) => {
            if (isSolved || timerPaused) return;
            const input = e.target;
            if (!(input instanceof HTMLInputElement)) return;
            input.value = input.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 1);
            const cell = input.closest('.grid-cell');
            if (cell) {
                activeCell = cell;
                cell.classList.remove('correct', 'incorrect');
                cell.classList.toggle('pencil', pencilMode && input.value !== '');
                if (input.value) {
                    const r = parseInt(cell.dataset.row, 10), c = parseInt(cell.dataset.col, 10);
                    const isCorrect = input.value.toUpperCase() === puzzleData.solution[r][c];
                    if (!isCorrect) {
                        mistakeCount++;
                        wrongCellKeys.add(`${r},${c}`);
                    }
                    // Auto-check: flag right/wrong in real time (skip while penciling).
                    if (autoCheck && !pencilMode) {
                        cell.classList.add(isCorrect ? 'correct' : 'incorrect');
                    }
                    if (isCorrect && !pencilMode) {
                        checkWordCompletion(cell);
                    }
                }
            }
            if (!isGridFull()) keepTryingShown = false;
            updateProgressBar();
            autoSaveProgress();
        });

        gridElement.addEventListener('keyup', (e) => {
            if (isSolved || timerPaused || !activeCell) return;
            if (e.key.length === 1 && e.key.match(/[a-z0-9]/i)) {
                if (checkPuzzleState()) {
                    finishPuzzle();
                    return;
                }
                if (isGridFull()) {
                    showKeepTrying();
                    return;
                }
                advanceAfterTyping();
            }
        });

        gridElement.addEventListener('keydown', (e) => {
            if (isSolved || timerPaused || !activeCell) return;

            if (e.key === 'Backspace') {
                const input = activeCell.querySelector('input');
                if (input.value === '') {
                    e.preventDefault();
                    moveToPreviousCell();
                    if (activeCell) {
                        activeCell.querySelector('input').value = '';
                        activeCell.classList.remove('correct', 'incorrect');
                    }
                } else { activeCell.classList.remove('correct', 'incorrect'); }
                autoSaveProgress();
                updateProgressBar();
                return;
            }

            // Tab = next clue, Shift+Tab = prev clue
            if (e.key === 'Tab') {
                e.preventDefault();
                jumpToClue(e.shiftKey ? -1 : 1);
                return;
            }

            // Space = toggle direction
            if (e.key === ' ') {
                e.preventDefault();
                const toggled = currentDirection === 'across' ? 'down' : 'across';
                if (directionHasClue(activeCell, toggled)) {
                    currentDirection = toggled;
                    highlightWord();
                }
                return;
            }

            // Escape = deselect
            if (e.key === 'Escape') {
                activeCell = null;
                gridElement.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('highlighted', 'focused'));
                cluesContainer.querySelectorAll('li').forEach(li => li.classList.remove('clue-active'));
                updateActiveClueBanner(null);
                return;
            }

            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            const row = parseInt(activeCell.dataset.row, 10);
            const col = parseInt(activeCell.dataset.col, 10);
            const moves = {
                ArrowUp: { row: row - 1, col, direction: 'down' },
                ArrowDown: { row: row + 1, col, direction: 'down' },
                ArrowLeft: { row, col: col - 1, direction: 'across' },
                ArrowRight: { row, col: col + 1, direction: 'across' }
            };
            const move = moves[e.key];
            const next = getCell(move.row, move.col);
            if (next) { currentDirection = move.direction; focusCell(next); }
        });
    }

    // Timer (NYT-style: pausable, auto-pauses when you leave the tab)
    function startTimer() {
        if (timerStarted) return;
        timerStarted = true;
        document.getElementById('pause-button').hidden = false;
        runTimerInterval();
    }
    function runTimerInterval() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            elapsedSeconds++;
            renderTimer();
        }, 1000);
    }
    function renderTimer() { timerElement.textContent = formatTimeDisplay(elapsedSeconds); }
    function stopTimer() { clearInterval(timerInterval); }

    function pauseGame() {
        if (!timerStarted || timerPaused || isSolved) return;
        timerPaused = true;
        stopTimer();
        autoSaveProgress();
        if (activeCell) activeCell.querySelector('input').blur();
        document.getElementById('pause-overlay').hidden = false;
        const btn = document.getElementById('pause-button');
        btn.textContent = 'Resume';
        btn.setAttribute('aria-label', 'Resume timer');
    }
    function resumeGame() {
        if (!timerPaused) return;
        timerPaused = false;
        document.getElementById('pause-overlay').hidden = true;
        const btn = document.getElementById('pause-button');
        btn.textContent = 'Pause';
        btn.setAttribute('aria-label', 'Pause timer');
        runTimerInterval();
        if (activeCell) activeCell.querySelector('input').focus();
    }

    function formatTimeDisplay(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
    }

    // Progress bar
    function updateProgressBar() {
        const filled = [...gridElement.querySelectorAll('.grid-cell input')].filter(i => i.value).length;
        const pct = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `${pct}%`;
    }

    // Hint system
    function useHint() {
        if (isSolved || hintsRemaining <= 0) return;
        if (!activeCell) { showToast('Select a cell first.'); return; }
        const cells = getHighlightedCells();
        const emptyCell = cells.find(c => !c.querySelector('input').value);
        if (!emptyCell) return;
        revealCell(emptyCell);
        hintsRemaining--;
        hintsUsed++;
        document.getElementById('hint-counter').textContent = `(${hintsRemaining})`;
        if (hintsRemaining <= 0) document.getElementById('hint-button').disabled = true;
        updateProgressBar();
        if (checkPuzzleState()) finishPuzzle();
    }

    // Centralized completion: compute stats, persist, surface achievements.
    function finishPuzzle() {
        if (isSolved) return;
        isSolved = true;
        stopTimer();

        const accuracy = totalCells > 0
            ? Math.max(0, Math.round((1 - wrongCellKeys.size / totalCells) * 100))
            : 100;
        const clueCount = (puzzleData.clues.across.length + puzzleData.clues.down.length) || 1;
        const score = MedCrossProgress.computeScore({
            timeSeconds: elapsedSeconds, accuracy, hintsUsed, revealsUsed, clueCount
        });

        const reviewTerms = collectReviewTerms();
        const solveStats = { mistakes: mistakeCount, hintsUsed, revealsUsed, accuracy, score };
        MedCrossProgress.addReviewTerms(reviewTerms, {
            sourcePuzzle: puzzle.id,
            category: puzzle.category,
            difficulty: puzzle.difficulty
        });
        MedCrossProgress.recordSolveBreakdown(puzzle, solveStats, reviewTerms);

        const result = MedCrossProgress.markCompleted(selectedPuzzleId, elapsedSeconds, solveStats);
        if (puzzle && MedCrossProgress.getDailyPuzzleId) {
            // Daily completion is recorded by the homepage's daily id; mark if it matches.
            try {
                const ids = JSON.parse(localStorage.getItem('generatedPuzzles') || '[]').map(p => p.id);
                if (MedCrossProgress.getDailyPuzzleId(ids) === selectedPuzzleId) {
                    MedCrossProgress.markDailyDone(selectedPuzzleId, { ...solveStats, timeSeconds: elapsedSeconds });
                }
            } catch { /* ignore */ }
        }

        showCongratsModal({
            accuracy, score, mistakes: mistakeCount,
            newlyUnlocked: result.newlyUnlocked,
            clean: !assistUsed
        });
    }

    // Words where any cell was wrong or revealed -> worth reviewing.
    function collectReviewTerms() {
        const terms = [];
        const seen = new Set();
        const allClues = [...puzzleData.clues.across, ...puzzleData.clues.down];
        for (const clue of allClues) {
            const cells = getWordCells(clue.row, clue.col, clue.direction);
            const needsReview = cells.some(cell => {
                const key = `${cell.dataset.row},${cell.dataset.col}`;
                return wrongCellKeys.has(key) || revealedCellKeys.has(key);
            });
            if (needsReview && clue.answer && !seen.has(clue.answer)) {
                seen.add(clue.answer);
                terms.push({
                    term: clue.answer,
                    clue: clue.clue,
                    category: puzzle.category,
                    difficulty: puzzle.difficulty,
                    sourcePuzzle: puzzle.id
                });
            }
        }
        return terms;
    }

    function shareResults() {
        const accuracy = totalCells > 0
            ? Math.max(0, Math.round((1 - wrongCellKeys.size / totalCells) * 100))
            : 100;
        const clueCount = (puzzleData.clues.across.length + puzzleData.clues.down.length) || 1;
        const score = MedCrossProgress.computeScore({
            timeSeconds: elapsedSeconds, accuracy, hintsUsed, revealsUsed, clueCount
        });
        const text =
            `MedCross — ${puzzle.title}\n` +
            `${formatTimeDisplay(elapsedSeconds)}  ${accuracy}% accuracy  ${score} score\n` +
            `${hintsUsed} hints · ${revealsUsed} reveals\n` +
            `Solve medical crosswords at MedCross.`;
        const btn = document.getElementById('modal-share');
        const done = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = o, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => showShareDialog(text));
        } else {
            showShareDialog(text);
        }
    }

    function showShareDialog(text) {
        showAppDialog({
            title: 'Share Results',
            body: 'Copy your result from the field below.',
            confirmText: 'Done',
            cancelText: 'Close',
            textValue: text
        });
    }

    // Congratulations modal with confetti
    function showCongratsModal(stats = {}) {
        // NYT-style gold star for a solve with no checks or reveals
        const modal = document.getElementById('congrats-modal');
        modal.querySelector('.modal-title').textContent = stats.revealed ? 'Puzzle Revealed' : 'Congratulations!';
        modal.querySelector('.modal-emoji').textContent = '';
        modal.querySelector('.modal-subtitle').textContent = stats.revealed
            ? 'All answers are filled. Revealed puzzles are saved for review but not counted as completed.'
            : stats.clean
            ? 'Gold star! Solved with no checks or reveals.'
            : 'You solved the puzzle!';
        document.getElementById('modal-time').textContent = formatTimeDisplay(elapsedSeconds);
        if (typeof stats.score === 'number') document.getElementById('modal-score').textContent = stats.score;
        if (typeof stats.accuracy === 'number') document.getElementById('modal-accuracy').textContent = `${stats.accuracy}%`;
        if (typeof stats.mistakes === 'number') document.getElementById('modal-mistakes').textContent = stats.mistakes;

        const achEl = document.getElementById('modal-achievements');
        achEl.innerHTML = '';
        const unlocked = stats.newlyUnlocked || [];
        if (unlocked.length) {
            const defs = MedCrossProgress.ACHIEVEMENTS;
            achEl.innerHTML = '<div class="modal-ach-title">Achievement Unlocked</div>' +
                unlocked.map(id => {
                    const a = defs.find(d => d.id === id);
                    return a ? `<div class="modal-ach-item"><strong>${escapeHtml(a.name)}</strong> - ${escapeHtml(a.desc)}</div>` : '';
                }).join('');
        }

        document.getElementById('congrats-modal').classList.add('active');
        if (!stats.revealed) spawnConfetti();
    }

    function spawnConfetti() {
        const colors = ['#667eea', '#764ba2', '#f093fb', '#ffd700', '#28a745', '#e74c3c', '#3498db'];
        for (let i = 0; i < 60; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}vw`;
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = `${Math.random() * 2}s`;
            piece.style.animationDuration = `${2 + Math.random() * 2}s`;
            piece.style.width = `${6 + Math.random() * 8}px`;
            piece.style.height = `${6 + Math.random() * 8}px`;
            const overlay = document.getElementById('celebration-overlay') || document.body;
            overlay.appendChild(piece);
            setTimeout(() => piece.remove(), 5000);
        }
    }

    // ── NYT-style typing navigation ──────────────────────────────────────────
    // After typing: skip to the next EMPTY square in the word; when the word is
    // complete, jump to the next incomplete clue (like the NYT app).
    function advanceAfterTyping() {
        const cells = getHighlightedCells();
        const idx = cells.indexOf(activeCell);
        for (let i = idx + 1; i < cells.length; i++) {
            if (!cells[i].querySelector('input').value) return focusCell(cells[i]);
        }
        for (let i = 0; i < cells.length; i++) {
            if (!cells[i].querySelector('input').value) return focusCell(cells[i]);
        }
        jumpToNextIncompleteClue();
    }

    function jumpToNextIncompleteClue() {
        const allClues = [...cluesContainer.querySelectorAll('li')];
        if (allClues.length === 0) return;
        const activeClue = cluesContainer.querySelector('li.clue-active');
        const start = activeClue ? allClues.indexOf(activeClue) : -1;
        for (let step = 1; step <= allClues.length; step++) {
            const li = allClues[(start + step + allClues.length) % allClues.length];
            const cells = getWordCells(parseInt(li.dataset.row), parseInt(li.dataset.col), li.dataset.direction);
            const empty = cells.find(c => !c.querySelector('input').value);
            if (empty) {
                currentDirection = li.dataset.direction;
                activeCell = empty;
                highlightWord();
                empty.querySelector('input').focus();
                return;
            }
        }
        jumpToClue(1); // grid is full — just move on
    }

    function isGridFull() {
        return [...gridElement.querySelectorAll('.grid-cell input')].every(i => i.value);
    }

    function showKeepTrying() {
        if (keepTryingShown) return;
        keepTryingShown = true;
        document.getElementById('keep-trying-modal').classList.add('active');
    }

    // ── NYT-style start overlay ──────────────────────────────────────────────
    function setupStartModal() {
        const modal = document.getElementById('start-modal');
        const playBtn = document.getElementById('start-play-button');
        const progress = MedCrossProgress.getProgress(selectedPuzzleId);
        const hasProgress = progress && progress.answers && progress.answers.length > 0 && !progress.completed;
        if (hasProgress) {
            document.getElementById('start-title').textContent = 'Welcome back!';
            document.getElementById('start-subtitle').textContent = 'Pick up where you left off — the clock resumes when you hit Play.';
            playBtn.textContent = 'Resume';
        }
        modal.classList.add('active');
        playBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            startTimer();
            jumpToNextIncompleteClue();
        });
    }

    // Jump to next/previous clue
    function jumpToClue(direction) {
        const allClues = [...cluesContainer.querySelectorAll('li')];
        if (allClues.length === 0) return;
        const activeClue = cluesContainer.querySelector('li.clue-active');
        let idx = activeClue ? allClues.indexOf(activeClue) : -1;
        idx = (idx + direction + allClues.length) % allClues.length;
        const target = allClues[idx];
        currentDirection = target.dataset.direction;
        activeCell = gridElement.querySelector(`[data-row="${target.dataset.row}"][data-col="${target.dataset.col}"]`);
        if (activeCell) { highlightWord(); activeCell.querySelector('input').focus(); }
    }

    // Save/restore progress
    function collectAnswers() {
        const answers = [];
        gridElement.querySelectorAll('.grid-cell').forEach(cell => {
            const input = cell.querySelector('input');
            if (input.value) {
                answers.push({ row: parseInt(cell.dataset.row), col: parseInt(cell.dataset.col), value: input.value });
            }
        });
        return answers;
    }

    function autoSaveProgress() {
        const answers = collectAnswers();
        MedCrossProgress.saveAnswers(selectedPuzzleId, answers, elapsedSeconds);
    }

    function restoreProgress() {
        const progress = MedCrossProgress.getProgress(selectedPuzzleId);
        if (!progress || !progress.answers || progress.answers.length === 0) return;
        if (progress.completed) return; // Don't restore if already completed

        for (const a of progress.answers) {
            const cell = getCell(a.row, a.col);
            if (cell) cell.querySelector('input').value = a.value;
        }
        elapsedSeconds = progress.elapsedSeconds || 0;
        renderTimer();
        updateProgressBar();
    }

    // Core puzzle functions
    async function revealEntirePuzzle() {
        if (isSolved) return false;
        const confirmed = await showAppDialog({
            title: 'Reveal Entire Puzzle?',
            body: 'This fills every square and stops the timer.',
            confirmText: 'Reveal Puzzle'
        });
        if (!confirmed) return false;
        gridElement.querySelectorAll('.grid-cell').forEach(revealCell);
        isSolved = true;
        stopTimer();
        updateProgressBar();
        const reviewTerms = collectReviewTerms();
        MedCrossProgress.addReviewTerms(reviewTerms, {
            sourcePuzzle: puzzle.id,
            category: puzzle.category,
            difficulty: puzzle.difficulty
        });
        MedCrossProgress.saveAnswers(selectedPuzzleId, collectAnswers(), elapsedSeconds);
        showCongratsModal({
            revealed: true,
            accuracy: 0,
            score: 0,
            mistakes: mistakeCount
        });
        return true;
    }
    function revealCell(cell) {
        assistUsed = true;
        const input = cell.querySelector('input');
        const r = parseInt(cell.dataset.row); const c = parseInt(cell.dataset.col);
        input.value = puzzleData.solution[r][c];
        cell.classList.remove('correct', 'incorrect', 'pencil');
        cell.classList.add('revealed');
        revealedCellKeys.add(`${r},${c}`);
    }
    function checkGrid() { gridElement.querySelectorAll('.grid-cell').forEach(checkCell); }
    function applyAutoCheckAll() {
        gridElement.querySelectorAll('.grid-cell').forEach(cell => {
            if (cell.classList.contains('pencil')) return;
            checkCell(cell);
        });
    }
    function checkCell(cell) {
        assistUsed = true;
        const input = cell.querySelector('input');
        const r = parseInt(cell.dataset.row); const c = parseInt(cell.dataset.col);
        cell.classList.remove('correct', 'incorrect');
        if (!input.value) return;
        cell.classList.add(input.value.toUpperCase() === puzzleData.solution[r][c] ? 'correct' : 'incorrect');
    }
    function checkPuzzleState() {
        return [...gridElement.querySelectorAll('.grid-cell')].every(cell => {
            const input = cell.querySelector('input');
            const r = parseInt(cell.dataset.row); const c = parseInt(cell.dataset.col);
            return input.value.toUpperCase() === puzzleData.solution[r][c];
        });
    }

    function checkWordCompletion(cell) {
        ['across', 'down'].forEach(dir => {
            const cells = getWordCells(parseInt(cell.dataset.row), parseInt(cell.dataset.col), dir);
            if (cells.length > 1 && cells.every(c => {
                const i = c.querySelector('input');
                const r = parseInt(c.dataset.row), col = parseInt(c.dataset.col);
                return i.value && i.value.toUpperCase() === puzzleData.solution[r][col];
            })) {
                cells.forEach(c => {
                    c.classList.remove('word-pulse');
                    void c.offsetWidth; // trigger reflow
                    c.classList.add('word-pulse');
                });
            }
        });
    }

    // Navigation helpers
    function highlightWord() {
        gridElement.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('highlighted', 'focused'));
        cluesContainer.querySelectorAll('li').forEach(li => li.classList.remove('clue-active'));
        if (!activeCell) { updateActiveClueBanner(null); return; }
        const r = parseInt(activeCell.dataset.row); const c = parseInt(activeCell.dataset.col);
        const cells = getWordCells(r, c, currentDirection);
        cells.forEach(cell => cell.classList.add('highlighted'));
        activeCell.classList.add('focused');
        const start = cells[0];
        const clue = cluesContainer.querySelector(`li[data-row="${start.dataset.row}"][data-col="${start.dataset.col}"][data-direction="${currentDirection}"]`);
        if (clue) { clue.classList.add('clue-active'); clue.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        updateActiveClueBanner(clue);
    }

    // Mirror the active word's clue into the sticky banner above the grid.
    function updateActiveClueBanner(clueLi) {
        const banner = document.getElementById('active-clue-banner');
        if (!banner) return;
        if (!clueLi) { banner.hidden = true; return; }
        document.getElementById('active-clue-dir').textContent = currentDirection === 'across' ? 'Across' : 'Down';
        document.getElementById('active-clue-text').textContent = clueLi.textContent.trim();
        banner.hidden = false;
    }

    function getWordCells(row, col, dir) {
        const cells = [];
        if (dir === 'across') {
            let sc = col; while (sc > 0 && puzzleData.grid[row][sc - 1] === 1) sc--;
            for (let cc = sc; cc < puzzleData.grid[row].length && puzzleData.grid[row][cc] === 1; cc++) cells.push(getCell(row, cc));
        } else {
            let sr = row; while (sr > 0 && puzzleData.grid[sr - 1][col] === 1) sr--;
            for (let cr = sr; cr < puzzleData.grid.length && puzzleData.grid[cr][col] === 1; cr++) cells.push(getCell(cr, col));
        }
        return cells.filter(Boolean);
    }

    function getHighlightedCells() { return [...gridElement.querySelectorAll('.grid-cell.highlighted')]; }
    function bestDirectionForCell(cell) {
        if (directionHasClue(cell, currentDirection)) return currentDirection;
        const alt = currentDirection === 'across' ? 'down' : 'across';
        return directionHasClue(cell, alt) ? alt : currentDirection;
    }
    function directionHasClue(cell, dir) {
        const r = parseInt(cell.dataset.row); const c = parseInt(cell.dataset.col);
        const wc = getWordCells(r, c, dir);
        if (wc.length < 2) return false;
        return Boolean(cluesContainer.querySelector(`li[data-row="${wc[0].dataset.row}"][data-col="${wc[0].dataset.col}"][data-direction="${dir}"]`));
    }
    function moveToNextCell() {
        const r = parseInt(activeCell.dataset.row); const c = parseInt(activeCell.dataset.col);
        const next = currentDirection === 'across' ? getCell(r, c + 1) : getCell(r + 1, c);
        if (next) focusCell(next);
    }
    function moveToPreviousCell() {
        const r = parseInt(activeCell.dataset.row); const c = parseInt(activeCell.dataset.col);
        const prev = currentDirection === 'across' ? getCell(r, c - 1) : getCell(r - 1, c);
        if (prev) focusCell(prev);
    }
    function focusCell(cell) {
        activeCell = cell;
        highlightWord();
        const input = cell.querySelector('input');
        input.focus();
        input.select();
    }
    function getCell(row, col) {
        const cell = gridElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        return cell && cell.classList.contains('grid-cell') ? cell : null;
    }
});

function formatPuzzleName(v) { return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()); }
