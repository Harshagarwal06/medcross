// config.example.js — copy this file to config.js and add your own key.
// Get a free Gemini API key at https://aistudio.google.com/apikey
window.GEMINI_API_KEY = 'YOUR_KEY_HERE';

// Optional: use this for public deployments so the Gemini key stays server-side.
// The endpoint should accept POST { prompt, maxTokens, source } and return
// { text: "..." } or another supported text field.
window.MEDCROSS_AI_PROXY_URL = '';

// Optional: route private/keyed medical data providers through your own backend.
// Put private provider keys inside that backend, not in this browser config.
// Public browser-safe sources, ClinicalTables and RxNorm, do not need keys.
window.MEDCROSS_DATA_PROXY_URL = '';
