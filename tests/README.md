# MedCross Test Helpers

Run the fast checks from the project root:

```bash
for f in *.js; do node --check "$f" || exit 1; done
node tests/security-static.test.js
node tests/generator-quality.test.js
```

Run the full generator benchmark across every specialty:

```bash
MEDCROSS_BENCH_ALL=1 node tests/generator-quality.test.js
```

Run the optional browser smoke helper after starting a static server:

```bash
python3 -m http.server 8787
MEDCROSS_BASE_URL=http://127.0.0.1:8787 node tests/browser-smoke.js
```

`tests/browser-smoke.js` requires Playwright in the local environment. The other checks use only Node's built-in modules.
