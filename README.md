# FitLog (M003-1)

Sign-in required, shared-Gemini-key meal logger, cloud-synced.

- Live: `https://fitlog-koala.vercel.app`
- Repo: `https://github.com/cyyaddsg-git/m003-1-fitlog-new`
- Stack: static HTML + JS for the client, one Vercel serverless function (`api/gemini.ts`) for the Gemini proxy.

## Agent guidelines

Agents must read `AGENTS.md` before working in this project. It records the standing project-development access grant and the localhost testing rule.

House rule: use Git identity `cyyaddsg <cyy.addsg@gmail.com>` unless YY explicitly says otherwise.

Live release rule: Vercel deploys directly from this repo's `main` branch (the whole repo — there is no in-repo `rel/` subfolder). Locally, this repo lives at `git_proj/m003-fitlog-koala/dev/`. The sibling `git_proj/m003-fitlog-koala/rel/` is untracked by git — it is only ever an optional, timestamped backup copy of `dev/`, and is never a deploy source.

## Local development

```sh
# Local preview with /api/gemini proxy
npm run local
```

Assigned local review URL: `http://localhost:8000/`.

Click `open-localhost-safari.command` in this folder to open the assigned URL in Safari after the dev server is running. Firebase Auth treats `127.0.0.1` as a different authorized domain, so do not use the IP address for sign-in testing.

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

Before pushing, confirm the remote, branch, and staged diff. Never include unrelated migrated workspace changes.

### Required Vercel env vars (production + preview)

- `GEMINI_API_KEY` — Gemini API key from a dedicated AI-Studio account (kept server-side only)
- `FIREBASE_PROJECT_ID` — `fitlog-koala`

Set via `vercel env add <NAME> production` (and `preview` for previews). Never commit these.
