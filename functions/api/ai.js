/**
 * Cloudflare Pages Function — MedCross AI proxy
 * ------------------------------------------------------------------
 * Lives at  <your-pages-site>/api/ai  and keeps the AI provider key
 * server-side so it is never shipped to the browser.
 *
 * Providers (tried in this order):
 *   1. Hugging Face Inference Providers router  (primary, if HF_TOKEN set)
 *      → model Qwen/Qwen2.5-72B-Instruct, OpenAI-compatible chat endpoint.
 *   2. Google Gemini                            (fallback, if GEMINI_API_KEY set)
 *
 * Because this file sits in functions/ in the repo, a git-connected
 * Cloudflare Pages project deploys it automatically on every push.
 *
 * REQUIRED: set an environment variable / secret in the Pages project
 *   Cloudflare dashboard → your Pages project → Settings →
 *   Environment variables → Add ONE of:
 *     HF_TOKEN        = hf_...        (recommended — open-source models)
 *     GEMINI_API_KEY  = ...           (fallback)
 *   then redeploy. You can set both; HF is used first, Gemini backs it up.
 *   Optional: HF_MODEL = <model id>  to override the default Qwen model.
 *
 * Front-end contract (gemini.js → _callAIProxy):
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

const HF_DEFAULT_MODEL = 'Qwen/Qwen2.5-72B-Instruct';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

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

// ── Hugging Face Inference Providers router (OpenAI-compatible) ───────────────
async function callHuggingFace(prompt, maxTokens, env) {
  const model = env.HF_MODEL || HF_DEFAULT_MODEL;
  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.HF_TOKEN}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: Math.min(Math.max(maxTokens * 2, 1024), 4096),
      temperature: 0.6,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`HF ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('HF returned an empty response.');
  return text;
}

// ── Google Gemini (fallback) ─────────────────────────────────────────────────
async function callGemini(prompt, maxTokens, env) {
  let lastError = 'Gemini request failed.';
  for (const model of GEMINI_MODELS) {
    const generationConfig = {
      maxOutputTokens: Math.max(maxTokens * 4, 1024),
      temperature: 0.65,
    };
    if (model.startsWith('gemini-2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig }),
        }
      );
    } catch {
      lastError = 'Gemini upstream request failed.';
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (text) return candidate.finishReason === 'MAX_TOKENS' ? `${text}…` : text;
      lastError = 'Gemini returned an empty response.';
      continue;
    }
    const err = await res.json().catch(() => ({}));
    lastError = err.error?.message || `Gemini error ${res.status}`;
    if (res.status !== 404 && res.status !== 400) break;
  }
  throw new Error(lastError);
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';

  if (!env.HF_TOKEN && !env.GEMINI_API_KEY) {
    return json({ error: 'Proxy has no AI provider configured (set HF_TOKEN or GEMINI_API_KEY).' }, 500, origin);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, origin);
  }

  const prompt = String(payload.prompt || '').trim();
  const maxTokens = Number(payload.maxTokens) || 280;
  if (!prompt) return json({ error: 'Missing prompt.' }, 400, origin);

  const errors = [];
  // 1) Hugging Face first (open-source models), 2) Gemini as backup.
  if (env.HF_TOKEN) {
    try {
      return json({ text: await callHuggingFace(prompt, maxTokens, env) }, 200, origin);
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (env.GEMINI_API_KEY) {
    try {
      return json({ text: await callGemini(prompt, maxTokens, env) }, 200, origin);
    } catch (e) {
      errors.push(e.message);
    }
  }
  return json({ error: errors.join(' | ') || 'AI request failed.' }, 502, origin);
}

// Friendly response for anyone opening the URL in a browser (GET).
export function onRequestGet(context) {
  const provider = context.env.HF_TOKEN ? 'Hugging Face (Qwen)' : context.env.GEMINI_API_KEY ? 'Gemini' : 'none configured';
  return new Response(`MedCross AI proxy is running. Provider: ${provider}. POST { prompt } here.`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
