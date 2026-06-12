// config.public.js — COMMITTED, safe to deploy. Contains no secrets.
//
// Loaded before config.js on every page. Its job is to point the PUBLIC
// (GitHub Pages) site at the AI proxy so the AI Explain / Tutor buttons
// work there without ever shipping the Gemini key to the browser.
//
// Locally (localhost / 127.0.0.1) this stays out of the way, so your
// gitignored config.js key is used directly as before.
//
// SETUP: deploy ai-proxy/cloudflare-worker.js, then paste its URL below.
(function () {
    var PROXY_URL = 'https://medcross-ai.YOUR-SUBDOMAIN.workers.dev';

    var host = location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

    // On the public site, route AI through the proxy. Only activate once a
    // real URL has been filled in (skip the untouched placeholder).
    if (!isLocal && PROXY_URL.indexOf('YOUR-SUBDOMAIN') === -1) {
        window.MEDCROSS_AI_PROXY_URL = PROXY_URL;
    }
})();
