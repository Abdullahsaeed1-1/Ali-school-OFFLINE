# Ali Public School — Management System

## OFFLINE CONVERSION REPO — read this first
This repo (`Ali-school-OFFLINE`) is a separate copy of the original online
project (`Abdullahsaeed1-1/Ali-school-main`), converted into a standalone
offline Windows desktop app — no Supabase, no Vercel, no Railway. The
original online repo is untouched and has its own accurate docs; don't
assume anything here applies back to it. Full conversion record (what
changed, why, live-verification evidence per phase): `docs/offline-conversion-plan.md`.

## What this project is
A multi-app system for Ali Public School (3 campuses: Junior, Girls, Boys) that replaces their fragile, error-prone Excel-based timetable with a real database-backed system — plus role-based apps for Admin, Teachers, and (later) Students/Parents.

## Repo layout (monorepo)
```
Ali-school-OFFLINE/
  CLAUDE.md         <- this file (project root, always loaded)
  docs/             <- deep reference material, see below
  Backend/          Node.js + Express + TypeScript + Prisma + SQLite
  web-admin/        React + Vite — admin panel, built as static files Backend serves
  desktop/          Electron — wraps Backend+web-admin+solver into one Windows .exe installer
  mobile-app/       Flutter — Teacher app first, Student/Parent later (out of scope for this offline conversion, untouched)
```
WebAdmin and the Electron desktop shell talk ONLY to `Backend`'s REST API — served from the same origin/port as the API itself (see `docs/offline-conversion-plan.md` Phase 4), not a separately hosted frontend. No app touches the database directly except `Backend`. This is the single source of truth for data and business logic.

## Tech stack
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, **SQLite** (was PostgreSQL/Supabase in the online repo — converted in Phase 1). SQLite has no native enum or JSON column type, so Prisma enums became app-validated `String` columns (`Backend/src/constants/enums.ts` holds the value definitions Prisma used to generate).
- **WebAdmin**: React + Vite, Tailwind CSS — built with a relative `VITE_API_BASE_URL=/api` (`.env.production`) so the same build works from any device on the LAN, not just the machine hosting it.
- **desktop/**: Electron main process spawns Backend (via a bundled portable Node executable) and the solver (a PyInstaller-packaged exe) as child processes, waits for both to be healthy, then opens a window pointed at Backend's own served page. Packaged into a Windows NSIS installer via `electron-builder`. Currently unsigned (deliberate, see `docs/deployment.md`).
- **mobile-app/**: Flutter (Dart) — out of scope for this offline conversion, not touched.
- **Auth**: JWT issued by Backend. A `User` table (`email`, `passwordHash`, `role`) is separate from curriculum-data tables — `role` is stored as a validated string (was a native Prisma enum before the SQLite conversion): `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. A `User` with role `TEACHER` links to a `Teacher` row via `teacherId`. Passwords hashed with bcrypt. (`STUDENT`/`PARENT` roles exist now so the schema doesn't need breaking changes later, but their features are not being built yet.) In the packaged desktop app, `JWT_SECRET`/`JWT_REFRESH_SECRET` are generated once on first run and persisted in the OS per-user app-data folder (`desktop/main.js`'s `config.json`), not read from a `.env` file.

## Phases
1. **Database + seed correction** (in progress) — schema and seed data are being corrected against the school's real Excel file, class by class. See `docs/excel-ground-truth.md`.
2. **Backend REST API** — CRUD endpoints + the Auto-Generate Timetable algorithm (conflict-free constraint solver: no teacher double-booked, no class double-booked, respects each class's required periods-per-week per subject).
3. **WebAdmin** — admin manages teachers/classes/subjects, triggers/reviews auto-generated timetables, adds new teachers etc.
4. **MobileApp (Teacher)** — teacher logs in, sees their current period and what's next, from their own schedule.
5. **Future, not yet designed**: Student/Parent portal — view syllabus, download books.

MobileApp is intended for both Google Play and the Apple App Store (not just one platform) — keep this in mind for any platform-specific code (push notifications, build config, etc.) so it doesn't need rework later for the second platform.

This list is a rough map, not a live checklist — ask Abdullah or check recent commits/conversation for what's actually done right now.

## Ground truth rule — important
The school's Excel file is the reference for what classes/subjects/teachers currently exist, but the Excel file itself has broken or missing data in several places (confirmed by directly reading its computed values, not by guessing). Full breakdown lives in `docs/excel-ground-truth.md`, with supporting data in `docs/*.json`.

**Never invent a number or a class that isn't backed by `docs/excel-ground-truth.md` or `docs/*.json`. If something is missing or unconfirmed, set `isActive: false` or leave a `// TODO: verify with school` comment — don't fill the gap with a plausible-looking guess.**

## Security baseline (non-negotiable from day 1)
This system stores real teacher/student personal data, so security is built in from the start, not patched on later. Full list in `docs/security-baseline.md` — the non-negotiable core:
- Passwords: bcrypt hashed, never logged, never returned in any API response, ever.
- Secrets (`DATABASE_URL`, `JWT_SECRET`, etc.) live only in `.env` files, never committed — confirm `.gitignore` covers this in Backend, WebAdmin, and MobileApp independently.
- **Never hardcode a secret, API key, or backend URL directly in source as a shortcut** (e.g. "just to get it working" during a fast iteration) — always read it from `.env`/config, even for throwaway test code. Hardcoded values are the single most common way an AI-assisted change quietly ships a credential or a dev-only URL into production; if you (Claude) catch yourself about to hardcode one, stop and use the existing env/config pattern instead.
- Every API endpoint checks the JWT's role **server-side** before acting. Hiding a button in the UI is not access control — the API must refuse the request on its own, regardless of which app called it.
- HTTPS only, no exceptions — **except** this offline app's LAN traffic, a deliberate, documented exception (no TLS cert for a LAN IP; see `docs/security-baseline.md` §4). Don't treat that exception as license to skip HTTPS anywhere else, including if/when the mobile app or a future hosted piece talks to a real domain.
- Login/auth endpoints are rate-limited — stop brute-force password guessing before it's a problem, not after.
- No managed-host backups here — SQLite is a single local file on whichever machine runs the app. The school is responsible for backing up their own data folder (OS per-user app-data path, see `docs/offline-conversion-plan.md` Phase 4); this isn't automated by anything in this repo yet.

**Before this system goes live for real (not just dev/testing), `docs/security-baseline.md` §11–14 must ALL be checked** — rate limiting, input validation, dependency vulnerabilities, error handling/information leakage, and file upload safety. This isn't done yet; treat it as a hard pre-launch gate, not optional polish.

## Before publishing to App Store / Play Store — non-negotiable
The Flutter app's `API_BASE_URL` is baked into the binary at **compile time** (via `envied`, reading `MobileApp/.env`) — it is not read at runtime, so changing the `.env` file after the app is built does nothing. Before any release build is submitted:
- `API_BASE_URL` must point to the real production backend over **HTTPS** — never `localhost` or a LAN IP. Rebuild after changing it.
- The Backend must actually be deployed and publicly reachable at that HTTPS domain (not just running on a dev laptop).
- iOS App Transport Security blocks plain HTTP by default (no exception is configured in this repo, and none should be added) — a non-HTTPS backend will fail silently on iOS release builds, not just get rejected by Apple review.
- Rotate `JWT_SECRET` / `JWT_REFRESH_SECRET` to real production values — the `.env` placeholders (`"change-this-in-production"`) must never ship.
- CORS (`WEBADMIN_ORIGIN` / `FLUTTER_WEB_ORIGIN`) only matters for browser-based calls (WebAdmin, Flutter Web) — native iOS/Android builds don't send an `Origin` header, so it doesn't gate them, but the HTTPS + real-domain requirements above still apply to native builds too.

See `docs/security-baseline.md` §8 for the full mobile production checklist.

## Conventions
- Abdullah (the developer) is a frontend-leaning final-year CS student who is still building up backend/database depth. Briefly explain non-trivial backend, database, or architecture decisions before implementing them — don't just silently do them and move on.
- Prefer small, reviewable changes over large rewrites.
- Match existing code style in whichever folder you're working in (Backend / WebAdmin / MobileApp each may have slightly different conventions).
- Keep this file short. If it starts exceeding ~150–200 lines, move detail into `docs/` and leave a pointer here instead.

## Where to look for more detail
- `docs/offline-conversion-plan.md` — the full record of this repo's conversion from the online (Supabase/Vercel/Railway) deployment to this offline desktop app: database migration, auth simplification, solver packaging, Electron packaging — what changed, why, and the live-verification evidence for each phase. Start here for anything about how this repo actually runs.
- `docs/security-baseline.md` — full security checklist (auth, secrets, RBAC, transport, input validation, mobile token storage, etc.)
- `docs/deployment.md` — short pointer to how this repo builds/distributes (Electron/NSIS installer) and the code-signing decision; full detail lives in `docs/offline-conversion-plan.md`
- `docs/excel-ground-truth.md` — which classes/campuses are confirmed-real vs broken/empty in the source Excel, exact period timings, periods-per-week per subject
- `docs/verification_needed.json` — exact list of things that need a real answer from the school before they can be safely coded
- `docs/girls_full_grid.json` / `docs/boys_classsubject.json` — extracted real schedule/curriculum data
- `Backend/prisma/schema.prisma` — current data model (source of truth for what's actually built, vs. this file's description of what's intended)
