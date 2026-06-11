# MedCross Handoff

## Project Overview

MedCross is a static Progressive Web App for medical crossword learning. It generates NYT-style medical crossword puzzles from a local medical terminology database, supports Gemini-powered study help, tracks progress in `localStorage`, and includes flashcard review, achievements, stats, and offline PWA support.

Current project folder:

```bash
/Users/harshagarwal/Desktop/MedCross
```

## Run The App

Start the local static server from the project folder:

```bash
cd /Users/harshagarwal/Desktop/MedCross
python3 -m http.server 8787
```

Open:

```text
http://127.0.0.1:8787
```

The current local server was restarted from the renamed `MedCross` folder and returned `200 OK`.

## API Key Setup

Gemini features read the key from `config.js`:

```js
window.GEMINI_API_KEY = 'YOUR_KEY_HERE';
```

`config.example.js` is the template. The real `config.js` should stay local and should not be committed if this project is later pushed to a public repo.

## Recent Implemented Features

- Notes-to-puzzle flow: homepage has a "Create from Notes" UI. Users paste notes, Gemini extracts crossword-ready terms and clues, and the app generates a custom playable puzzle.
- Custom puzzle generation: `CrosswordGenerator.generateFromEntries(entries, options)` builds puzzles from extracted `{ answer, question }` entries without inserting them into the main database.
- Custom puzzle storage: custom notes puzzles are stored in `localStorage` through `MedCrossProgress.saveCustomPuzzle()` and loaded like normal puzzles.
- Socratic Tutor mode: puzzle page adds a Tutor button with staged, spoiler-safe guided hints and an explicit reveal step.
- Upgraded flashcards: review cards now preserve source puzzle, difficulty, missed count, last result, and support due/all study modes.
- AI flashcard explanations: study cards can request short Gemini explanations when the API key is configured.
- Weak-area analytics: stats page shows focus areas based on accuracy, score, mistakes, hints, reveals, and review-term count.
- Daily challenge calendar: stats page shows a 21-day daily challenge history; daily completion now records solve stats.
- Cache refresh: `sw.js` cache version and HTML asset query strings were bumped so browsers load the new files.

## Main Files Changed

- `crossword-generator.js`: added custom entry normalization and puzzle generation.
- `progress.js`: added custom puzzle storage, weak-area breakdowns, richer review metadata, and daily history.
- `homepage.js` and `index.html`: added Create from Notes flow and custom puzzle listing.
- `gemini.js`: added notes extraction, Socratic tutor hints, flashcard explanations, and Tutor button wiring.
- `script.js` and `puzzle.html`: added custom puzzle loading and richer solve result recording.
- `stats.js` and `stats.html`: added weak areas and daily calendar.
- `study.js` and `study.html`: added due/all sessions and AI explanation UI.
- `style.css`: added styling for the new creator, stats, calendar, tutor, and study UI.
- `sw.js`: bumped cache version.

## Verification Performed

- Ran JavaScript syntax checks with `node --check` for:
  - `crossword-generator.js`
  - `progress.js`
  - `homepage.js`
  - `gemini.js`
  - `script.js`
  - `stats.js`
  - `study.js`
- Checked local pages over HTTP with `curl -I`.
- Browser smoke tested:
  - Homepage renders puzzle cards and the Create from Notes section.
  - Stats page renders weak-area and daily-calendar sections.
  - Study page renders Due/All tabs and AI explanation controls.
  - Puzzle page renders a generated crossword and the Tutor button.
- Custom generator sample test produced a valid puzzle from sample medical terms.

## Known Caveats

- Live notes extraction depends on a valid Gemini API key in `config.js` and network access to the Gemini API.
- API keys in frontend JavaScript are visible to users. For a public deployment, move Gemini/UMLS-style keyed requests behind a backend proxy.
- Existing progress, custom puzzles, and review data are stored in browser `localStorage`; they do not sync across devices.
- The current notes-to-puzzle v1 supports pasted notes only, not PDF upload.

## Recommended Next Tasks

- Test the notes-to-puzzle flow with real lecture notes and the configured Gemini key.
- Add export/import for custom puzzles and progress data.
- Add a small backend proxy if deploying publicly, so API keys are not exposed.
- Consider integrating free medical data sources:
  - ClinicalTables for conditions and terminology without a key.
  - RxNorm for pharmacology/drug puzzles.
  - UMLS for richer definitions and semantic types, preferably through a backend proxy.
- Add automated browser tests for homepage, custom puzzle creation, puzzle solving, stats, and study flows.
- Add a visible message for network/API failures during notes extraction so users know whether the issue is key setup, quota, or connectivity.
