# MedCross AI Proxy

The public site (GitHub Pages) is static and cannot hold a secret. To make the
**AI Explain / Tutor** buttons work there without exposing your Gemini key, the
browser calls this small proxy instead of Google directly. The key lives only in
the proxy's server-side secret.

Locally nothing changes: `config.public.js` only activates the proxy on the
deployed host, so on `localhost` your gitignored `config.js` key is still used
directly.

## Deploy on Cloudflare Workers (free, ~5 minutes)

1. Sign in / create a free account at <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Worker.** Give it a name like `medcross-ai`,
   click **Deploy** once to create it.
3. **Edit code:** replace the starter with the contents of
   [`cloudflare-worker.js`](cloudflare-worker.js), then **Deploy**.
4. Copy the Worker URL shown (e.g.
   `https://medcross-ai.your-subdomain.workers.dev`).
5. **Settings → Variables and Secrets → Add → Secret (encrypted):**
   - Name: `GEMINI_API_KEY`
   - Value: your Google AI Studio key (the one from your local `config.js`)
   - Save and **Deploy** again so the secret is picked up.
6. In the repo, open [`../config.public.js`](../config.public.js) and set
   `PROXY_URL` to your Worker URL. Commit and push.
7. (Recommended) In `cloudflare-worker.js`, keep `ALLOWED_ORIGINS` limited to
   `https://harshagarwal06.github.io` so only your site can use the proxy.

## Verify

Open the live puzzle page, start a puzzle, select a clue, and click **AI
Explain**. You should get a response. In DevTools → Network you'll see the
request go to your `*.workers.dev` URL — the Gemini key is never in the page.

## Request contract

```
POST <proxy>
  { "prompt": string, "maxTokens": number, "source": "medcross" }
→ 200 { "text": string }
→ 4xx/5xx { "error": string }
```

## Other options

The same contract works on **Netlify Functions** or **Vercel Functions** if you
prefer — the body in/out is identical; only the handler wrapper differs. The
older FastAPI version in [`../ai/server.py`](../ai/server.py) is for running a
proxy locally and is not needed for the static deploy.
