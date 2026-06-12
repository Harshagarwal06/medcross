// config.public.js — COMMITTED, safe to deploy. Contains no secrets.
//
// Loaded before config.js on every page. Its job is to point the PUBLIC
// site at the AI proxy so the AI Explain / Tutor buttons work there
// without ever shipping the Gemini key to the browser.
//
// The proxy is a Cloudflare Pages Function (functions/api/ai.js) that
// lives on the Cloudflare Pages deployment. It works from either the
// GitHub Pages site or the Cloudflare Pages site (CORS allows both).
//
// Locally (localhost / 127.0.0.1) this stays out of the way, so your
// gitignored config.js key is used directly as before.
(function () {
    var PROXY_URL = 'https://medcross-ai.pages.dev/api/ai';

    var host = location.hostname;
    var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

    // On the public site, route AI through the proxy. Only activate once a
    // real URL has been filled in (skip the untouched placeholder).
    if (!isLocal && PROXY_URL.indexOf('YOUR-SUBDOMAIN') === -1) {
        window.MEDCROSS_AI_PROXY_URL = PROXY_URL;
    }
})();
