# MedCross AI Proxy

The public site (GitHub Pages) is static and cannot hold a secret. To make the
**AI Explain / Tutor** buttons work there without exposing your Gemini key, the
browser calls this small proxy instead of Google directly. The key lives only in
the proxy's server-side secret.

Locally nothing changes: `config.public.js` only activates the proxy on the
deployed host, so on `localhost` your gitignored `config.js` key is still used
directly.

---

## ✅ Recommended: Cloudflare Pages Function (matches the current setup)

You already have a Cloudflare **Pages** project at `medcross-ai.pages.dev`. The
proxy now ships as a **Pages Function** at [`../functions/api/ai.js`](../functions/api/ai.js),
so it deploys on that same domain automatically — no separate Worker needed.

**Two steps to finish:**

1. **Set the key as a secret on the Pages project.**
   Cloudflare dashboard → your Pages project (`medcross-ai`) → **Settings →
   Environment variables → Add variable**:
   - Name: `GEMINI_API_KEY`
   - Value: your Google AI Studio key
   - Add it to **Production** (and Preview if you use it), **Encrypt**, Save.

2. **Redeploy so the function + secret go live.**
   - If the Pages project is **connected to the GitHub repo**: just push (the
     latest commit already adds `functions/api/ai.js`), then in the Pages
     project hit **Retry deployment** if it didn't auto-build.
   - If you deployed by **manual upload**: re-upload the project folder so the
     `functions/` directory is included.

The proxy endpoint becomes `https://medcross-ai.pages.dev/api/ai`, which
`config.public.js` already points to. Open the endpoint in a browser — a GET
shows "MedCross AI proxy is running."

> **Note:** GitHub Pages (`harshagarwal06.github.io/medcross`) cannot run
> functions, so the AI calls from *either* site are routed to the Cloudflare
> `pages.dev` function above. CORS already allows both origins.

---

## Alternative: standalone Cloudflare Worker

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
