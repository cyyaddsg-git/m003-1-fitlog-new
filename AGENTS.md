# Project Guidelines

Every agent working in M003-1 FitLog must read this file before doing anything else.

## Access During Development

- The project owner grants agents full access needed for project development inside this project directory.
- Do not pause to ask for routine project-local file, test, dev-server, localhost, Git, or Vercel access unless the runtime permission system explicitly requires approval.
- Still protect secrets: never print `.env.local`, Gemini keys, Firebase credentials, user data, BYOK values, or auth tokens.

## Local Testing

- Assigned local review URL: `http://localhost:8000/`.
- Click `open-localhost-safari.command` in this folder to open the assigned URL in Safari after the dev server is running.
- Start local review with `npm run local`; the script is pinned to port `8000`.
- Do not give `127.0.0.1` URLs to the user for sign-in testing. Firebase Auth treats `localhost` and `127.0.0.1` as different authorized domains, and using the IP address has repeatedly caused avoidable "domain is not authorized" failures.
- Before presenting local review, verify the localhost URL returns HTTP 200.
- For changes touching browser audio, auth, sync, release UI, or Vercel functions, verify locally before pushing live.

## Release Changelog

- For every version pushed live, append an entry to `CHANGELOG.md` in this active dev folder.
- Keep entries simple:
  - `version: <version>`
  - `agent: <push to live agent name>`
  - `change: <summary>`
