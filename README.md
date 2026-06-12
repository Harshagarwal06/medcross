# 🩺 MedCross — AI-Powered Medical Crossword Puzzles

An installable Progressive Web App that procedurally generates **New York Times–style crossword puzzles** from a 16,000+ line medical terminology database, with **Google Gemini AI** built in as a study tutor. Built for medical students — zero frameworks, zero dependencies, pure vanilla JavaScript.

## Features

### 🧩 NYT-style solving experience
- "Ready to start solving?" gate — the timer starts when you hit Play
- Pausable timer with a blurred grid veil; auto-pauses when you switch tabs
- Smart cursor: typing skips filled squares and auto-jumps to the next incomplete clue
- "Not quite right…" modal when the grid is full but has an error
- ⭐ Gold-star solves for finishing without checks or reveals
- Pencil mode, auto-check, check/reveal by letter/word/grid, keyboard navigation (arrows, Tab, Space)

### 🤖 AI tutor (Google Gemini)
- **AI Explain** — explains the medical concept behind the selected clue; spoiler-free until you've solved the word
- **AI Hint** — a nudge toward the answer using your partially-filled letters, without revealing it
- **Learn** — post-solve clinical notes for every term in the puzzle
- **Create from Notes** — extracts crossword-ready terms from pasted notes

### 📚 Learning system
- Procedural puzzle generation across specialties (cardiology, neurology, pharmacology…) and difficulty tiers (M1 → USMLE/Residency)
- Custom puzzle builder can fetch medical terms from ClinicalTables conditions and RxNorm drug data, then turn them into playable crosswords
- Daily puzzle, streaks, achievements, scoring, and a stats dashboard
- Missed terms feed a flashcard review queue (spaced-repetition style)
- Offline-capable PWA with save/resume

## Run it

```bash
git clone <this-repo>
cd medcross

# Enable AI features (optional): add your free Gemini key
cp config.example.js config.js   # then paste your key from https://aistudio.google.com/apikey

# Optional private/keyed data APIs:
# set MEDCROSS_DATA_PROXY_URL in config.js to call your backend data proxy.
# Public ClinicalTables and RxNorm puzzle generation works without keys.
# For public AI deployment, set MEDCROSS_AI_PROXY_URL to a serverless proxy
# and keep Gemini/provider keys on the server.

# Serve (any static server works)
python3 -m http.server 8787
```

Open http://localhost:8787 and pick a puzzle.

## Backup and tests

The stats page includes local export/import/reset controls for progress, custom puzzles, and spaced-repetition history.

Fast local checks:

```bash
for f in *.js; do node --check "$f" || exit 1; done
node tests/security-static.test.js
node tests/generator-quality.test.js
```

Optional browser smoke testing is documented in `tests/README.md`.

## Tech

Vanilla JavaScript (ES6+), HTML5, CSS3 · Google Gemini API · ClinicalTables · RxNorm · Service Worker / PWA · localStorage persistence · No build step, no dependencies.

> `ai/` contains an optional alternative backend: a Python FastAPI proxy that routes AI requests through Hugging Face Inference Providers using the OpenAI SDK, keeping tokens server-side. The app runs on Gemini by default and doesn't require it.
