// config.example.js — copy this file to config.js and add your own key(s).

// ── Hugging Face (open-source models, recommended) ──────────────────────────
// Get a token at https://huggingface.co/settings/tokens (read access is enough).
// When set, LOCAL dev uses an open-source model via the HF Inference Providers
// router. Default model is Qwen/Qwen2.5-72B-Instruct; override with HF_MODEL.
// On the DEPLOYED site, do NOT rely on this — set HF_TOKEN as a server secret
// in the Cloudflare Pages project instead, so the token never ships to browsers.
window.HF_TOKEN = '';
// window.HF_MODEL = 'Qwen/Qwen2.5-72B-Instruct';

// ── Google Gemini (fallback) ────────────────────────────────────────────────
// Get a free Gemini API key at https://aistudio.google.com/apikey
window.GEMINI_API_KEY = 'YOUR_KEY_HERE';

// Optional: use this for public deployments so provider keys stay server-side.
// The endpoint should accept POST { prompt, maxTokens, source } and return
// { text: "..." } or another supported text field.
window.MEDCROSS_AI_PROXY_URL = '';

// Optional: route private/keyed medical data providers through your own backend.
// Put private provider keys inside that backend, not in this browser config.
// Public browser-safe sources, ClinicalTables and RxNorm, do not need keys.
window.MEDCROSS_DATA_PROXY_URL = '';
