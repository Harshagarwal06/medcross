/**
 * MedCrossValidation
 * Lightweight puzzle and entry validation for browser runtime and Node tests.
 */
(function initMedCrossValidation(root) {
    function normalizeAnswer(value) {
        return String(value || '').replace(/[^a-z]/gi, '').toUpperCase();
    }

    function compactText(value) {
        return String(value || '').replace(/[^a-z]/gi, '').toUpperCase();
    }

    function add(warnings, code, message, severity = 'warning', meta = {}) {
        warnings.push({ code, message, severity, ...meta });
    }

    function answerLeaksIntoClue(answer, clue) {
        const cleanAnswer = normalizeAnswer(answer);
        if (cleanAnswer.length < 3) return false;
        const cleanClue = compactText(clue);
        if (!cleanClue) return false;
        const spaced = new RegExp(cleanAnswer.split('').join('\\s*'), 'i');
        return spaced.test(cleanClue);
    }

    function clueCells(clue) {
        const cells = [];
        const len = normalizeAnswer(clue.answer).length;
        for (let i = 0; i < len; i++) {
            cells.push({
                row: Number(clue.row) + (clue.direction === 'down' ? i : 0),
                col: Number(clue.col) + (clue.direction === 'across' ? i : 0)
            });
        }
        return cells;
    }

    function validateEntries(entries, options = {}) {
        const warnings = [];
        const seen = new Set();
        let usable = 0;

        for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
            const answer = normalizeAnswer(entry && (entry.answer || entry.word));
            const clue = String(entry && (entry.question || entry.clue) || '').trim();

            if (answer.length < (options.minAnswerLength || 3)) {
                add(warnings, 'short-answer', 'Entry answer is too short to use in a crossword.', 'error', { index });
                continue;
            }
            if (answer.length > (options.maxAnswerLength || 15)) {
                add(warnings, 'long-answer', 'Entry answer is too long for the current generator.', 'warning', { index, answer });
                continue;
            }
            if (!clue) {
                add(warnings, 'empty-clue', 'Entry is missing a crossword clue.', 'error', { index, answer });
                continue;
            }
            if (seen.has(answer)) {
                add(warnings, 'duplicate-answer', 'Entry repeats an answer already in the word bank.', 'warning', { index, answer });
                continue;
            }
            if (answerLeaksIntoClue(answer, clue)) {
                add(warnings, 'answer-in-clue', 'Entry clue appears to contain the answer.', 'warning', { index, answer });
            }
            seen.add(answer);
            usable++;
        }

        return {
            valid: !warnings.some(w => w.severity === 'error'),
            warnings,
            stats: { total: Array.isArray(entries) ? entries.length : 0, usable, uniqueAnswers: seen.size }
        };
    }

    function validatePuzzle(puzzleData, options = {}) {
        const warnings = [];
        const stats = {
            rows: 0,
            cols: 0,
            letterCells: 0,
            clueCount: 0,
            checkedCells: 0,
            checkedPct: 0,
            duplicateAnswers: 0,
            emptyClues: 0,
            answerLeaks: 0,
            curatedFallback: Boolean(puzzleData && puzzleData.stats && puzzleData.stats.curatedFallback)
        };

        if (!puzzleData || !Array.isArray(puzzleData.grid) || !Array.isArray(puzzleData.solution)) {
            add(warnings, 'missing-grid', 'Puzzle is missing a grid or solution.', 'error');
            return { valid: false, warnings, stats };
        }

        stats.rows = puzzleData.grid.length;
        stats.cols = puzzleData.grid[0] ? puzzleData.grid[0].length : 0;
        if (!stats.rows || !stats.cols) {
            add(warnings, 'empty-grid', 'Puzzle grid has no playable cells.', 'error');
            return { valid: false, warnings, stats };
        }

        for (let r = 0; r < stats.rows; r++) {
            if (!Array.isArray(puzzleData.grid[r]) || puzzleData.grid[r].length !== stats.cols) {
                add(warnings, 'ragged-grid', 'Puzzle grid rows are not the same width.', 'error', { row: r });
            }
            if (!Array.isArray(puzzleData.solution[r]) || puzzleData.solution[r].length !== stats.cols) {
                add(warnings, 'ragged-solution', 'Puzzle solution rows do not match the grid width.', 'error', { row: r });
            }
            for (let c = 0; c < stats.cols; c++) {
                if (puzzleData.grid[r] && puzzleData.grid[r][c] === 1) stats.letterCells++;
            }
        }

        const across = Array.isArray(puzzleData.clues && puzzleData.clues.across) ? puzzleData.clues.across : [];
        const down = Array.isArray(puzzleData.clues && puzzleData.clues.down) ? puzzleData.clues.down : [];
        const clues = [...across, ...down];
        stats.clueCount = clues.length;
        if (!stats.clueCount) add(warnings, 'missing-clues', 'Puzzle has no clue list.', 'error');

        const answerCounts = {};
        const usage = {};

        for (const clue of clues) {
            const answer = normalizeAnswer(clue.answer);
            const clueText = String(clue.clue || '').trim();
            const clueId = `${clue.direction}:${clue.row},${clue.col}:${answer || '?'}`;

            if (!answer) add(warnings, 'missing-answer', 'A clue is missing its answer.', 'error', { clue: clueId });
            if (!clueText) {
                stats.emptyClues++;
                add(warnings, 'empty-clue', 'A clue has no clue text.', 'error', { clue: clueId });
            }
            if (answerLeaksIntoClue(answer, clueText)) {
                stats.answerLeaks++;
                add(warnings, 'answer-in-clue', 'A clue appears to contain its answer.', 'warning', { clue: clueId, answer });
            }
            if (answer) answerCounts[answer] = (answerCounts[answer] || 0) + 1;

            for (const cell of clueCells(clue)) {
                const inBounds = cell.row >= 0 && cell.row < stats.rows && cell.col >= 0 && cell.col < stats.cols;
                if (!inBounds) {
                    add(warnings, 'clue-out-of-bounds', 'A clue extends outside the puzzle grid.', 'error', { clue: clueId });
                    continue;
                }
                if (puzzleData.grid[cell.row][cell.col] !== 1) {
                    add(warnings, 'clue-on-black-cell', 'A clue crosses a black cell.', 'error', { clue: clueId, row: cell.row, col: cell.col });
                    continue;
                }
                const key = `${cell.row},${cell.col}`;
                if (!usage[key]) usage[key] = { across: 0, down: 0 };
                usage[key][clue.direction] += 1;
            }
        }

        stats.duplicateAnswers = Object.values(answerCounts).filter(count => count > 1).length;
        if (stats.duplicateAnswers) {
            add(warnings, 'duplicate-answer', 'Puzzle repeats one or more answers.', 'warning', { count: stats.duplicateAnswers });
        }

        stats.checkedCells = Object.values(usage).filter(v => v.across > 0 && v.down > 0).length;
        stats.checkedPct = Math.round((stats.checkedCells / Math.max(stats.letterCells, 1)) * 100);
        const minimumCheckedPct = options.minimumCheckedPct ?? (puzzleData.mini ? 40 : 30);
        if (stats.checkedPct < minimumCheckedPct) {
            add(warnings, 'low-checked-pct', `Only ${stats.checkedPct}% of playable cells are checked.`, 'warning', {
                checkedPct: stats.checkedPct,
                minimumCheckedPct
            });
        }

        if (stats.curatedFallback) {
            add(warnings, 'curated-fallback', 'Puzzle used the curated fallback grid.', 'info');
        }

        return {
            valid: !warnings.some(w => w.severity === 'error'),
            warnings,
            stats
        };
    }

    const api = { normalizeAnswer, answerLeaksIntoClue, validateEntries, validatePuzzle };
    root.MedCrossValidation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
