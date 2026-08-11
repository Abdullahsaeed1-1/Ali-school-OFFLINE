# Deployment — offline desktop distribution

This repo is the offline conversion of Ali Public School's management
system: a standalone Windows desktop app instead of a cloud deployment.
See `docs/offline-conversion-plan.md` for the full conversion record
(what changed, why, and the live verification evidence for each phase) —
this file is a short pointer to the current state, not a duplicate of it.

## What this repo deploys to

Nothing hosted — a Windows `.exe` installer (`desktop/`, Electron +
electron-builder, NSIS target). One machine on the school's local network
runs the app; its Backend serves both the API and WebAdmin's static build
from one port, reachable from any other device on that LAN via a normal
browser at `http://<host-machine-IP>:<port>` — not just from the host's
own Electron window. SQLite, not a hosted Postgres — each installation
owns its own local database file under the OS's per-user app-data folder,
created and seeded automatically on first launch. Full architecture and
the reasoning behind each piece: `docs/offline-conversion-plan.md`.

## Building the installer

From `desktop/`:
```
npm run dist
```
Requires `Backend/dist` (`npm run build` in `Backend/`), `web-admin/dist`
(`npm run build` in `web-admin/`, which must use `.env.production`'s
relative `VITE_API_BASE_URL=/api` — an absolute dev URL baked in here
breaks LAN access), the solver packaged per `Backend/solver/requirements-build.txt`,
and the portable Node runtime (`desktop/scripts/fetch-node-runtime.mjs`,
not committed).

## Code signing — deliberately not done yet

The installer is unsigned. Every `electron-builder` build step logs "no
signing info identified, signing is skipped" — expected, not an oversight.
Decision: stay unsigned while still actively testing and changing things;
buy and wire in a real code-signing certificate once the app is finalized,
not before (signing costs money and an unsigned dev build gets rebuilt
often). Unsigned means Windows SmartScreen will warn on first run on
other machines, and Windows Defender real-time-scans the fresh executable
on first launch (observed ~20-60s added to first startup — the readiness
timeouts in `desktop/main.js` account for this, see
`docs/offline-conversion-plan.md` Phase 4).

## What this repo does NOT deploy to

No Supabase, no Vercel, no Railway — those were the *original* online
deployment's choices (`Abdullahsaeed1-1/Ali-school-main`, a separate
repo, untouched by this offline conversion). If you're looking for that
deployment's decisions, this isn't the repo — check the online repo's own
docs.
