/**
 * MedCross AI proxy — Cloudflare Worker
 * ------------------------------------------------------------------
 * Keeps the Gemini API key server-side so it is never shipped to the
 * browser. The static MedCross site (GitHub Pages) calls this Worker
 * instead of Google directly.
 *
 * Front-end contract (see gemini.js → _callGeminiProxy):
 *   POST  { "prompt": string, "maxTokens": number, "source": "medcross" }
 *   200   { "text": string }
 *   4xx/5xx { "error": string }
 *
 * DEPLOY (one time, free):
 *   1. Create a free Cloudflare account → Workers & Pages → Create Worker.
 *   2. Paste this file in, click Deploy. Note the URL
 *      (https://medcross-ai.<your-subdomain>.workers.dev).
 *   3. Worker → Settings → Variables → add a SECRET (encrypted)
 *        Name:  GEMINI_API_KEY
 *        Value: <your Google AI Studio key>
 *   4. (Optional) lock it to your site by editing ALLOWED_ORIGINS below.
 *   5. Put that Worker URL into config.public.js (PROXY_URL) and push.
 */

const ALLOWED_ORIGINS = [
  'https://harshagarwal06.github.io',
  'http://localhost:8790',
  'http://127.0.0.1:8790',
];

// Models tried in order; gemini-1.5-* is retired and 404s.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Proxy missing GEMINI_API_KEY secret.' }, 500, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400, origin);
    }

    const prompt = String(payload.prompt || '').trim();
    const maxTokens = Number(payload.maxTokens) || 280;
    if (!prompt) {
      return json({ error: 'Missing prompt.' }, 400, origin);
    }

    let lastError = 'AI request failed.';
    for (const model of MODELS) {
      const generationConfig = {
        maxOutputTokens: Math.max(maxTokens * 4, 1024),
        temperature: 0.65,
      };
      // 2.5 models "think" by default; the thinking tokens eat the output
      // budget and produce empty replies, so disable it.
      if (model.startsWith('gemini-2.5')) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      let res;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig,
            }),
          }
        );
      } catch (e) {
        lastError = 'Upstream request failed.';
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const candidate = data.candidates?.[0];
        const text = (candidate?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (text) {
          const out = candidate.finishReason === 'MAX_TOKENS' ? `${text}…` : text;
          return json({ text: out }, 200, origin);
        }
        lastError = 'Empty response from model.';
        continue; // try next model
      }

      const err = await res.json().catch(() => ({}));
      lastError = err.error?.message || `Gemini error ${res.status}`;
      // Only fall through to the next model when this one is unavailable.
      if (res.status !== 404 && res.status !== 400) break;
    }

    return json({ error: lastError }, 502, origin);
  },
};
