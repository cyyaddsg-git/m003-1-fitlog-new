# FitLog (M003-1) — V1

Static, BYOK Gemini, single-device meal logger. Eventually replaces M003 (`fitlog-pwa.vercel.app`) once Profile + auth + DB land in V2.

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

Paste your Gemini API key into Settings (top-right). Get one at <https://aistudio.google.com/apikey>. The key is stored only in your browser's localStorage.

## Deploying

Linked to Vercel project `fitlog-koala` under cyyaddsg-git. Pushes to `main` deploy automatically.

## What's in V1

- **Logging tab** — describe a meal in any language, Send → Gemini returns a JSON nutrition table. Pick a meal slot (Breakfast / Lunch / Dinner / Snack), Log → appended to today's Daily Log. Each preview row has a "+ Library" button.
- **Library tab** — per-item saved entries (item, brand, qty, unit, kcal, p, f, c, su, fb). Used by the Send flow to inject `LIBRARY_CONTEXT` into the Gemini prompt so matched items reuse saved values verbatim.
- **Daily Log** — today only, expandable Breakfast / Lunch / Dinner / Snack rows + Total + (V2) Target / Remain.

## Out of scope for V1

Profile tab, Google sign-in, Target / Remain math, Supabase sync, PWA / offline, edit-logged-meal flow.

See `../plan/spec.md` for full spec.
