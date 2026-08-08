# Ali Public School — Management System

## What this project is
A multi-app system for Ali Public School (3 campuses: Junior, Girls, Boys) that replaces their fragile, error-prone Excel-based timetable with a real database-backed system — plus role-based apps for Admin, Teachers, and (later) Students/Parents.

## Repo layout (monorepo)
```
ali-school-timetable/
  CLAUDE.md         <- this file (project root, always loaded)
  docs/             <- deep reference material, see below
  Backend/          Node.js + Express + TypeScript + Prisma + PostgreSQL
  WebAdmin/         React + Vite — admin panel (web, domain bought later)
  MobileApp/        Flutter — Teacher app first, Student/Parent later
```
All apps talk ONLY to `Backend`'s REST API. No app touches the database directly except `Backend`. This is the single source of truth for data and business logic.

## Tech stack
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL
- **WebAdmin**: React + Vite, Tailwind CSS
- **MobileApp**: Flutter (Dart) — calls Backend over REST/JSON
- **Auth**: JWT issued by Backend. A `User` table (`email`, `passwordHash`, `role`) is separate from curriculum-data tables — `role` is an enum: `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. A `User` with role `TEACHER` links to a `Teacher` row via `teacherId`. Passwords hashed with bcrypt. (`STUDENT`/`PARENT` roles exist in the enum now so the schema doesn't need breaking changes later, but their features are not being built yet.)

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
- All production traffic over HTTPS only, no exceptions.
- Login/auth endpoints are rate-limited — stop brute-force password guessing before it's a problem, not after.
- Database has automated backups turned on once real school data is in it (most managed Postgres hosts offer this — confirm it's actually enabled, don't assume).

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
- `docs/security-baseline.md` — full security checklist (auth, secrets, RBAC, transport, input validation, mobile token storage, etc.)
- `docs/deployment.md` — hosting decisions made so far (Supabase region, WebAdmin host) and open ones (Backend/solver host) — includes a real latency finding that constrains the Backend hosting choice, don't pick a region without checking it first
- `docs/excel-ground-truth.md` — which classes/campuses are confirmed-real vs broken/empty in the source Excel, exact period timings, periods-per-week per subject
- `docs/verification_needed.json` — exact list of things that need a real answer from the school before they can be safely coded
- `docs/girls_full_grid.json` / `docs/boys_classsubject.json` — extracted real schedule/curriculum data
- `Backend/prisma/schema.prisma` — current data model (source of truth for what's actually built, vs. this file's description of what's intended)
