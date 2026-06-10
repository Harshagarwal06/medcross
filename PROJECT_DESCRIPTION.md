# MedCross — AI-Powered Medical Crossword Platform (Resume Project Description)

> Use this document as context for adding the project to a resume. It contains the project overview, technical details, feature list, and ready-to-use resume bullet points.

## One-line summary
MedCross is a Progressive Web App (PWA) that procedurally generates New York Times-style crossword puzzles from a 16,000+ line medical terminology database, with Google Gemini AI integrated for in-puzzle tutoring (explanations, hints, and post-solve learning notes) — built entirely in vanilla JavaScript, HTML, and CSS with no frameworks or backend.

## What it is
An educational crossword game for medical students (covering cardiology, neurology, pharmacology, and other specialties across difficulty tiers from M1 to USMLE/Residency level). Instead of serving fixed puzzles, it algorithmically constructs a fresh crossword grid on demand from a curated clue/answer database, then provides a full NYT-quality solving experience in the browser.

## Key features

### Puzzle engine
- Custom crossword generation algorithm that places intersecting words on a 2D grid, assigns clue numbering, and produces solvable across/down layouts from raw term/clue data (812-line generator module).
- Curated medical term database (~16,500 lines) organized by specialty and difficulty level.
- Daily puzzle selection with streak tracking.

### NYT-style gameplay (faithful recreation of the New York Times crossword UX)
- "Ready to start solving?" gate screen — the grid stays hidden/blurred until the player hits Play, which starts the timer.
- Pausable solve timer with a blurred "Your puzzle is paused" veil over the grid; auto-pauses when the browser tab loses visibility (Page Visibility API).
- Smart cursor navigation: typing skips already-filled squares within a word; completing a word auto-jumps to the next incomplete clue (with wraparound).
- Full keyboard support: arrow keys, Tab/Shift+Tab clue cycling, Space to toggle direction, Backspace chaining, Escape to deselect.
- "Not quite right" detection — when the grid is full but contains an error, an NYT-style "keep trying" modal appears.
- Gold-star clean solves: finishing without any checks or reveals earns a gold star; assisted solves are distinguished.
- Pencil (notes) mode, auto-check mode, check/reveal at letter/word/grid granularity, limited hint system, sticky active-clue bar with prev/next arrows.

### AI integration (Google Gemini API)
- Client-side integration with the Gemini REST API (`gemini-2.5-flash`, with automatic fallback to `gemini-2.0-flash` on model-availability errors).
- Three AI features built on prompt engineering:
  1. **AI Explain** — explains the medical concept behind the selected clue in plain English.
  2. **AI Hint** — generates a guided nudge using the player's partially-filled letters as context, without revealing the answer.
  3. **Learn mode** — after solving, batches the solved terms into a single prompt and generates per-term clinical learning notes.
- Graceful degradation: all AI features hide themselves if no API key is configured; API errors fail silently or with friendly messages.

### Progress, stats, and learning system
- localStorage-backed persistence: auto-saved grid state, elapsed time, resume-where-you-left-off.
- Scoring model combining solve time, accuracy, hints, and reveals; mistake and accuracy tracking per puzzle.
- Achievements/badges system, statistics dashboard, and a spaced-repetition-style review queue that collects terms the player got wrong or revealed, feeding a flashcard study mode.

### PWA / engineering
- Installable Progressive Web App: web manifest, service worker with stale-while-revalidate caching, offline support, versioned cache invalidation.
- Fully responsive (dynamic grid cell sizing against viewport), dark/light theming via CSS custom properties, accessible markup (ARIA grid roles, labels).
- Zero dependencies: ~21,000 lines of hand-written vanilla JavaScript, HTML5, and CSS3. No build step, no framework, no backend.

## Tech stack
Vanilla JavaScript (ES6+), HTML5, CSS3 (custom properties, grid layout), Google Gemini API (REST), Service Workers / PWA, localStorage, Page Visibility API, Clipboard API.

## Suggested resume bullet points (pick 3–4)
- Built **MedCross**, an installable Progressive Web App that procedurally generates NYT-style medical crossword puzzles from a 16K+ line specialty/difficulty-tiered term database, using zero-dependency vanilla JavaScript (~21K LOC).
- Engineered a faithful New York Times crossword UX: pausable timer with tab-visibility auto-pause, smart cursor navigation that skips filled squares and auto-advances to the next incomplete clue, pencil/auto-check modes, and clean-solve (gold star) detection.
- Integrated the **Google Gemini API** (gemini-2.5-flash with model fallback) to deliver AI tutoring inside the game — concept explanations, context-aware hints built from the player's partial answers, and post-solve learning summaries via prompt engineering.
- Implemented offline-first architecture with a service worker (stale-while-revalidate, versioned cache busting), localStorage-based save/resume, and a spaced-repetition review queue that converts player mistakes into flashcard study sessions.
- Designed a scoring and achievements system tracking accuracy, solve time, streaks, and hint usage, surfaced through a statistics dashboard.
