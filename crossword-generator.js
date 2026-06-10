class CrosswordGenerator {
    constructor(database) {
        this.database = database;
        // Legacy fields – kept so processPlacedWordsIntoClues() works for both paths
        this.words    = [];
        this.grid     = [];
        this.solution = [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public entry point
    // ─────────────────────────────────────────────────────────────────────────

    generateCrossword(category, difficulty) {
        if (!this.database[category]) {
            throw new Error(`Unknown category: ${category}`);
        }

        // Phase-2: NYT-style symmetric grid with 100 % checked cells
        try {
            const nyt = this._nytGenerate(category, difficulty);
            if (nyt) return nyt;
        } catch (e) {
            console.warn('[CWG] NYT path failed:', e.message);
        }

        // Fallback: legacy word-by-word placement (always works)
        return this._legacyGenerate(category, difficulty);
    }

    // =========================================================================
    // NYT-STYLE GENERATION
    // =========================================================================

    _nytGenerate(category, difficulty) {
        const bank  = this._buildFullWordBank(category);
        if (bank.length < 20) return null;

        const byLen = this._indexByLength(bank);

        // Cap total NYT-path time to ~2 s so the browser never freezes.
        // Each CSP attempt gets at most 400 ms; we try at most 3 templates
        // per grid size.  If nothing solves in time, fall through to legacy.
        const GLOBAL_DEADLINE = Date.now() + 2000;

        for (const size of [11, 13, 10]) {
            for (let t = 0; t < 3; t++) {
                if (Date.now() > GLOBAL_DEADLINE) return null;

                const template = this._makeSymmetricTemplate(size);
                if (!template) continue;

                const slots = this._extractSlots(template);
                if (slots.length < 12) continue;
                if (!this._templateViable(slots, byLen)) continue;

                // Build slot map & crossing info
                const slotMap = {};
                for (const s of slots) slotMap[s.id] = s;
                this._buildCrossings(slots);

                // Per-slot candidate domains (fresh copy per attempt)
                const domains = {};
                for (const s of slots) {
                    domains[s.id] = [...(byLen[s.len] || [])];
                }

                const filled   = Array.from({ length: size }, () => Array(size).fill(null));
                const assigned = {};
                const used     = new Set();
                // Short per-attempt deadline so we fail fast and move on
                const deadline = Math.min(Date.now() + 400, GLOBAL_DEADLINE);

                const order = this._slotOrder(slots, domains);
                if (this._backtrack(0, order, slotMap, domains, filled, assigned, used, deadline)) {
                    return this._buildNYTResult(template, slots, assigned, size);
                }
            }
        }
        return null;
    }

    // ── Template generation ───────────────────────────────────────────────────

    /**
     * Builds a random size×size grid with 180° rotational symmetry and the
     * property that every run of white cells in every row and column has
     * length ≥ 3.  Returns null if MAX_TRIES attempts all fail.
     */
    _makeSymmetricTemplate(size) {
        const MAX_TRIES    = 300;
        const TARGET_FRAC  = 0.17; // ~17 % black cells
        const target       = Math.round(size * size * TARGET_FRAC / 2) * 2;

        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            const g = Array.from({ length: size }, () => Array(size).fill(0));

            // All symmetric cell pairs (we only need to choose the "top half")
            const pairs = [];
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const r2 = size - 1 - r;
                    const c2 = size - 1 - c;
                    if (r < r2 || (r === r2 && c < c2)) {
                        pairs.push([[r, c], [r2, c2]]);
                    } else if (r === r2 && c === c2) {
                        pairs.push([[r, c]]); // centre cell (odd-size grid)
                    }
                }
            }

            // Shuffle pairs for variety
            for (let i = pairs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
            }

            let placed = 0;
            for (const pair of pairs) {
                if (placed >= target) break;
                for (const [r, c] of pair) g[r][c] = 1;
                if (this._hasShortRun(g, size)) {
                    for (const [r, c] of pair) g[r][c] = 0; // revert
                } else {
                    placed += pair.length;
                }
            }

            // Accept even if we placed fewer blacks than target – the grid is
            // still valid (no short runs).
            if (!this._hasShortRun(g, size)) return g;
        }
        return null;
    }

    /** Returns true if any row or column contains a white run of length 1 or 2. */
    _hasShortRun(g, size) {
        // Rows
        for (let r = 0; r < size; r++) {
            let run = 0;
            for (let c = 0; c <= size; c++) {
                if (c < size && g[r][c] === 0) { run++; }
                else { if (run > 0 && run < 3) return true; run = 0; }
            }
        }
        // Columns
        for (let c = 0; c < size; c++) {
            let run = 0;
            for (let r = 0; r <= size; r++) {
                if (r < size && g[r][c] === 0) { run++; }
                else { if (run > 0 && run < 3) return true; run = 0; }
            }
        }
        return false;
    }

    // ── Slot extraction ───────────────────────────────────────────────────────

    _extractSlots(template) {
        const size  = template.length;
        const slots = [];
        let id = 0;

        // Across
        for (let r = 0; r < size; r++) {
            let c = 0;
            while (c < size) {
                if (template[r][c] === 0) {
                    const start = c;
                    while (c < size && template[r][c] === 0) c++;
                    const len = c - start;
                    if (len >= 3) {
                        slots.push({
                            id      : id++,
                            dir     : 'across',
                            row     : r,
                            col     : start,
                            len,
                            cells   : Array.from({ length: len }, (_, i) => ({ r, c: start + i })),
                            crossings: []
                        });
                    }
                } else c++;
            }
        }

        // Down
        for (let c = 0; c < size; c++) {
            let r = 0;
            while (r < size) {
                if (template[r][c] === 0) {
                    const start = r;
                    while (r < size && template[r][c] === 0) r++;
                    const len = r - start;
                    if (len >= 3) {
                        slots.push({
                            id      : id++,
                            dir     : 'down',
                            row     : start,
                            col     : c,
                            len,
                            cells   : Array.from({ length: len }, (_, i) => ({ r: start + i, c })),
                            crossings: []
                        });
                    }
                } else r++;
            }
        }

        return slots;
    }

    /** Populate slot.crossings: for every cell in a slot, record the intersecting slot. */
    _buildCrossings(slots) {
        const cellAcross = {};
        const cellDown   = {};
        for (const s of slots) {
            for (let i = 0; i < s.cells.length; i++) {
                const key = `${s.cells[i].r},${s.cells[i].c}`;
                if (s.dir === 'across') cellAcross[key] = { id: s.id, idx: i };
                else                    cellDown[key]   = { id: s.id, idx: i };
            }
        }
        for (const s of slots) {
            for (let i = 0; i < s.cells.length; i++) {
                const key   = `${s.cells[i].r},${s.cells[i].c}`;
                const cross = s.dir === 'across' ? cellDown[key] : cellAcross[key];
                if (cross) s.crossings.push({ myIdx: i, crossId: cross.id, crossIdx: cross.idx });
            }
        }
    }

    /** Quick check: for every slot length required, the bank has ≥ that many words. */
    _templateViable(slots, byLen) {
        const need = {};
        for (const s of slots) need[s.len] = (need[s.len] || 0) + 1;
        for (const [len, cnt] of Object.entries(need)) {
            if ((byLen[+len] || []).length < cnt) return false;
        }
        return true;
    }

    // ── CSP Solver ────────────────────────────────────────────────────────────

    /**
     * Order: most-constrained first (fewest candidates),
     * break ties by degree (most crossings → constrains others most).
     */
    _slotOrder(slots, domains) {
        return [...slots].sort((a, b) => {
            const da = (domains[a.id] || []).length;
            const db = (domains[b.id] || []).length;
            if (da !== db) return da - db;
            return b.crossings.length - a.crossings.length;
        });
    }

    _backtrack(depth, order, slotMap, domains, filled, assigned, used, deadline) {
        if (Date.now() > deadline) return false;
        if (depth === order.length) return true;

        const slot = order[depth];

        // Slot already assigned at a higher level? (shouldn't happen, but guard)
        if (assigned[slot.id]) {
            return this._backtrack(depth + 1, order, slotMap, domains, filled, assigned, used, deadline);
        }

        const candidates = this._getCandidates(slot, domains[slot.id], filled, used);

        for (const cand of candidates) {
            // ── Place word ──────────────────────────────────────────────────
            for (let i = 0; i < slot.cells.length; i++) {
                const { r, c } = slot.cells[i];
                filled[r][c] = cand.word[i];
            }
            assigned[slot.id] = cand;
            used.add(cand.word);

            // ── Forward checking: prune crossing slot domains ───────────────
            const saved = {}; // slotId → previous domain array
            let ok = true;

            for (const cross of slot.crossings) {
                if (assigned[cross.crossId]) continue; // already locked in
                if (!saved[cross.crossId]) {
                    saved[cross.crossId] = domains[cross.crossId];
                }
                const letter   = cand.word[cross.myIdx];
                const crossIdx = cross.crossIdx;
                domains[cross.crossId] = domains[cross.crossId].filter(
                    w => !used.has(w.word) && w.word[crossIdx] === letter
                );
                if (domains[cross.crossId].length === 0) { ok = false; break; }
            }

            // ── Recurse ─────────────────────────────────────────────────────
            if (ok && this._backtrack(depth + 1, order, slotMap, domains, filled, assigned, used, deadline)) {
                return true; // ✓ solution found
            }

            // ── Undo ────────────────────────────────────────────────────────
            for (let i = 0; i < slot.cells.length; i++) {
                const { r, c } = slot.cells[i];
                filled[r][c] = null;
            }
            delete assigned[slot.id];
            used.delete(cand.word);
            for (const [id, dom] of Object.entries(saved)) {
                domains[id] = dom;
            }
        }

        return false; // no candidate worked → backtrack
    }

    _getCandidates(slot, pool, filled, used) {
        const out = [];
        for (const entry of pool) {
            if (used.has(entry.word)) continue;
            let ok = true;
            for (let i = 0; i < slot.cells.length; i++) {
                const ex = filled[slot.cells[i].r][slot.cells[i].c];
                if (ex && ex !== entry.word[i]) { ok = false; break; }
            }
            if (ok) out.push(entry);
        }
        // Shuffle so repeated attempts pick different words
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    // ── Build final result ────────────────────────────────────────────────────

    _buildNYTResult(template, slots, assigned, size) {
        const grid     = Array.from({ length: size }, () => Array(size).fill(0));
        const solution = Array.from({ length: size }, () => Array(size).fill(''));

        for (const slot of slots) {
            const cand = assigned[slot.id];
            if (!cand) continue;
            for (let i = 0; i < slot.cells.length; i++) {
                const { r, c } = slot.cells[i];
                grid[r][c]     = 1;
                solution[r][c] = cand.word[i];
            }
        }

        // Populate this.words so processPlacedWordsIntoClues() works
        this.grid     = grid;
        this.solution = solution;
        this.words    = slots
            .filter(s => assigned[s.id])
            .map(s => ({
                word     : assigned[s.id].word,
                row      : s.row,
                col      : s.col,
                direction: s.dir,
                clue     : assigned[s.id].clue
            }));

        const clues       = this.processPlacedWordsIntoClues();
        const whiteCells  = grid.flat().filter(v => v === 1).length;
        const checked     = this._checkedCellCount(slots, assigned);

        return {
            grid,
            solution,
            clues,
            rows : size,
            cols : size,
            stats: {
                wordsPlaced : this.words.length,
                totalWords  : slots.length,
                compactness : Math.round((whiteCells / (size * size)) * 100),
                intersections: checked,
                checkedPct  : Math.round((checked / Math.max(whiteCells, 1)) * 100),
                nytStyle    : true
            }
        };
    }

    _checkedCellCount(slots, assigned) {
        const counts = {};
        for (const s of slots) {
            if (!assigned[s.id]) continue;
            for (const { r, c } of s.cells) {
                const key = `${r},${c}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        }
        return Object.values(counts).filter(v => v >= 2).length;
    }

    // ── Word-bank helpers ─────────────────────────────────────────────────────

    /** All usable words in a category across every difficulty level. */
    _buildFullWordBank(category) {
        const DIFFS = ['m1', 'm2', 'clinical', 'usmle', 'residency'];
        const seen  = new Set();
        const bank  = [];
        for (const diff of DIFFS) {
            for (const entry of (this.database[category]?.[diff] || [])) {
                const word = entry.answer.replace(/[^a-z0-9]/gi, '').toUpperCase();
                if (word.length >= 3 && word.length <= 13 && !seen.has(word)) {
                    seen.add(word);
                    bank.push({ word, clue: entry.question, difficulty: diff });
                }
            }
        }
        return bank;
    }

    _indexByLength(bank) {
        const idx = {};
        for (const e of bank) {
            if (!idx[e.word.length]) idx[e.word.length] = [];
            idx[e.word.length].push(e);
        }
        return idx;
    }

    // =========================================================================
    // LEGACY GENERATION  — upgraded: full-bank, compact 20×20 canvas
    // =========================================================================

    _legacyGenerate(category, difficulty) {
        if (!this.database[category]) {
            throw new Error(`Unknown category: ${category}`);
        }

        // Use the full word bank (all difficulty tiers) so the placement
        // algorithm has the richest possible pool to draw from.
        const fullBank = this._buildFullWordBank(category);
        if (!fullBank.length) throw new Error(`No words for: ${category}`);

        // Convert to the legacy {answer, question} format that selectWords() expects.
        const wordBank = fullBank.map(e => ({ answer: e.word, question: e.clue }));

        // Fixed compact canvas — produces ~20×20 square grids instead of
        // the old variable 29×33 layouts.
        const CANVAS = 20;

        let bestResult = null;
        let bestScore  = -1;
        const MAX_ATTEMPTS = 8;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            this.grid     = Array.from({ length: CANVAS }, () => Array(CANVAS).fill(0));
            this.solution = Array.from({ length: CANVAS }, () => Array(CANVAS).fill(''));
            this.words    = [];

            let selectedWords = this.selectWords(wordBank, CANVAS);
            if (attempt > 0) selectedWords = this.shuffleKeepingFirst(selectedWords);

            this.placeWords(selectedWords);
            this.cropGrid();

            const totalWords     = selectedWords.length;
            const placedWords    = this.words.length;
            const placementRatio = placedWords / Math.max(totalWords, 1);

            let filledCells = 0;
            const totalCells = this.grid.length * (this.grid[0] ? this.grid[0].length : 1);
            for (const row of this.grid) for (const cell of row) if (cell === 1) filledCells++;
            const compactness   = filledCells / Math.max(totalCells, 1);
            const intersections = this.countIntersections();
            const interlock     = intersections / Math.max(placedWords, 1);

            // Reward nearly-square grids (closer to NYT aesthetic)
            const rows       = this.grid.length;
            const cols       = this.grid[0] ? this.grid[0].length : 1;
            const squareness = Math.min(rows, cols) / Math.max(rows, cols);

            const score = (placementRatio * 100) + (interlock * 70) +
                          (compactness * 30) + (squareness * 20);

            if (score > bestScore) {
                bestScore  = score;
                bestResult = {
                    grid        : this.grid.map(r => [...r]),
                    solution    : this.solution.map(r => [...r]),
                    words       : [...this.words],
                    placedWords,
                    totalWords,
                    compactness : Math.round(compactness * 100),
                    intersections
                };
            }

            if (placementRatio >= 0.9 && interlock >= 0.8 && compactness > 0.12) break;
        }

        this.grid     = bestResult.grid;
        this.solution = bestResult.solution;
        this.words    = bestResult.words;

        // Pad to a square bounding box (looks more like a real crossword)
        this._squareGrid();

        // Compute checked-cell percentage (cells shared by across & down)
        const checkedPct = this._legacyCheckedPct();

        return {
            grid    : this.grid,
            solution: this.solution,
            clues   : this.processPlacedWordsIntoClues(),
            rows    : this.grid.length,
            cols    : this.grid[0].length,
            stats   : {
                wordsPlaced  : bestResult.placedWords,
                totalWords   : bestResult.totalWords,
                compactness  : bestResult.compactness,
                intersections: bestResult.intersections,
                checkedPct,
                nytStyle     : false
            }
        };
    }

    /**
     * Pad the cropped grid with black cells so rows === cols.
     * Words are re-centred; their row/col offsets are updated.
     */
    _squareGrid() {
        const rows = this.grid.length;
        const cols = this.grid[0] ? this.grid[0].length : 0;
        if (rows === cols) return;

        const size  = Math.max(rows, cols);
        const rOff  = Math.floor((size - rows) / 2);
        const cOff  = Math.floor((size - cols) / 2);

        const newGrid = Array.from({ length: size }, () => Array(size).fill(0));
        const newSol  = Array.from({ length: size }, () => Array(size).fill(''));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                newGrid[r + rOff][c + cOff] = this.grid[r][c];
                newSol [r + rOff][c + cOff] = this.solution[r][c];
            }
        }

        for (const word of this.words) { word.row += rOff; word.col += cOff; }

        this.grid     = newGrid;
        this.solution = newSol;
    }

    /** Fraction of letter cells shared by both an across and a down word. */
    _legacyCheckedPct() {
        const dir = {};
        for (const w of this.words) {
            for (let i = 0; i < w.word.length; i++) {
                const r   = w.direction === 'across' ? w.row     : w.row + i;
                const c   = w.direction === 'across' ? w.col + i : w.col;
                const key = `${r},${c}`;
                if (!dir[key]) dir[key] = { across: 0, down: 0 };
                dir[key][w.direction]++;
            }
        }
        const total   = Object.keys(dir).length;
        const checked = Object.values(dir).filter(v => v.across > 0 && v.down > 0).length;
        return Math.round((checked / Math.max(total, 1)) * 100);
    }

    shuffleKeepingFirst(arr) {
        if (arr.length <= 1) return arr;
        const first = arr[0];
        const rest  = arr.slice(1);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        return [first, ...rest];
    }

    _buildWordBank(category, difficulty) {
        const MAX_WORD_LEN = 15;
        const DIFF_ORDER   = ['residency', 'usmle', 'clinical', 'm2', 'm1'];

        const isUsable = w => {
            const len = w.answer.replace(/[^a-z0-9]/gi, '').length;
            return len > 1 && len <= MAX_WORD_LEN;
        };

        const usable = (this.database[category][difficulty] || []).filter(isUsable);
        if (usable.length >= 5) return usable;

        const seen  = new Set(usable.map(w => w.answer.replace(/[^a-z0-9]/gi, '').toUpperCase()));
        const myIdx = DIFF_ORDER.indexOf(difficulty);
        for (let di = myIdx + 1; di < DIFF_ORDER.length && usable.length < 7; di++) {
            for (const w of (this.database[category][DIFF_ORDER[di]] || [])) {
                if (!isUsable(w)) continue;
                const key = w.answer.replace(/[^a-z0-9]/gi, '').toUpperCase();
                if (!seen.has(key)) { usable.push(w); seen.add(key); if (usable.length >= 7) break; }
            }
        }
        return usable;
    }

    selectWords(wordBank, size) {
        return wordBank
            .map(item => ({
                word: item.answer.replace(/[^a-z0-9]/gi, '').toUpperCase(),
                clue: item.question
            }))
            .filter(item => item.word.length > 1 && item.word.length <= size)
            .sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
    }

    placeWords(wordList) {
        if (wordList.length === 0) return;
        const first = wordList[0];
        const row   = Math.floor(this.grid.length / 2);
        const col   = Math.floor((this.grid[0].length - first.word.length) / 2);
        this.placeWord(first.word, row, col, 'across', first.clue);

        let remaining = wordList.slice(1);
        let progress  = true;
        while (progress && remaining.length > 0) {
            progress = false;
            const stillRemaining = [];
            for (const item of remaining) {
                if (this.tryPlaceConnectedWord(item.word, item.clue)) progress = true;
                else stillRemaining.push(item);
            }
            remaining = stillRemaining;
        }
    }

    countIntersections() {
        const counts = {};
        for (const w of this.words) {
            for (let i = 0; i < w.word.length; i++) {
                const r   = w.direction === 'across' ? w.row     : w.row + i;
                const c   = w.direction === 'across' ? w.col + i : w.col;
                const key = `${r},${c}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        }
        let intersections = 0;
        for (const key in counts) if (counts[key] >= 2) intersections++;
        return intersections;
    }

    tryPlaceConnectedWord(word, clue) {
        const candidates = [];
        for (let wordIndex = 0; wordIndex < word.length; wordIndex++) {
            for (const placedWord of this.words) {
                for (let placedIndex = 0; placedIndex < placedWord.word.length; placedIndex++) {
                    if (word[wordIndex] !== placedWord.word[placedIndex]) continue;
                    const direction = placedWord.direction === 'across' ? 'down' : 'across';
                    const row = placedWord.direction === 'across'
                        ? placedWord.row - wordIndex
                        : placedWord.row + placedIndex;
                    const col = placedWord.direction === 'across'
                        ? placedWord.col + placedIndex
                        : placedWord.col - wordIndex;
                    if (this.canPlaceWord(word, row, col, direction)) {
                        candidates.push({ word, clue, row, col, direction,
                            score: this.calculateFitScore(word, row, col, direction) });
                    }
                }
            }
        }
        if (candidates.length === 0) return false;
        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.row   !== b.row)   return a.row   - b.row;
            if (a.col   !== b.col)   return a.col   - b.col;
            return a.direction.localeCompare(b.direction);
        });
        const best = candidates[0];
        this.placeWord(best.word, best.row, best.col, best.direction, best.clue);
        return true;
    }

    tryPlaceStandaloneWord(word, clue) {
        for (const direction of ['across', 'down']) {
            for (let row = 0; row < this.grid.length; row++) {
                for (let col = 0; col < this.grid[row].length; col++) {
                    if (this.canPlaceWord(word, row, col, direction)) {
                        this.placeWord(word, row, col, direction, clue);
                        return true;
                    }
                }
            }
        }
        console.warn(`Could not place word: ${word}`);
        return false;
    }

    placeWord(word, row, col, direction, clue) {
        for (let i = 0; i < word.length; i++) {
            const r = direction === 'across' ? row     : row + i;
            const c = direction === 'across' ? col + i : col;
            this.grid[r][c]     = 1;
            this.solution[r][c] = word[i];
        }
        this.words.push({ word, row, col, direction, clue });
    }

    calculateFitScore(word, row, col, direction) {
        let score = 0;
        for (let i = 0; i < word.length; i++) {
            const r = direction === 'across' ? row     : row + i;
            const c = direction === 'across' ? col + i : col;
            if (this.solution[r][c] === word[i]) score++;
        }
        return score;
    }

    canPlaceWord(word, row, col, direction) {
        const endRow = direction === 'across' ? row              : row + word.length - 1;
        const endCol = direction === 'across' ? col + word.length - 1 : col;
        if (!this.isInside(row, col) || !this.isInside(endRow, endCol)) return false;

        const beforeRow = direction === 'across' ? row       : row - 1;
        const beforeCol = direction === 'across' ? col - 1   : col;
        const afterRow  = direction === 'across' ? row       : endRow + 1;
        const afterCol  = direction === 'across' ? endCol + 1: col;
        if (this.isFilled(beforeRow, beforeCol) || this.isFilled(afterRow, afterCol)) return false;

        for (let i = 0; i < word.length; i++) {
            const r        = direction === 'across' ? row     : row + i;
            const c        = direction === 'across' ? col + i : col;
            const existing = this.solution[r][c];
            if (existing && existing !== word[i]) return false;
            if (!existing) {
                if (direction === 'across' && (this.isFilled(r - 1, c) || this.isFilled(r + 1, c))) return false;
                if (direction === 'down'   && (this.isFilled(r, c - 1) || this.isFilled(r, c + 1))) return false;
            }
        }
        return true;
    }

    isInside(row, col) {
        return row >= 0 && row < this.grid.length && col >= 0 && col < this.grid[0].length;
    }

    isFilled(row, col) {
        return this.isInside(row, col) && this.grid[row][col] === 1;
    }

    processPlacedWordsIntoClues() {
        let clueCounter = 1;
        const numberedLocations = {};
        const acrossClues = [];
        const downClues   = [];
        const sortedWords = [...this.words].sort((a, b) => {
            if (a.row !== b.row) return a.row - b.row;
            if (a.col !== b.col) return a.col - b.col;
            return a.direction.localeCompare(b.direction);
        });

        for (const word of sortedWords) {
            const key = `${word.row},${word.col}`;
            if (!numberedLocations[key]) numberedLocations[key] = clueCounter++;
            const clueObject = {
                number   : numberedLocations[key],
                clue     : word.clue,
                direction: word.direction,
                row      : word.row,
                col      : word.col,
                answer   : word.word
            };
            if (word.direction === 'across') acrossClues.push(clueObject);
            else                             downClues.push(clueObject);
        }

        return {
            across: acrossClues.sort((a, b) => a.number - b.number),
            down  : downClues.sort((a, b)   => a.number - b.number)
        };
    }

    cropGrid() {
        if (this.words.length === 0) return;
        let minRow = this.grid.length,    maxRow = 0;
        let minCol = this.grid[0].length, maxCol = 0;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[r].length; c++) {
                if (this.grid[r][c] === 1) {
                    if (r < minRow) minRow = r;
                    if (r > maxRow) maxRow = r;
                    if (c < minCol) minCol = c;
                    if (c > maxCol) maxCol = c;
                }
            }
        }

        minRow = Math.max(0, minRow - 1);
        maxRow = Math.min(this.grid.length    - 1, maxRow + 1);
        minCol = Math.max(0, minCol - 1);
        maxCol = Math.min(this.grid[0].length - 1, maxCol + 1);

        const newGrid     = [];
        const newSolution = [];
        for (let r = minRow; r <= maxRow; r++) {
            newGrid.push(this.grid[r].slice(minCol, maxCol + 1));
            newSolution.push(this.solution[r].slice(minCol, maxCol + 1));
        }
        this.grid     = newGrid;
        this.solution = newSolution;
        for (const word of this.words) { word.row -= minRow; word.col -= minCol; }
    }
}
