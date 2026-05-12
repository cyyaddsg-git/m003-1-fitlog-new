# FitLog (M003-1)

Sign-in required, shared-Gemini-key meal logger, cloud-synced.

- Live: `https://fitlog-koala.vercel.app`
- Repo: `https://github.com/cyyaddsg-git/m003-1-fitlog-new`
- Stack: static HTML + JS for the client, one Vercel serverless function (`api/gemini.ts`) for the Gemini proxy.

## Local development

```sh
# Static-only preview (no proxy)
python3 -m http.server 8765
# Full preview with proxy
vercel dev
```

## Features

- **Mandatory Google sign-in** — entire app is gated behind a Welcome page until signed in.
- **Shared Gemini key via server proxy** — `api/gemini.ts` holds the key as an env var and verifies the caller's Firebase ID token. No API key is ever exposed in the browser.
- **Cloud sync** — logs, library, settings synced to Firestore on every change. Sync status shown italic at the top of the Profile page.
- **30-day History** — Automatic 30-day retention for food and gym logs.
- **FoodLog tab** — Describe a meal in any language, Send → Gemini returns a JSON nutrition table.
- **FoodLibrary tab** — Personal food database, used by Gemini to improve estimates.
- **GymLog tab** — Structured workout logging for weight training and cardio.
- **Profile (header avatar)** — Body Metrics, BMI/BMR/TDEE, target macros. First sign-in lands here so the user can fill in basics.

## Deploying

Linked to Vercel project `fitlog-koala` under cyyaddsg-git. Pushes to `main` deploy automatically.

### Required Vercel env vars (production + preview)

- `GEMINI_API_KEY` — Gemini API key from a dedicated AI-Studio account (kept server-side only)
- `FIREBASE_PROJECT_ID` — `fitlog-koala`

Set via `vercel env add <NAME> production` (and `preview` for previews). Never commit these.

