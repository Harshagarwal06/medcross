# MedCross Handoff

## Project State

MedCross is a static Progressive Web App for medical crossword learning in:

```bash
/Users/harshagarwal/Desktop/MedCross
```

The app now supports built-in medical crosswords, mini crosswords, custom notes puzzles, automatic topic puzzles from public medical APIs plus Gemini enrichment, progress tracking, stats, spaced-repetition study, and AI help when a Gemini key is configured.

The current local server is:

```text
http://127.0.0.1:8787
```

It is served with:

```bash
cd /Users/harshagarwal/Desktop/MedCross
python3 -m http.server 8787
```

Latest known asset versions:

- `sw.js`: `medcross-v53`
- `index.html`: `style.css?v=27`, `crossword-generator.js?v=12`, `validation.js?v=1`, `progress.js?v=12`, `medical-api-sources.js?v=8`, `notes-import.js?v=1`, `homepage.js?v=27`, `homepage-filters.js?v=1`, `gemini.js?v=16`
- `puzzle.html`: `style.css?v=27`, `crossword-generator.js?v=12`, `validation.js?v=1`, `progress.js?v=12`, `script.js?v=18`, `gemini.js?v=16`
- `stats.html`: `style.css?v=27`, `progress.js?v=12`, `stats.js?v=15`
- `study.html`: `style.css?v=27`, `progress.js?v=12`, `study.js?v=14`, `gemini.js?v=16`

## Deployment

- Live on GitHub Pages: `https://harshagarwal06.github.io/medcross/` (repo `Harshagarwal06/medcross`, public, deploys from `main` branch root).
- Deploy = push to `main`; Pages rebuilds automatically (~1 minute).
- `config.js` is gitignored and verified absent from git history and the live site, so the deployed app runs key-less: AI buttons hidden, topic puzzles use public APIs, notes puzzles use local database matching.
- **AI on the public site:** LIVE via a Cloudflare Pages Function. The proxy is `functions/api/ai.js`, deployed on the Cloudflare Pages project at `https://medcross-ai.pages.dev/api/ai`. `config.public.js` (committed, no secret) points the public site there and activates it only on deployed hosts (local dev still uses the direct `config.js` key). The `GEMINI_API_KEY` is a Pages env-var secret — never shipped to the browser. CORS allows both the GitHub Pages and Cloudflare Pages origins, so AI works from either site. Verified end-to-end: `POST /api/ai` with the GitHub Pages Origin returns `{"text": "..."}`. A standalone Worker version (`ai-proxy/cloudflare-worker.js`) also exists as an alternative. Steps: `ai-proxy/README.md`.
- Why the AI buttons "disappeared" on the live site: they only render when `MedAI.isConfigured()` is true (needs a key or proxy URL). The key is local-only by design, so the public site hid them. Locally they work as before.

## API Key Setup

Gemini reads the key from `config.js`:

```js
window.GEMINI_API_KEY = 'YOUR_KEY_HERE';
```

`config.example.js` is the template. Keep the real `config.js` local. For public deployment, move Gemini or keyed medical API calls behind a backend proxy because frontend keys are visible to users.

## What Is Done

### Homepage and UI Polish

- The homepage now shows puzzle cards in the first viewport instead of burying them far below the hero.
- Added hero actions:
  - `Browse Puzzles`
  - `Create Topic Puzzle`
- `Create Topic Puzzle` opens the custom creator directly on the Topic tab and focuses the topic input.
- Moved `Available Puzzles` above review, creator, daily, achievements, category, and difficulty sections.
- Compact mobile hero so puzzle cards are visible on phones.
- Disabled delayed fade animations for the core homepage app surface so cards and text are readable immediately.
- Updated nav and homepage surfaces toward a cleaner professional look.
- Removed or reduced emoji-heavy UI patterns across main pages.

### Topic Puzzle Generation

- User can type a medical topic, e.g. `asthma`, and MedCross automatically gathers terms.
- The user no longer has to choose an API manually.
- Topic generation searches public medical sources through `medical-api-sources.js`:
  - ClinicalTables conditions
  - RxNorm drugs
  - Optional proxy source if configured
- If Gemini is configured, API results are refined/enriched through `MedAI.generateTopicPuzzleEntries()`.
- If Gemini fails but API terms exist, the app falls back to API-derived entries.
- Generated topic puzzles are stored as custom puzzles in `localStorage` and open as playable puzzles.

### Notes-To-Puzzle

- Notes flow exists in the custom puzzle creator and now supports file upload.
- Users can paste notes or upload `.txt`, `.md`, `.csv`, `.pdf`, `.docx` files (button or drag-and-drop onto the notes panel); loaded files show as removable chips.
- File parsing lives in `notes-import.js` (`MedCrossNotes`). PDF (pdf.js) and DOCX (mammoth) parsers are lazy-loaded from CDNs only when such a file is uploaded.
- Before extraction, notes are condensed: noise lines dropped, repeated page headers/footers deduped, and long documents sampled evenly across their length (instead of head-truncating at 12k chars).
- Extracted entries are cached in `localStorage` by content hash (`mcNotesEntryCache:v1`, LRU cap 8), so regenerating from the same notes skips the Gemini call.
- If Gemini is unconfigured or fails, terms are matched locally against the built-in `medical-database.js` word bank, so notes puzzles work without an API key.
- `CrosswordGenerator.generateFromEntries()` builds playable custom puzzles from extracted entries.
- Puzzle title uses the first uploaded file's name (`Notes Puzzle: <filename>`).

### Mini Crosswords

- Added mini puzzle cards for every category/difficulty.
- `CrosswordGenerator.generateMiniCrossword()` builds a compact 5x5 mini from random symmetric templates (`_makeMiniTemplate`), so black-square patterns vary per puzzle instead of one fixed layout.
- Mini templates allow unchecked cells (every white cell must belong to at least one across/down word of length ≥ 3, whites connected, ≥ 40% checked). Fully-checked 5x5 grids were unfillable with medical vocabulary, which previously forced *every* specialty mini onto the curated fallback grid.
- In a 100-run benchmark: 0 curated fallbacks, 63 distinct patterns, ~21 ms average generation.
- If a specialty mini still cannot be generated, it uses a curated general medical fallback.
- Homepage mini cards show `5x5 grid` instead of a hardcoded clue count (actual clue count now varies ~6-9).
- Fallback minis now display honestly as:
  - title: `Medical Mini`
  - category: `General Medicine`
  - difficulty: `Mini`
- Homepage mini card copy explains: specialty terms are used when possible, with a general medical fallback.

### Puzzle Playing Page

- Clue panel readability was improved.
- Right-side clues are easier to scan on desktop and stack properly on mobile.
- Puzzle controls were cleaned up:
  - `Check`
  - `Reveal`
  - `Hint`
  - `Pencil`
  - `Auto-check`
  - `AI Explain`
  - `Tutor`
- Native `alert()` / `confirm()` / `prompt()` were removed from root JS/HTML.
- In-app toast/dialog system added for:
  - missing selected puzzle
  - missing active cell
  - reveal confirmation
  - share fallback
  - stats clear-review confirmation
- Full `Reveal` no longer silently dead-ends the puzzle.
  - It fills the grid.
  - Stops the timer.
  - Shows a `Puzzle Revealed` modal.
  - Saves answers.
  - Adds revealed terms to review.
  - Does not count the puzzle as completed.

### Stats and Review

- Stats page was restyled to match the professional UI direction.
- Stats sections:
  - Overview
  - Achievements
  - By Specialty
  - Focus Areas
  - Daily Challenge
  - Review Queue
- Review queue rows are escaped before rendering, so generated/user content cannot inject markup.
- Clear-review action now uses an in-app confirmation dialog.

### Study Mode

- Study page was restyled and cleaned.
- Due/All tabs are working.
- Flashcards show clue first, answer after reveal, then `Missed` / `Got it`.
- AI flashcard explanations work when Gemini is configured.
- Fixed study progress accounting:
  - Missed cards return later in the same session.
  - Missed attempts no longer count as completed.
  - Progress now counts completed cards.
  - First-try recall is based on cards answered correctly before any miss.
- Current study script version is `study.js?v=11`.

### Safety and Robust Rendering

- Escaped dynamic user/generated text in homepage puzzle cards.
- Puzzle clues render via text nodes instead of raw interpolated HTML.
- Stats review queue escapes terms, clues, source puzzle names, and metadata.
- Gemini/AI panel escapes model output and error messages before rendering line breaks.
- Achievement modal descriptions are escaped.
- `validation.js` now exposes `MedCrossValidation.validatePuzzle()` and `validateEntries()` for runtime warnings and generator tests.
- `MedCrossProgress` now supports export/import/reset and richer review grading (`again`, `hard`, `good`, `easy`) with per-term history.
- Public AI deployments can use `MEDCROSS_AI_PROXY_URL` so Gemini/provider keys stay server-side.
- The service worker uses network-first loading for versioned same-origin assets and caches CDN `basic`/`cors`/`opaque` responses after first use for better offline reuse of fonts/icons/parsers/Tailwind.
- Inline browser event handlers have been removed from root JS/HTML.

### Test Helpers

- `tests/security-static.test.js`: checks tracked files for frontend secrets, inline handlers, and CDN/offline caching guardrails.
- `tests/generator-quality.test.js`: validates generated full and mini puzzles with `MedCrossValidation` and reports fallback/checked-cell metrics.
- `tests/browser-smoke.js`: optional Playwright helper for homepage, stats, and study page smoke checks.

## Important Files

- `index.html`: homepage structure, puzzle list now near the top.
- `homepage.js`: puzzle listing, filters, daily card, custom creator, notes/topic generation.
- `homepage-filters.js`: URL-driven homepage filter application for stats/focus-area deep links.
- `medical-api-sources.js`: public medical API helper for topic puzzle generation.
- `crossword-generator.js`: full crossword generation, mini generation, custom entry generation.
- `puzzle.html`: puzzle playing page shell.
- `script.js`: puzzle loading, play controls, reveal/check/hint behavior, result modals, persistence.
- `progress.js`: progress, custom puzzles, achievements, review queue, study scheduling, stats.
- `stats.html` / `stats.js`: stats and review queue UI.
- `study.html` / `study.js`: spaced-repetition flashcard study flow.
- `gemini.js`: Gemini integration, notes extraction, topic enrichment, AI explain, Tutor, study explanations.
- `style.css`: main design system and responsive polish.
- `sw.js`: PWA cache list/version.

## Verification Performed

Recent browser checks:

- Homepage:
  - `212` puzzle cards rendered.
  - Desktop first viewport showed visible puzzle cards.
  - Mobile first viewport showed visible puzzle cards.
  - No horizontal overflow.
  - No browser warnings/errors.
- Topic flow:
  - Created and opened `Topic Puzzle: asthma`.
  - Generated puzzle had `19` clues and no console warnings.
- Puzzle page:
  - Mini puzzle loaded with updated scripts.
  - Full reveal showed `Puzzle Revealed`.
  - Progress reached `100%`.
  - Revealed terms appeared in review queue.
- Mini fallback:
  - Cached fallback mini normalized to `Medical Mini` / `General Medicine`.
  - Mobile mini layout had no overflow and clues below the grid.
- Stats:
  - Review queue updated after reveal.
  - Stats page rendered without console warnings.
- Study:
  - `Missed` keeps progress at `0%` and returns the card later.
  - `Got it` advances progress correctly.
  - Mobile study page has no horizontal overflow.

Command checks:

- Root JavaScript parse sweep passed:

```bash
for f in *.js; do node --check "$f" || exit 1; done
```

- Searches confirmed no root JS/HTML native browser dialogs remain:

```bash
rg -n "alert\(|confirm\(|prompt\(" *.js *.html
```

- Stale cache/version checks were run after each asset bump.

## Current Dirty Worktree

At the time this handoff was updated, these files were modified:

```text
homepage.js
index.html
progress.js
puzzle.html
stats.html
stats.js
study.html
study.js
style.css
sw.js
```

The dirty state is expected. Do not reset it unless the user explicitly asks.

## Known Caveats

- The project is still static/local-first. Data is stored in browser `localStorage` and does not sync across devices.
- Gemini and live topic enrichment depend on network access and a configured `config.js` key.
- Frontend API keys are visible; use a backend proxy for public deployment.
- The browser used during testing contains locally generated test puzzles, including duplicate `Topic Puzzle: asthma` cards. Those are stored in local browser state, not the source database.
- Some homepage/runtime styling and parsers still originate from CDNs (Tailwind, fonts, Lucide, Material Symbols, pdf.js, Mammoth). The service worker now caches CDN responses after first use, but true first-load offline support still requires bundling or replacing those assets locally.
- A full end-to-end regression suite does not exist yet.

## Recommended Next Tasks

- Add automated browser smoke tests for:
  - homepage puzzle visibility
  - topic puzzle creation
  - start/play puzzle
  - reveal flow
  - stats review queue
  - study missed/got-it flow
- Add a local clear/delete UI for custom generated puzzles so test topic cards can be removed without clearing all browser storage.
- Bundle or replace Lucide CDN icons for offline reliability.
- Add import/export for progress, review queue, and custom puzzles.
- Consider a small backend proxy for Gemini and any keyed medical APIs before public deployment.
- Continue a route-by-route final audit before marking the full "fully functional, no glitches, professional UI" goal complete.
