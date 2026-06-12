/**
 * gemini.js — MedCross × Google Gemini AI Integration
 *
 * HOW TO ACTIVATE:
 *   1. Copy config.example.js to config.js and paste your Google AI Studio key.
 *   2. Reload — AI features appear automatically on the puzzle page.
 *
 * Features:
 *   AI Explain — explains the selected clue's medical concept in plain English
 *   AI Hint    — nudges you toward the answer without revealing it
 *   Learn      — post-puzzle learning notes for every term you solved
 */

// Key is supplied by config.js (gitignored) — see config.example.js.
const GEMINI_API_KEY = window.GEMINI_API_KEY || 'YOUR_KEY_HERE';
const GEMINI_PROXY_URL = window.MEDCROSS_AI_PROXY_URL || '';

// Try current models in order — gemini-1.5-* is retired and now 404s.
const _GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
let _geminiModel = _GEMINI_MODELS[0];

// ── Core API call (with automatic model fallback) ────────────────────────────
async function _callGemini(prompt, maxTokens = 280) {
    if (GEMINI_PROXY_URL) {
        return _callGeminiProxy(prompt, maxTokens);
    }

    let lastError = null;
    const startIdx = _GEMINI_MODELS.indexOf(_geminiModel);
    for (let i = startIdx; i < _GEMINI_MODELS.length; i++) {
        const model = _GEMINI_MODELS[i];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const generationConfig = {
            // Generous budget so answers never get clipped mid-sentence.
            maxOutputTokens: Math.max(maxTokens * 4, 1024),
            temperature: 0.65
        };
        // 2.5 models "think" by default and the thinking tokens eat the output
        // budget, causing empty/truncated replies — turn thinking off.
        if (model.startsWith('gemini-2.5')) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig
            })
        });
        if (res.ok) {
            _geminiModel = model; // remember the working model
            const data = await res.json();
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
            if (text) {
                return candidate.finishReason === 'MAX_TOKENS' ? `${text}…` : text;
            }
            lastError = new Error(
                candidate?.finishReason === 'MAX_TOKENS'
                    ? 'Response was cut off — please try again.'
                    : 'No response received.'
            );
            continue; // try the next model
        }
        const err = await res.json().catch(() => ({}));
        lastError = new Error(err.error?.message || `Gemini API error ${res.status}`);
        // Only fall through to the next model when this one isn't available.
        if (res.status !== 404 && res.status !== 400) break;
    }
    throw lastError || new Error('Gemini API request failed.');
}

async function _callGeminiProxy(prompt, maxTokens) {
    const res = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens, source: 'medcross' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || data.message || `AI proxy error ${res.status}`);
    }
    const text = typeof data === 'string'
        ? data
        : data.text || data.output || data.content || data.choices?.[0]?.message?.content || '';
    if (!String(text).trim()) throw new Error('No response received from AI proxy.');
    return String(text).trim();
}

// ── Public AI helpers ─────────────────────────────────────────────────────────
const MedAI = {

    isConfigured() {
        return Boolean(GEMINI_PROXY_URL) || (GEMINI_API_KEY !== 'YOUR_KEY_HERE' && GEMINI_API_KEY.length > 10);
    },

    /** Explain a clue's medical concept in plain English.
     *  `word` = { letters, length, complete } for the active grid word, so the
     *  explanation never spoils an unsolved answer. */
    async explainClue(clueText, category, word = {}) {
        const prompt = word.complete
            ? `You are a medical education assistant. A student just solved a medical crossword clue.

Clue: "${clueText}"
Answer: "${word.letters}"
Category: ${category || 'medicine'}

Explain this medical term in 2-3 clear, complete sentences. Cover: what it is, its clinical significance, and one memorable fact. Be concise and educational. Do not mention it is a crossword clue.`
            : `You are a medical education assistant helping a student solve a medical crossword. The student has NOT solved this clue yet.

Clue: "${clueText}"
Category: ${category || 'medicine'}${word.length ? `\nThe answer is ${word.length} letters long.` : ''}

Explain the underlying medical concept in 2-3 clear, complete sentences so the student can work out the answer themselves.

STRICT RULES:
- NEVER state, spell, abbreviate, or hint at the answer word itself — refer to it only as "the answer".
- Do not use words sharing the answer's root or etymology.
- End with a complete sentence.`;
        return _callGemini(prompt, 300);
    },

    /** Give a soft hint without revealing the answer */
    async hintForClue(clueText, knownLetters, category) {
        const lettersHint = knownLetters ? `\nKnown letters so far: ${knownLetters}` : '';
        const prompt =
            `You are helping a medical student solve a crossword WITHOUT revealing the answer directly.

Clue: "${clueText}"
Category: ${category || 'medicine'}${lettersHint}

Give ONE helpful nudge (1-2 sentences) that guides them toward the answer without stating it. Focus on a memorable clinical association or word etymology.`;
        return _callGemini(prompt, 150);
    },

    /** Batch learning note for all terms solved post-puzzle (up to 5) */
    async learnBatch(terms) {
        const list = terms.slice(0, 5)
            .map((t, i) => `${i + 1}. "${t.answer}" — clue: "${t.clue}"`)
            .join('\n');
        const category = terms[0]?.category || 'medicine';
        const prompt =
            `You are a medical education AI summarising what a student just learned in a crossword puzzle (category: ${category}).

Terms solved:
${list}

For EACH term write ONE sentence covering its core clinical meaning. Format as a numbered list matching the numbering above. Be brief and educational.`;
        return _callGemini(prompt, 400);
    },

    async extractPuzzleTermsFromNotes(notesText) {
        const prompt =
            `Extract crossword-ready medical vocabulary from these study notes.

Return ONLY valid JSON: an array of objects with "answer" and "question".
Rules:
- 15 to 30 items.
- answer must be one medical term, letters only after normalization, 3-15 letters.
- question must be a concise crossword clue and must not include the answer.
- Prefer high-yield clinical, anatomy, physiology, pathology, and pharmacology terms.

Notes:
${notesText.slice(0, 12000)}`;
        const text = await _callGemini(prompt, 1800);
        const jsonText = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            const match = jsonText.match(/\[[\s\S]*\]/);
            parsed = match ? JSON.parse(match[0]) : null;
        }
        if (!Array.isArray(parsed)) throw new Error('Gemini did not return usable term data.');
        const seen = new Set();
        const clean = [];
        for (const item of parsed) {
            const answer = String(item.answer || '').replace(/[^a-z]/gi, '').toUpperCase();
            const question = String(item.question || '').trim();
            if (answer.length < 3 || answer.length > 15 || !question || seen.has(answer)) continue;
            if (question.toUpperCase().includes(answer)) continue;
            seen.add(answer);
            clean.push({ answer, question });
        }
        if (clean.length < 5) throw new Error('Not enough usable crossword terms were found. Try pasting more detailed notes.');
        return clean.slice(0, 30);
    },

    async generateTopicPuzzleEntries(topic, apiEntries = []) {
        const apiList = apiEntries.slice(0, 20)
            .map((entry, i) => `${i + 1}. ${entry.answer} — ${entry.question}`)
            .join('\n') || 'No useful API terms were found.';
        const prompt =
            `Create a high-quality medical crossword word bank for this topic: "${topic}".

Use the API terms below when they are relevant, and add other high-yield medical terms needed to make a good crossword.

API terms:
${apiList}

Return ONLY valid JSON: an array of objects with "answer" and "question".
Rules:
- 18 to 30 items.
- answer must be one medical term, letters only after normalization, 3-15 letters.
- question must be a concise crossword clue and must NOT contain the answer.
- Prefer medically meaningful terms, not filler words, dosage units, or generic words.
- Include a balanced mix of diseases, anatomy, physiology, symptoms, drugs, tests, and mechanisms when relevant.`;

        const text = await _callGemini(prompt, 1800);
        const parsed = _parseJsonArray(text);
        return _cleanPuzzleEntries(parsed, 'Gemini did not return enough usable topic terms.');
    },

    async socraticHint({ clueText, category, knownLetters, stage = 1, answerLength = 0 }) {
        const stageLabels = {
            1: 'Ask one concept-check question that helps the student identify the topic.',
            2: 'Give one clinical association or mechanism clue.',
            3: 'Give one stronger word-pattern or differential clue, but do not state the answer.'
        };
        const prompt =
            `You are a Socratic medical crossword tutor. Do not reveal the answer.

Clue: "${clueText}"
Category: ${category || 'medicine'}
Known letters: ${knownLetters || 'none'}
Answer length: ${answerLength || 'unknown'}
Stage ${stage}: ${stageLabels[stage] || stageLabels[1]}

Write 1-2 short sentences. Never state, spell, abbreviate, or directly define the answer.`;
        return _callGemini(prompt, 180);
    },

    async flashcardExplain(term, clue, category) {
        const prompt =
            `Explain this medical flashcard in 2 concise sentences.

Term: ${term}
Clue: ${clue || 'not provided'}
Category: ${category || 'medicine'}

Cover what it means and one high-yield clinical association.`;
        return _callGemini(prompt, 220);
    }
};

window.MedAI = MedAI;

function _parseJsonArray(text) {
    const jsonText = String(text || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
    const match = jsonText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('AI did not return usable JSON.');
    return JSON.parse(match[0]);
}

function _cleanPuzzleEntries(items, emptyMessage) {
    if (!Array.isArray(items)) throw new Error('AI did not return usable term data.');
    const seen = new Set();
    const clean = [];
    for (const item of items) {
        const answer = String(item.answer || item.word || '').replace(/[^a-z]/gi, '').toUpperCase();
        const question = String(item.question || item.clue || '').trim();
        if (answer.length < 3 || answer.length > 15 || !question || seen.has(answer)) continue;
        const compactQuestion = question.replace(/[^a-z]/gi, '').toUpperCase();
        const answerRegex = new RegExp(answer.split('').join('\\s*'), 'i');
        if (answerRegex.test(compactQuestion)) continue;
        seen.add(answer);
        clean.push({ answer, question });
    }
    if (clean.length < 5) throw new Error(emptyMessage || 'Not enough usable crossword terms were found.');
    return clean.slice(0, 30);
}

// ── Read the currently active clue from the DOM ───────────────────────────────
function _getActiveClueMeta() {
    const activeLi = document.querySelector('.clue-active');
    const clueText = activeLi
        ? activeLi.textContent.replace(/^\d+\.\s*/, '').trim()
        : document.getElementById('active-clue-text')?.textContent?.trim() || null;
    const category = document.getElementById('puzzle-category')?.textContent?.trim() || 'medicine';
    return { clueText, category };
}

// ── Read the fill state of the active (highlighted) word ─────────────────────
function _getActiveWordState() {
    const cells = [...document.querySelectorAll('.grid-cell.highlighted input')];
    const letters = cells.map(i => (i.value || '_').toUpperCase()).join('');
    return {
        letters,
        length: cells.length,
        complete: cells.length > 0 && !letters.includes('_')
    };
}

// ── Collect filled answers from the grid (used for post-puzzle Learn) ─────────
function _getGridAnswers() {
    const results = [];
    const category = document.getElementById('puzzle-category')?.textContent?.trim() || 'medicine';
    const grid = document.getElementById('crossword-grid');

    document.querySelectorAll('#across-clues li, #down-clues li').forEach(li => {
        const row = parseInt(li.dataset.row);
        const col = parseInt(li.dataset.col);
        const dir = li.dataset.direction;
        const clue = li.textContent.replace(/^\d+\.\s*/, '').trim();

        let answer = '';
        let r = row, c = col;
        for (let i = 0; i < 30; i++) {
            const cell = grid?.querySelector(`[data-row="${r}"][data-col="${c}"].grid-cell`);
            if (!cell) break;
            const val = cell.querySelector('input')?.value || '';
            if (!val) break;
            answer += val;
            if (dir === 'across') c++; else r++;
        }
        if (answer.length >= 3) results.push({ answer, clue, category });
    });
    return results;
}

// ── AI panel (slides up from the bottom of the puzzle page) ──────────────────
function _createAIPanel() {
    if (document.getElementById('ai-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.className = 'ai-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="ai-panel-header">
            <span class="ai-panel-icon" aria-hidden="true"></span>
            <span class="ai-panel-title">AI Medical Explainer</span>
            <button class="ai-panel-close" id="ai-panel-close" aria-label="Close AI panel">✕</button>
        </div>
        <div class="ai-panel-body">
            <div id="ai-response" class="ai-response"></div>
        </div>`;
    document.body.appendChild(panel);
    document.getElementById('ai-panel-close').addEventListener('click', () => { panel.hidden = true; });
}

function _showAIPanel(html) {
    const panel = document.getElementById('ai-panel');
    const response = document.getElementById('ai-response');
    if (!panel || !response) return;
    response.innerHTML = html;
    panel.hidden = false;
}

function _escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function _formatAIText(value) {
    return _escapeHtml(value).replace(/\n/g, '<br>');
}

function _setAILoading(msg = 'Thinking…') {
    _showAIPanel(`
        <div class="ai-loading-indicator">
            <div class="ai-spinner"></div>
            <span>${msg}</span>
        </div>`);
}

// ── Add "AI Explain" button to the controls bar ───────────────────────────────
function _addAIButton() {
    const controls = document.getElementById('puzzle-controls');
    if (!controls || document.getElementById('ai-explain-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ai-explain-btn';
    btn.className = 'ai-explain-btn';
    btn.title = 'AI explanation of the selected clue';
    btn.textContent = 'AI Explain';

    const actionMenu = document.getElementById('action-menu-container');
    controls.insertBefore(btn, actionMenu);

    btn.addEventListener('click', async () => {
        const { clueText, category } = _getActiveClueMeta();
        if (!clueText) {
            _showAIPanel('<p class="ai-notice">Select a clue first, then tap AI Explain.</p>');
            document.getElementById('ai-panel').hidden = false;
            return;
        }
        _setAILoading('Explaining the medical concept…');
        try {
            const text = await MedAI.explainClue(clueText, category, _getActiveWordState());
            _showAIPanel(`
                <div class="ai-clue-context">Clue: <em>${_escapeHtml(clueText)}</em></div>
                <div class="ai-answer-text">${_formatAIText(text)}</div>`);
        } catch (e) {
            _showAIPanel(`<p class="ai-error">${_escapeHtml(e.message)}</p>`);
        }
    });
}

function _addTutorButton() {
    const controls = document.getElementById('puzzle-controls');
    if (!controls || document.getElementById('ai-tutor-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ai-tutor-btn';
    btn.className = 'ai-explain-btn ai-tutor-btn';
    btn.title = 'Guided Socratic hint chain';
    btn.textContent = 'Tutor';

    const actionMenu = document.getElementById('action-menu-container');
    controls.insertBefore(btn, actionMenu);

    btn.addEventListener('click', () => runTutorStage(1));
}

async function runTutorStage(stage) {
    const { clueText, category } = _getActiveClueMeta();
    if (!clueText) {
        _showAIPanel('<p class="ai-notice">Select a clue first, then open Tutor.</p>');
        return;
    }
    const word = _getActiveWordState();
    _setAILoading(stage === 1 ? 'Starting guided hint...' : 'Building the next hint...');
    try {
        const text = await MedAI.socraticHint({
            clueText,
            category,
            knownLetters: word.letters,
            answerLength: word.length,
            stage
        });
        const next = stage < 3
            ? `<button class="ai-step-btn" data-stage="${stage + 1}" type="button">Next hint</button>`
            : `<button class="ai-step-btn" id="ai-reveal-word" type="button">Reveal active word</button>`;
        _showAIPanel(`
            <div class="ai-clue-context">Tutor stage ${stage} for: <em>${_escapeHtml(clueText)}</em></div>
            <div class="ai-answer-text">${_formatAIText(text)}</div>
            <div class="ai-step-actions">${next}</div>`);
        document.querySelectorAll('.ai-step-btn[data-stage]').forEach(stepBtn => {
            stepBtn.addEventListener('click', () => runTutorStage(Number(stepBtn.dataset.stage)));
        });
        const reveal = document.getElementById('ai-reveal-word');
        if (reveal) {
            reveal.addEventListener('click', () => {
                const select = document.getElementById('action-select');
                const apply = document.getElementById('apply-action');
                if (select && apply) {
                    select.value = 'reveal-word';
                    apply.click();
                }
            });
        }
    } catch (e) {
        _showAIPanel(`<p class="ai-error">${_escapeHtml(e.message)}</p>`);
    }
}

// ── Hook into the hint button to show an AI nudge alongside the letter reveal ─
function _hookHintButton() {
    const hintBtn = document.getElementById('hint-button');
    if (!hintBtn) return;

    // capture=true so this fires before script.js's bubble listener
    hintBtn.addEventListener('click', async () => {
        const { clueText, category } = _getActiveClueMeta();
        if (!clueText) return;

        const highlighted = [...document.querySelectorAll('.grid-cell.highlighted input')];
        const knownLetters = highlighted.map(i => i.value || '_').join('');
        const hasPartial = /[A-Z]/i.test(knownLetters);

        _setAILoading('Getting an AI hint…');
        try {
            const text = await MedAI.hintForClue(clueText, hasPartial ? knownLetters : null, category);
            _showAIPanel(`
                <div class="ai-clue-context">Hint for: <em>${_escapeHtml(clueText)}</em></div>
                <div class="ai-answer-text">${_formatAIText(text)}</div>`);
        } catch {
            document.getElementById('ai-panel').hidden = true; // fail silently
        }
    }, true /* capture */);
}

// ── Inject the Learn tab into the congrats modal ─────────────────────────────
function _injectLearnTab() {
    const modalActions = document.querySelector('.modal-actions');
    const modalContent = document.querySelector('.modal-content');
    if (!modalActions || !modalContent || document.getElementById('modal-learn-btn')) return;

    const learnBtn = document.createElement('button');
    learnBtn.id = 'modal-learn-btn';
    learnBtn.className = 'modal-btn modal-btn-secondary';
    learnBtn.textContent = 'Learn';
    modalActions.insertBefore(learnBtn, modalActions.firstChild);

    const learnPanel = document.createElement('div');
    learnPanel.id = 'modal-learn-panel';
    learnPanel.className = 'modal-learn-panel';
    learnPanel.hidden = true;
    modalContent.insertBefore(learnPanel, modalActions);

    learnBtn.addEventListener('click', async () => {
        if (!learnPanel.hidden) {
            learnPanel.hidden = true;
            learnBtn.textContent = 'Learn';
            return;
        }
        learnPanel.hidden = false;
        learnBtn.textContent = 'Hide';
        learnPanel.innerHTML = `
            <div class="ai-loading-indicator">
                <div class="ai-spinner"></div>
                <span>Generating learning notes…</span>
            </div>`;

        const terms = _getGridAnswers();
        if (terms.length === 0) {
            learnPanel.innerHTML = '<p class="ai-notice">Complete the puzzle first to see learning notes.</p>';
            return;
        }
        try {
            const text = await MedAI.learnBatch(terms);
            learnPanel.innerHTML = `
                <div class="modal-learn-title">What you just learned</div>
                <div class="modal-learn-body">${_formatAIText(text)}</div>`;
        } catch (e) {
            learnPanel.innerHTML = `<p class="ai-error">Could not load notes: ${_escapeHtml(e.message)}</p>`;
        }
    });
}

// ── Watch for the congrats modal being opened ─────────────────────────────────
function _watchCongratsModal() {
    const modal = document.getElementById('congrats-modal');
    if (!modal) return;
    new MutationObserver(() => {
        if (modal.classList.contains('active')) _injectLearnTab();
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!MedAI.isConfigured()) {
        console.log('[MedAI] API key not set — open gemini.js and replace YOUR_KEY_HERE to enable AI features.');
        return;
    }
    _createAIPanel();
    _addAIButton();
    _addTutorButton();
    _hookHintButton();
    _watchCongratsModal();
    console.log(`[MedAI] Gemini AI active (${_geminiModel}).`);
});
