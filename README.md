# FitLog (M003-1)

Static, BYOK Gemini, cloud-synced meal logger.

- Live: `https://fitlog-koala.vercel.app`
- Repo: `https://github.com/cyyaddsg-git/m003-1-fitlog-new`
- Stack: plain HTML + JS, no build step.

## Local development

```sh
# Open directly in browser
open ./index.html
# Or serve over HTTP
python3 -m http.server 8765
```

## Features

- **Profile & Sync** — Sign in with Google to sync your logs, library, and settings across all your devices via Firebase.
- **30-day History** — Automatic 30-day retention for food and gym logs to keep data lightweight and within free tier limits.
- **FoodLog tab** — Describe a meal in any language, Send → Gemini returns a JSON nutrition table. Log items to your daily record and save them to your FoodLibrary.
- **FoodLibrary tab** — Manage your personal food database. Items saved here are used by Gemini to improve estimation accuracy.
- **GymLog tab** — Structured workout logging for weight training and cardio.
- **BYOK Gemini** — Paste your own Gemini API key in Settings. Stored locally and synced to your account.

## Deploying

Linked to Vercel project `fitlog-koala` under cyyaddsg-git. Pushes to `main` deploy automatically.

