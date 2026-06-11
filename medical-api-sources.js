/**
 * Medical API source helpers for generating custom crossword entries.
 *
 * Current browser-safe sources:
 * - ClinicalTables conditions search (no key)
 * - RxNorm drug search (no key)
 *
 * Optional config hooks:
 * - window.MEDCROSS_DATA_PROXY_URL can point at a backend that returns
 *   [{ answer, question }] for keyed/private sources.
 * - window.UMLS_API_KEY is reserved for that proxy flow. Do not expose it in
 *   a public frontend deployment.
 */
const MedCrossAPISources = (() => {
    const SOURCE_LABELS = {
        conditions: 'Clinical conditions',
        rxnorm: 'RxNorm drugs',
        proxy: 'Custom data proxy'
    };

    function isProxyConfigured() {
        return Boolean(window.MEDCROSS_DATA_PROXY_URL);
    }

    function availableSources() {
        const base = [
            { value: 'conditions', label: SOURCE_LABELS.conditions, needsKey: false },
            { value: 'rxnorm', label: SOURCE_LABELS.rxnorm, needsKey: false }
        ];
        if (isProxyConfigured()) {
            base.push({ value: 'proxy', label: SOURCE_LABELS.proxy, needsKey: Boolean(window.UMLS_API_KEY) });
        }
        return base;
    }

    async function fetchEntries({ source, query, limit = 24 }) {
        const cleanQuery = String(query || '').trim();
        if (cleanQuery.length < 2) {
            throw new Error('Enter a medical topic, condition, or drug name to search.');
        }

        if (source === 'rxnorm') return fetchRxNormEntries(cleanQuery, limit);
        if (source === 'proxy') return fetchProxyEntries(cleanQuery, limit);
        return fetchConditionEntries(cleanQuery, limit);
    }

    async function fetchTopicEntries({ query, limit = 30 }) {
        const cleanQuery = String(query || '').trim();
        if (cleanQuery.length < 2) {
            throw new Error('Enter any medical topic, condition, drug, or body system.');
        }

        const sources = ['conditions', 'rxnorm'];
        if (isProxyConfigured()) sources.push('proxy');

        const results = await Promise.allSettled(
            sources.map(source => fetchEntries({ source, query: cleanQuery, limit }))
        );
        const entries = [];
        results.forEach((result, index) => {
            if (result.status !== 'fulfilled') return;
            const source = sources[index];
            result.value.forEach(entry => entries.push({ ...entry, source }));
        });

        return finalizeEntries(
            entries,
            'The public medical APIs did not return enough crossword-ready terms for that topic.'
        ).slice(0, limit);
    }

    async function fetchConditionEntries(query, limit) {
        const url = new URL('https://clinicaltables.nlm.nih.gov/api/conditions/v3/search');
        url.searchParams.set('terms', query);
        url.searchParams.set('maxList', String(limit));
        url.searchParams.set('ef', 'primary_name,consumer_name');

        const data = await fetchJson(url);
        const rows = extractConditionRows(data);
        const entries = [];
        rows.forEach(row => {
            const term = bestTerm(row, query);
            const detail = row.find(s => s && s !== term && s.length > term.length) || '';
            entries.push(makeEntry(term, conditionClue(term, detail, query)));
            row.forEach(value => extractMedicalTokens(value, query).forEach(token => {
                entries.push({
                    answer: token,
                    question: conditionTokenClue(value, token)
                });
            }));
        });
        return finalizeEntries(entries, 'Try a broader condition topic, such as cardiomyopathy or diabetes.');
    }

    async function fetchRxNormEntries(query, limit) {
        const url = new URL('https://rxnav.nlm.nih.gov/REST/drugs.json');
        url.searchParams.set('name', query);

        const data = await fetchJson(url);
        const groups = data?.drugGroup?.conceptGroup || [];
        const concepts = groups.flatMap(group => group.conceptProperties || []).slice(0, limit);
        const entries = [];
        concepts.forEach(item => {
            const name = item.name || item.synonym || '';
            const detail = [
                item.synonym && item.synonym !== name ? `Synonym: ${item.synonym}` : '',
                item.tty ? `RxNorm term type ${item.tty}` : '',
                item.rxcui ? `RxCUI ${item.rxcui}` : ''
            ].filter(Boolean).join('; ');
            entries.push(makeEntry(name, drugClue(name, item, query)));
            extractDrugTokens(name, query).forEach(token => {
                entries.push({
                    answer: token,
                    question: drugTokenClue(name, token, item)
                });
            });
        });
        return finalizeEntries(entries, 'Try a generic drug name, such as metformin or amoxicillin.');
    }

    async function fetchProxyEntries(query, limit) {
        if (!isProxyConfigured()) throw new Error('Add MEDCROSS_DATA_PROXY_URL in config.js to use the proxy source.');
        const url = new URL(window.MEDCROSS_DATA_PROXY_URL);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', String(limit));
        if (window.UMLS_API_KEY) url.searchParams.set('umlsKey', window.UMLS_API_KEY);

        const data = await fetchJson(url);
        const entries = Array.isArray(data) ? data : data.entries;
        return finalizeEntries((entries || []).map(makeEntry), 'The proxy did not return enough crossword-ready entries.');
    }

    async function fetchJson(url) {
        const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Data source returned ${res.status}. Try another topic or source.`);
        return res.json();
    }

    function extractConditionRows(data) {
        const rows = [];
        const extras = data?.[2] && typeof data[2] === 'object' ? data[2] : {};
        const primary = Array.isArray(extras.primary_name) ? extras.primary_name : [];
        const consumer = Array.isArray(extras.consumer_name) ? extras.consumer_name : [];
        const max = Math.max(primary.length, consumer.length);
        for (let i = 0; i < max; i++) {
            rows.push([primary[i], consumer[i]].filter(Boolean));
        }
        return [...rows, ...extractStringRows(data)];
    }

    function extractStringRows(value) {
        const rows = [];
        function visit(node) {
            if (!Array.isArray(node)) return;
            if (node.every(item => typeof item === 'string' || item == null)) {
                const row = node.map(item => String(item || '').trim()).filter(Boolean);
                if (row.length) rows.push(row);
                return;
            }
            node.forEach(visit);
        }
        visit(value);
        return rows;
    }

    function extractMedicalTokens(value, query) {
        const stop = new Set([
            'MG', 'ML', 'ORAL', 'TABLET', 'CAPSULE', 'SOLUTION', 'SUSPENSION', 'INJECTION',
            'EXTENDED', 'RELEASE', 'DELAYED', 'HOUR', 'FILM', 'COATED', 'PACK', 'DOSE',
            'PEN', 'PREFILLED', 'SYRINGE', 'TOPICAL', 'CREAM', 'GEL', 'TYPE', 'ADULT',
            'JUVENILE', 'RELATED', 'CONTROLLED', 'NON', 'AND', 'THE', 'FOR',
            'HYDROCHLORIDE', 'PHOSPHATE', 'SODIUM', 'POTASSIUM'
        ]);
        return String(value || '')
            .split(/[^a-zA-Z]+/)
            .map(token => token.toUpperCase())
            .filter(token => token.length >= 3 && token.length <= 15 && !stop.has(token))
            .filter(token => token !== normalizeAnswer(query) || token.length <= 15);
    }

    function extractDrugTokens(value, query) {
        return extractMedicalTokens(value, query);
    }

    function conditionClue(term, detail, query) {
        const blanked = blankAnswerInText(detail || term, term);
        if (blanked && blanked.includes('___')) {
            return `ClinicalTables condition name: ${blanked}`;
        }
        return `Condition or diagnosis associated with the selected ClinicalTables search`;
    }

    function conditionTokenClue(sourceText, token) {
        const blanked = blankAnswerInText(sourceText, token);
        if (blanked && blanked.includes('___')) {
            return `Completes this ClinicalTables condition: ${blanked}`;
        }
        return '';
    }

    function drugClue(name, item, query) {
        const blanked = blankAnswerInText(cleanDrugLabel(name), name);
        if (blanked && blanked.includes('___')) {
            return `RxNorm medication label: ${blanked}`;
        }
        if (item?.tty) return `RxNorm medication concept of type ${item.tty}`;
        return 'Medication concept from RxNorm';
    }

    function drugTokenClue(sourceText, token, item) {
        const blanked = blankAnswerInText(cleanDrugLabel(sourceText), token);
        if (blanked && blanked.includes('___')) {
            return `Completes this RxNorm drug label: ${blanked}`;
        }
        if (item?.tty) return `Medication term from an RxNorm ${item.tty} result`;
        return '';
    }

    function cleanDrugLabel(value) {
        return String(value || '')
            .replace(/\b\d+(\.\d+)?\s*(MG|ML|UNT|HR|HOUR)\b/gi, '')
            .replace(/\b\d+(\.\d+)?\b/g, '')
            .replace(/\b(24|12)\s*HR\b/gi, '')
            .replace(/\b(extended|delayed|release|oral|tablet|capsule|solution|suspension|injection|film|coated)\b/gi, '')
            .replace(/\b(hydrochloride|phosphate|sodium|potassium)\b/gi, '')
            .replace(/\s*\/\s*/g, ' + ')
            .replace(/\s+/g, ' ')
            .replace(/\s+\]/g, ']')
            .replace(/\[\s+/g, '[')
            .trim();
    }

    function blankAnswerInText(text, answer) {
        const raw = String(text || '').replace(/\s+/g, ' ').trim();
        const cleanAnswer = normalizeAnswer(answer);
        if (!raw || !cleanAnswer) return raw;
        const answerText = String(answer || '').replace(/[^a-z]/gi, '');
        if (answerText.length >= 3) {
            const direct = new RegExp(`\\b${escapeRegex(answerText)}\\b`, 'ig');
            const directBlanked = raw.replace(direct, '___').replace(/\s+/g, ' ').trim();
            if (directBlanked !== raw) return directBlanked;
        }
        const words = raw.split(/(\b[a-zA-Z][a-zA-Z-]*\b)/);
        let changed = false;
        const blanked = words.map(part => {
            if (normalizeAnswer(part) === cleanAnswer) {
                changed = true;
                return '___';
            }
            return part;
        }).join('').replace(/\s+/g, ' ').trim();
        return changed ? blanked : raw;
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function bestTerm(row, query) {
        const candidates = row
            .map(s => String(s || '').trim())
            .filter(Boolean)
            .sort((a, b) => scoreTerm(b, query) - scoreTerm(a, query));
        return candidates[0] || '';
    }

    function scoreTerm(term, query) {
        const normalized = normalizeAnswer(term);
        const queryHit = term.toLowerCase().includes(query.toLowerCase()) ? 4 : 0;
        const lengthScore = normalized.length >= 4 && normalized.length <= 12 ? 3 : 0;
        const wordPenalty = /\s/.test(term) ? -1 : 0;
        return queryHit + lengthScore + wordPenalty;
    }

    function makeEntry(item, detail = '') {
        const rawAnswer = typeof item === 'string' ? item : item?.answer || item?.name || item?.term || '';
        const answer = normalizeAnswer(rawAnswer);
        const clue = typeof item === 'object' && item
            ? item.question || item.clue || item.definition || detail
            : detail;
        return {
            answer,
            question: buildClue(rawAnswer, clue)
        };
    }

    function buildClue(rawAnswer, clue) {
        const safeDetail = String(clue || '').replace(/\s+/g, ' ').trim();
        if (safeDetail && !safeDetail.toUpperCase().includes(normalizeAnswer(rawAnswer))) {
            return safeDetail.replace(/[.]+$/, '');
        }
        return 'Medical term found in the selected external data source';
    }

    function normalizeAnswer(value) {
        return String(value || '').replace(/[^a-z]/gi, '').toUpperCase();
    }

    function finalizeEntries(entries, emptyMessage) {
        const seen = new Set();
        const clean = [];
        for (const entry of entries) {
            const answer = normalizeAnswer(entry.answer);
            const question = String(entry.question || '').trim();
            if (answer.length < 3 || answer.length > 15 || !question || seen.has(answer)) continue;
            const answerRegex = new RegExp(answer.split('').join('\\s*'), 'i');
            if (answerRegex.test(question.replace(/[^a-z]/gi, '').toUpperCase())) continue;
            seen.add(answer);
            clean.push({ answer, question });
        }
        if (clean.length < 5) throw new Error(emptyMessage || 'Not enough usable terms came back from that source.');
        return clean.slice(0, 30);
    }

    return { availableSources, fetchEntries, fetchTopicEntries, isProxyConfigured };
})();

window.MedCrossAPISources = MedCrossAPISources;
