# FitLog (M003-1)

Sign-in required, shared-Gemini-key meal logger, cloud-synced.

- Live: `https://fitlog-koala.vercel.app`
- Repo: `https://github.com/cyyaddsg-git/m003-1-fitlog-new`
- Stack: static HTML + JS for the client, one Vercel serverless function (`api/gemini.ts`) for the Gemini proxy.

## Local development

```sh
# Local preview with /api/gemini proxy
vercel dev --listen 8000
```

For local meal preview, open the header Settings page and paste a Gemini API key into BYOK. When BYOK is saved, FitLog calls Google directly from this browser. If BYOK is blank, the app uses the host `/api/gemini` proxy, which requires `GEMINI_API_KEY` and `FIREBASE_PROJECT_ID=fitlog-koala` in `.env.local`.

## Features

- **Mandatory Google sign-in** — entire app is gated behind a Welcome page until signed in.
- **Shared Gemini key via server proxy** — `api/gemini.ts` holds the key as an env var and verifies the caller's Firebase ID token. No API key is ever exposed in the browser.
- **Cloud sync** — logs, library, and non-secret settings synced to Firestore on every change. BYOK stays local to the browser.
- **30-day History** — Automatic 30-day retention for food and gym logs.
- **FoodLog tab** — KOALA TABLE supports J Koala preview-confirm mode and P Koala direct-log mode; EAT sends the estimate/log request using BYOK first, host proxy second.
- **Settings (header button)** — Gemini model/BYOK, default J/P Koala mode, and dark/light appearance.
- **KOALA STOMACH** — One expandable day summary with latest meal groups first.
- **Saved food library** — Personal food data is used behind the scenes to improve estimates.
- **GymLog tab** — Structured workout logging for weight training and cardio.
- **Profile (header avatar)** — Body Metrics, BMI/BMR/TDEE, target macros. First sign-in lands here so the user can fill in basics.

## Deploying

Linked to Vercel project `fitlog-koala` under cyyaddsg-git. Pushes to `main` deploy automatically.

### Required Vercel env vars (production + preview)

- `GEMINI_API_KEY` — Gemini API key from a dedicated AI-Studio account (kept server-side only)
- `FIREBASE_PROJECT_ID` — `fitlog-koala`

Set via `vercel env add <NAME> production` (and `preview` for previews). Never commit these.
