/**
 * Cloudflare Pages Function — MedCross AI proxy
 * ------------------------------------------------------------------
 * Lives at  <your-pages-site>/api/ai  and keeps the Gemini key
 * server-side so it is never shipped to the browser.
 *
 * Because this file sits in functions/ in the repo, a git-connected
 * Cloudflare Pages project deploys it automatically on every push.
 *
 * REQUIRED: set an environment variable / secret in the Pages project
 *   Cloudflare dashboard → your Pages project → Settings →
 *   Environment variables → Add:  GEMINI_API_KEY = <your key>
 * then redeploy.
 *
 * Front-end contract (gemini.js → _callGeminiProxy):
 *   POST  { "prompt": string, "maxTokens": number, "source": "medcross" }
 *   200   { "text": string }
 *   4xx/5xx { "error": string }
 */

const ALLOWED_ORIGINS = [
  'https://harshagarwal06.github.io',
  'https://medcross-ai.pages.dev',
  'http://localhost:8790',
  'http://127.0.0.1:8790',
];

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

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  if (!env.GEMINI_API_KEY) {
    return json({ error: 'Proxy missing GEMINI_API_KEY env var.' }, 500, origin);
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
    // 2.5 models "think" by default; that eats the output budget and yields
    // empty replies, so disable it.
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
    } catch {
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
      continue;
    }

    const err = await res.json().catch(() => ({}));
    lastError = err.error?.message || `Gemini error ${res.status}`;
    if (res.status !== 404 && res.status !== 400) break;
  }

  return json({ error: lastError }, 502, origin);
}

// Friendly response for anyone opening the URL in a browser (GET).
export function onRequestGet() {
  return new Response('MedCross AI proxy is running. POST { prompt } here.', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
