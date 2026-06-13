/**
 * tools/rewrite-clues.js
 * Rewrites the generic placeholder clues in medical-database.js into real,
 * descriptive crossword clues. Answers are never changed.
 *
 *  - Reuses an existing good clue if the same answer already has one elsewhere.
 *  - Otherwise asks Gemini (local key from config.js) for a fresh clue.
 *  - Validates every new clue does NOT contain its answer.
 *  - Targeted text replacement (only the generic question strings change), so
 *    the rest of the file stays byte-identical.
 *
 * Usage:  node tools/rewrite-clues.js            (full run, writes the file)
 *         node tools/rewrite-clues.js --dry      (no write; prints samples)
 */
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'medical-database.js');
const DRY = process.argv.includes('--dry');

const src = fs.readFileSync(DB, 'utf8');
eval(src + ';global.D = medicalCrosswordData;');

// A clue is a "template" (generic filler) if the exact same question string is
// reused across 3+ different answers. Real, specific clues are essentially
// unique. This catches every templated family ("USMLE clue for X", "Mechanism
// linked to Y", etc.) without hand-listing them.
const _qToAnswers = new Map();
for (const cat in D) for (const diff in D[cat]) for (const e of D[cat][diff]) {
    const q = String(e.question || '');
    if (!_qToAnswers.has(q)) _qToAnswers.set(q, new Set());
    _qToAnswers.get(q).add(String(e.answer || '').toUpperCase());
}
const TEMPLATES = new Set([..._qToAnswers].filter(([, s]) => s.size >= 3).map(([q]) => q));
const GENERIC = { test: q => TEMPLATES.has(String(q)) };

const keyMatch = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8')
    .match(/GEMINI_API_KEY\s*=\s*['"]([^'"]+)['"]/);
if (!keyMatch) { console.error('No Gemini key in config.js'); process.exit(1); }
const KEY = keyMatch[1];

// ── Survey the database ───────────────────────────────────────────────────────
const goodByAns = new Map();     // answer -> an existing non-generic clue
const genCatCount = new Map();   // answer -> Map(category -> count)
for (const cat in D) for (const diff in D[cat]) for (const e of D[cat][diff]) {
    const a = String(e.answer || '').toUpperCase();
    const q = String(e.question || '');
    if (GENERIC.test(q)) {
        if (!genCatCount.has(a)) genCatCount.set(a, new Map());
        const m = genCatCount.get(a);
        m.set(cat, (m.get(cat) || 0) + 1);
    } else if (!goodByAns.has(a)) {
        goodByAns.set(a, q);
    }
}

const PRETTY_CAT = c => c.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
const genAnswers = [...genCatCount.keys()];
const needAI = genAnswers.filter(a => !goodByAns.has(a));
console.log(`generic answers: ${genAnswers.length} | reusable: ${genAnswers.length - needAI.length} | need AI: ${needAI.length}`);

// ── Validation: a clue must not reveal its answer ─────────────────────────────
function revealsAnswer(answer, clue) {
    const letters = clue.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.includes(answer)) return true;                 // whole answer hidden in clue
    const root = answer.slice(0, Math.max(4, Math.ceil(answer.length * 0.7)));
    return clue.toUpperCase().split(/[^A-Z]+/).some(w => w.startsWith(root) && root.length >= 4);
}
function cleanClue(s) {
    return String(s || '').replace(/["`]/g, '').replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
}
// Phrase-based filler detector for freshly generated clues (the TEMPLATES set
// only knows the original DB strings, so a new generic clue would slip through).
const FILLER = /(board fact|buzzword|board association|clinical clue|diagnosis treatment|subspecialty term|fellowship level|resident level|high yield|usmle clue|pathophysiology term|disease process|mechanism linked|presentation linked|clinical correlation|physiology concept|structure term|vocabulary item|key concept|foundational|important concept|key term)/i;
function acceptable(answer, clue) {
    if (!clue || clue.length < 8 || clue.length > 100) return false;
    if (GENERIC.test(clue) || FILLER.test(clue)) return false;
    if (revealsAnswer(answer, clue)) return false;
    return true;
}

// ── Gemini ────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function callGemini(prompt) {
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } }
    };
    // Retry with backoff on rate-limit (429) / transient (503) errors.
    for (let attempt = 0; attempt < 5; attempt++) {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
            body: JSON.stringify(body)
        });
        if (r.ok) {
            const d = await r.json();
            return d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
        }
        if (r.status === 429 || r.status === 503) { await sleep(15000 * (attempt + 1)); continue; }
        throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
    }
    throw new Error('rate-limited after retries');
}
function parseArray(text) {
    const t = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try { const p = JSON.parse(t); if (Array.isArray(p)) return p; } catch {}
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
}
async function generateBatch(items) {
    const list = items.map(it => `- ${it.a} (${PRETTY_CAT(it.cat)})`).join('\n');
    const prompt =
`You are an expert medical educator writing crossword clues for medical students.
For EACH term below, write ONE precise crossword clue.

Rules:
- 4 to 12 words. No period at the end.
- The clue must point unambiguously to that exact term — use its definition, function, classic clinical association, mechanism, or anatomical location.
- NEVER include the answer word, its plural, abbreviation, or word root in the clue.
- Prefer high-yield, exam-relevant facts over vague descriptions.

Return ONLY a JSON array, one object per term, in the same order:
[{"answer":"TERM","clue":"the clue"}]

Terms:
${list}`;
    const arr = parseArray(await callGemini(prompt));
    const out = new Map();
    for (const o of arr) {
        const a = String(o.answer || '').toUpperCase().replace(/[^A-Z]/g, '');
        const c = cleanClue(o.clue);
        if (a && acceptable(a, c)) out.set(a, c);
    }
    return out;
}

const CACHE = path.join(__dirname, 'clue-cache.json');

(async () => {
    const newClue = new Map();
    // 1) reuse existing good clues
    for (const a of genAnswers) if (goodByAns.has(a)) newClue.set(a, goodByAns.get(a));

    // 1b) reuse AI clues from a previous run (so re-runs don't re-call Gemini)
    let cache = {};
    if (fs.existsSync(CACHE)) {
        cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
        for (const [a, c] of Object.entries(cache)) if (acceptable(a, c)) newClue.set(a, c);
    }

    // 2) AI for the rest, in batches, with one retry pass for misses.
    //    --apply skips all API calls and just writes reuse + cache (resumable
    //    after the daily Gemini quota resets).
    const repCat = a => [...genCatCount.get(a).entries()].sort((x, y) => y[1] - x[1])[0][0];
    let pending = process.argv.includes('--apply') ? []
        : needAI.filter(a => !newClue.has(a)).map(a => ({ a, cat: repCat(a) }));
    console.log(`cached AI clues: ${needAI.length - needAI.filter(a => !newClue.has(a)).length} | to generate: ${pending.length}`);
    const BATCH = 24;
    for (let pass = 0; pass < 4 && pending.length; pass++) {
        const misses = [];
        for (let i = 0; i < pending.length; i += BATCH) {
            const batch = pending.slice(i, i + BATCH);
            try {
                const got = await generateBatch(batch);
                for (const it of batch) {
                    if (got.has(it.a)) { newClue.set(it.a, got.get(it.a)); cache[it.a] = got.get(it.a); }
                    else misses.push(it);
                }
                fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0)); // persist as we go
                process.stdout.write(`\rpass ${pass + 1}: ${newClue.size - (genAnswers.length - needAI.length)}/${needAI.length} AI clues`);
            } catch (e) {
                misses.push(...batch);
            }
            await sleep(4500); // stay under the free-tier rate limit (~15 RPM)
        }
        pending = misses;
    }
    console.log(`\nfilled ${newClue.size}/${genAnswers.length} generic answers (${pending.length} still unresolved — left unchanged)`);

    if (DRY) {
        console.log('\n--- sample rewrites ---');
        needAI.slice(0, 12).forEach(a => console.log(`${a.padEnd(16)} → ${newClue.get(a) || '(unchanged)'}`));
        return;
    }

    // 3) targeted text replacement — only generic question strings change
    let replaced = 0;
    const out = src.replace(/\{[^{}]*\}/g, (block) => {
        const am = block.match(/(?:"?answer"?)\s*:\s*"([^"]+)"/);
        const qm = block.match(/(?:"?question"?)\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!am || !qm || !GENERIC.test(qm[1])) return block;
        const a = am[1].toUpperCase();
        const nc = newClue.get(a);
        if (!nc || nc === qm[1]) return block;
        replaced++;
        return block.replace('"' + qm[1] + '"', '"' + nc + '"');
    });

    // sanity: file must still parse and answer count must be unchanged
    const reparsed = new Function(out + '\n;return medicalCrosswordData;')();
    const before = countAnswers(D), after = countAnswers(reparsed);
    if (after !== before) throw new Error(`answer count changed ${before} -> ${after}; aborting write`);
    fs.writeFileSync(DB, out);
    console.log(`replaced ${replaced} generic clues across ${before} entries. file rewritten.`);
})();

function countAnswers(d){let n=0;for(const c in d)for(const f in d[c])n+=d[c][f].length;return n;}
