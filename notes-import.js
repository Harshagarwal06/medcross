/**
 * notes-import.js — MedCross notes upload + efficient extraction pipeline
 *
 * Responsibilities:
 *   - Read uploaded note files (.txt, .md, .csv, .pdf, .docx).
 *     PDF and DOCX parsers are lazy-loaded from a CDN only when such a file
 *     is actually uploaded, so the homepage stays light.
 *   - Condense raw notes before they are sent to Gemini: dedupe repeated
 *     lines (page headers/footers), drop noise, and sample evenly across
 *     long documents instead of truncating the head.
 *   - Cache extracted entries by content hash so regenerating from the same
 *     notes never repeats a Gemini call.
 *   - Extract terms locally from the built-in medical database as a
 *     no-network fallback when Gemini is not configured or fails.
 */

const MedCrossNotes = (() => {
    const MAX_FILE_BYTES = 15 * 1024 * 1024;
    const MAX_PDF_PAGES = 60;
    const CACHE_KEY = 'mcNotesEntryCache:v1';
    const CACHE_LIMIT = 8;

    const _scriptPromises = {};
    function _loadScript(src) {
        if (!_scriptPromises[src]) {
            _scriptPromises[src] = new Promise((resolve, reject) => {
                const el = document.createElement('script');
                el.src = src;
                el.onload = resolve;
                el.onerror = () => {
                    delete _scriptPromises[src];
                    reject(new Error('Could not load the file parser. Check your network connection.'));
                };
                document.head.appendChild(el);
            });
        }
        return _scriptPromises[src];
    }

    async function _readPdf(file) {
        await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        const pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
        const out = [];
        for (let p = 1; p <= pages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            out.push(content.items.map(item => item.str).join(' '));
        }
        doc.destroy();
        return out.join('\n');
    }

    async function _readDocx(file) {
        await _loadScript('https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js');
        const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return result.value || '';
    }

    /** Read one uploaded file → { name, text, chars }. Throws with a user-facing message. */
    async function readFile(file) {
        if (file.size > MAX_FILE_BYTES) {
            throw new Error(`"${file.name}" is larger than 15 MB. Split it into smaller files.`);
        }
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        let text;
        if (ext === 'pdf') text = await _readPdf(file);
        else if (ext === 'docx') text = await _readDocx(file);
        else if (ext === 'doc') throw new Error(`"${file.name}" is an old .doc file. Save it as .docx or .txt first.`);
        else if (['txt', 'md', 'markdown', 'csv', 'text', 'rtf'].includes(ext) || file.type.startsWith('text/')) {
            text = await file.text();
        } else {
            throw new Error(`"${file.name}" is not supported. Upload .txt, .md, .pdf, or .docx notes.`);
        }
        text = (text || '').trim();
        if (text.length < 40) {
            throw new Error(`"${file.name}" contains almost no readable text. If it is a scanned PDF, paste the notes instead.`);
        }
        return { name: file.name, text, chars: text.length };
    }

    /**
     * Condense raw notes for the AI prompt: strip noise lines, dedupe repeated
     * headers/footers, and — when still too long — sample evenly across the
     * whole document so terms from later chapters are not lost.
     */
    function condense(text, maxChars = 12000) {
        const seen = new Set();
        const kept = [];
        for (let line of String(text).replace(/\r/g, '').split('\n')) {
            line = line.replace(/[ \t]{2,}/g, ' ').trim();
            if (line.length < 3 || !/[a-z]/i.test(line)) continue;
            const key = line.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            kept.push(line);
        }
        const out = kept.join('\n');
        if (out.length <= maxChars) return out;
        const sliceCount = 6;
        const sliceLen = Math.floor(maxChars / sliceCount) - 2;
        const step = (out.length - sliceLen) / (sliceCount - 1);
        const parts = [];
        for (let i = 0; i < sliceCount; i++) {
            const start = Math.round(i * step);
            parts.push(out.slice(start, start + sliceLen));
        }
        return parts.join('\n…\n');
    }

    // FNV-1a — cheap content hash for the extraction cache.
    function hashText(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(36) + ':' + text.length;
    }

    function _readCache() {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
        catch { return {}; }
    }

    function getCachedEntries(text) {
        const hit = _readCache()[hashText(text)];
        return hit && Array.isArray(hit.entries) && hit.entries.length >= 5 ? hit.entries : null;
    }

    function cacheEntries(text, entries) {
        try {
            const cache = _readCache();
            cache[hashText(text)] = { entries, at: Date.now() };
            const keys = Object.keys(cache);
            if (keys.length > CACHE_LIMIT) {
                keys.sort((a, b) => cache[a].at - cache[b].at)
                    .slice(0, keys.length - CACHE_LIMIT)
                    .forEach(k => delete cache[k]);
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch { /* storage full — caching is best-effort */ }
    }

    let _termIndex = null;
    function _getTermIndex() {
        if (_termIndex) return _termIndex;
        _termIndex = new Map();
        if (typeof medicalCrosswordData !== 'undefined') {
            for (const category of Object.keys(medicalCrosswordData)) {
                for (const difficulty of Object.keys(medicalCrosswordData[category])) {
                    for (const { answer, question } of medicalCrosswordData[category][difficulty]) {
                        const key = String(answer || '').replace(/[^a-z]/gi, '').toUpperCase();
                        if (key.length >= 3 && key.length <= 15 && !_termIndex.has(key)) {
                            _termIndex.set(key, question);
                        }
                    }
                }
            }
        }
        return _termIndex;
    }

    /**
     * No-AI fallback: match words in the notes against the built-in medical
     * database. O(words + database) via a token set — fast even on huge notes.
     */
    function extractTermsLocally(text, limit = 30) {
        const tokens = new Set(String(text).toUpperCase().split(/[^A-Z]+/));
        const entries = [];
        for (const [answer, question] of _getTermIndex()) {
            if (tokens.has(answer)) {
                entries.push({ answer, question });
                if (entries.length >= limit) break;
            }
        }
        return entries;
    }

    return { readFile, condense, hashText, getCachedEntries, cacheEntries, extractTermsLocally };
})();

window.MedCrossNotes = MedCrossNotes;
