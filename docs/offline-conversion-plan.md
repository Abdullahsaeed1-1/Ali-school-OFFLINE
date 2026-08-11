# Offline conversion plan

This repo was copied from the original online deployment (`Ali-school-main`,
Vercel + Railway + Supabase) to become a standalone offline Windows desktop
app. Original repo/deployment is untouched. This doc records the plan agreed
with the client and tracks progress phase by phase — update status lines as
work lands, don't rewrite history.

Origin now points at `github.com/Abdullahsaeed1-1/Ali-school-OFFLINE`
(pushed 2026-08-11).

## Target shape

One machine on the school's local network runs the app (Electron, installed
via a Windows `.exe`). That machine's Node backend serves **both** the API
and the built WebAdmin static files from a single Express app/port, bound to
the machine's LAN interface (not just loopback). Other staff laptops on the
same network reach it from a plain browser at `http://<host-machine-LAN-IP>:PORT`
— no Electron install needed on those secondary machines. Always single-user
at any given moment (no concurrency to design for), but the *host* may change
over time and needs to be reachable from whichever devices are in the room
that day. The Python/OR-Tools solver runs as a locally-spawned subprocess,
loopback-only, invoked by the Node backend exactly as it is today.

This shapes several decisions below that would otherwise default to
"loopback-only, same-origin" for a pure single-machine app — the LAN
requirement means bind address, CORS, and cookie settings all need to account
for the fact that the frontend and API are same-origin **to every device on
the LAN**, not just to the host.

## Phase 1 — Database: Postgres → SQLite (first, everything else depends on it)

**Status: done (2026-08-11).**

Turned out bigger than planned once real validation ran: **SQLite has no
native enum type AND no native Json type at all** (not a version issue —
SQLite itself has no such column types, so Prisma's SQLite connector
rejects both regardless of Prisma version). The original plan assumed
Prisma would emulate enums as validated strings on SQLite the way it does
on other connectors — that assumption was wrong, caught immediately by
`prisma migrate dev` refusing to validate the schema. Actual work done:

1. All 7 enums (`CampusType`, `Role`, `SubjectTier`, `HiringStatus`,
   `TeacherStatus`, `DayOfWeek`, `LoadStatus`) converted from native Prisma
   enums to plain `String` columns. Validation moved to the application
   layer: `Backend/src/constants/enums.ts` now hand-declares the same
   const-object + union-type shape Prisma used to auto-generate (e.g.
   `Role.ADMIN`), so every call site that did `import { Role } from
   '@prisma/client'` only needed its import path swapped to
   `'../constants/enums.js'` — no logic changes. Updated 9 files across
   controllers/services/middleware plus `prisma/seed-admin.ts`.
2. `Class.gamesProtectedLectures` (native Postgres `Int[]`) converted to a
   `String` column (not `Json` — SQLite doesn't support that type either),
   storing JSON-encoded text. New helpers
   `Backend/src/utils/gamesProtection.ts`
   (`parseGamesProtectedLectures`/`serializeGamesProtectedLectures`)
   centralize the (de)serialization; used at every read/write site in
   `classes.controller.ts`, `timetableGenerator.ts`,
   `gamesDutyScheduler.ts`, and `prisma/seed.ts`. The public API contract
   is unchanged — `gamesProtectedLectures` is still a real JSON array in
   every request/response body, only the DB column type changed.
3. Found and fixed one genuine Postgres-only query feature the original
   research pass missed (it checked schema-level features, not query-level
   ones): `teachers.controller.ts`'s search used `mode: 'insensitive'` on
   `contains` filters, which SQLite's Prisma connector doesn't support at
   all (that's Postgres/MySQL-only). Removed it — SQLite's `contains` is
   already case-insensitive by default for ASCII text, so search behavior
   is unchanged (verified: `?search=maimoona` and `?search=MAIMOONA` both
   return the same match).
4. `Backend/prisma/schema.prisma` datasource flipped to
   `provider = "sqlite"`, `url = env("DATABASE_URL")`. `directUrl` dropped
   entirely (only existed for Supabase's pgbouncer pooler, meaningless for
   a local file).
5. Migration history reset rather than ported — the 14 old migrations
   contained Postgres-only SQL (`CREATE TYPE ... AS ENUM`, an `INTEGER[]`
   array literal) that SQLite's migration engine can't run. No real school
   data existed in this offline copy, so this was safe: deleted
   `Backend/prisma/migrations/`, generated one fresh baseline
   (`20260811121347_init_sqlite`) via `prisma migrate dev`.
6. `Backend/.env`: `DATABASE_URL` now `file:./dev.db` (relative to
   `Backend/prisma/`), `DIRECT_URL` and the Supabase comment block removed.
   `Backend/.gitignore` updated to exclude `prisma/*.db` and
   `prisma/*.db-journal` (each machine gets its own local file — never
   committed).
7. Verified end-to-end against the real seed data: `npm run db:seed` +
   `npm run db:seed-admin` both ran clean, `tsc --noEmit` passes with zero
   errors, and a live server round-trip confirmed login (`role: "ADMIN"`
   correctly returned as a string), campus listing (`type: "JUNIOR"`), and
   class listing (`gamesProtectedLectures: [4]` — a real array, not a raw
   JSON string, confirming the serialize/parse helpers work correctly at
   the API boundary).
8. DB file location: current dev-mode file lives at `Backend/prisma/dev.db`
   like a normal local dev DB. Production location (Electron's per-user
   `userData` path, not inside the install directory) is wired up in
   Phase 4, not yet.

**Note unrelated to this task, surfaced during verification**: this
machine has ~12 leftover `tsx watch` processes from the *original*
`Ali-school-timetable` repo still running in the background (pre-existing,
not caused by this conversion work) — harmless but worth a manual
`taskkill`/reboot at some point to reclaim resources. Not touched here since
they belong to a different repo.

### Live feature verification (2026-08-11)

Schema/API-level checks aren't enough to trust a database migration — ran
the actual features end-to-end against the real solver, same standard as
the original build. Backend (`npm run dev`) + solver (`uvicorn main:app`,
port 8002 — 8001 was already held by a leftover process from the original
repo, unrelated) both started clean; logged in as the seeded admin.

- **Generate Timetable, all 3 campuses in one call** (`POST
  /api/timetable/generate`, no `campusId`): `200 OK` in 56s total (Junior
  5.1s solve / Girls 20.5s / Boys 29.4s — solver's own CP-SAT time, roughly
  matching the documented Postgres-era baseline; total wall time is far
  better now since DB round-trips are local instead of crossing to Seoul).
  `conflicts: []`. Directly queried the resulting 1101 active
  `TimetableEntry` rows (not just the response summary): **zero class
  double-bookings, zero real teacher double-bookings** (Games-duty rows,
  where the same teacher legitimately covers multiple classes on one
  ground at once, correctly excluded from that check), all 33 active
  classes present. The reported shortfalls (Games duty gaps, a few
  under-target teachers) are genuine curriculum/staffing gaps consistent
  with the known baseline pattern, not new symptoms.
- **Whole-class lock**: locked Girls class "1A" (`PATCH /api/classes/:id
  {isLocked:true}`), regenerated Girls campus — response's `classesLocked:
  1`, "1A" correctly absent from the per-class breakdown. Direct DB diff of
  1A's entries before vs. after: **byte-identical**. Unlocked afterward.
- **Single-period granular lock**: locked one specific (class, day,
  period) slot for 1A via `PATCH /api/timetable/slot/lock`, regenerated
  Girls again. That exact slot's subject/teacher stayed identical; every
  *other* slot in 1A changed (proving the rest of the class actually
  regenerated around the lock, not that nothing moved). Zero conflicts
  introduced. Unlocked afterward.
- **Teacher-day lock**: bulk-locked one teacher's Monday (`PATCH
  /api/teachers/:id/lock-day`), regenerated Girls again. All 5
  originally-locked rows stayed byte-identical and still `isLocked: true`.
  Two *new*, unlocked rows appeared for that teacher elsewhere in her
  Monday — initially looked suspicious, traced it to the endpoint's own
  doc comment: it freezes existing rows only ("every other day stays
  fully open" — the same is true within the locked day for periods that
  weren't already hers), it was never a full-day-blackout lock. Confirmed
  this is pre-existing, documented behavior unrelated to the SQLite
  conversion, not a regression. Zero conflicts introduced. Unlocked
  afterward.
- **CRUD**: created + edited a Subject (`tier` string round-trips), a
  Teacher (`status`/`hiringStatus` strings round-trip, optimistic
  concurrency via `expectedUpdatedAt` works), and a Class with
  `gamesProtectedLectures: [2,5]` → edited to `[3,6,7]` (confirms the
  Json→serialized-String conversion round-trips correctly through a live
  create *and* edit, not just seed data).
- **Cleanup**: reseeded (`db:seed` + `db:seed-admin`) to wipe test
  Classes/Teachers, manually removed the one test Subject `seed.ts`
  doesn't touch (it upserts by name, never deletes). Verified final counts
  match pristine seed state: 33 classes, 37 teachers, 21 subjects, 0
  timetable entries. All test processes (backend, solver) stopped
  afterward — confirmed no `Ali-school-OFFLINE` node/python processes
  remained running.

## Phase 2 — Auth: simplify for LAN, single-machine-at-a-time use

**Status: not started.**

1. Cookies become same-origin to every client, whether that client is the
   host machine's own Electron window or another laptop's browser hitting
   the host's LAN IP — because the backend serves both the API and the
   static frontend from one origin. `SameSite=Lax` always, no more
   `NODE_ENV`-branched `SameSite=None`/`Secure` logic (that existed
   specifically for the Vercel↔Railway cross-domain case, which no longer
   exists here).
2. `secure: true` requires HTTPS. LAN traffic here is plain HTTP (no TLS
   cert for a LAN IP) — `secure: false` permanently. **Known, accepted
   limitation, not a bug**: auth cookies travel unencrypted on the local
   network segment. Acceptable for a school LAN; call out in
   `docs/security-baseline.md` as a documented offline-mode exception to
   the "HTTPS only" rule, not a silent gap. Self-signed cert / mkcert for
   LAN HTTPS is possible future hardening, not required for v1.
3. Multiple staff on one PC/session: today's model (one `refreshToken` per
   `User` row, login/logout per account) already handles this — no schema
   change needed. Confirm logout fully clears cookies + DB token so the
   next person isn't left in someone else's session.
4. **Decision confirmed: wire up `JWT_REFRESH_SECRET` properly.** It's
   currently defined in `.env`/docs but never read — refresh tokens are
   signed with `JWT_SECRET`, same as access tokens. Full correct fix: add
   a `getJwtRefreshSecret()` helper alongside the existing
   `getJwtSecret()` in `auth.controller.ts`, sign refresh tokens with it
   at issuance, verify with it in the `/refresh` handler and anywhere else
   a refresh token is decoded. Update `.env`/docs to match actual
   behavior once this lands (they already describe the intended
   two-secret design — code needs to catch up to the docs, not the other
   way around).
5. CORS: with same-origin static+API serving, cross-origin `fetch`/XHR
   from a browser is no longer the access pattern — CORS becomes largely
   moot for the desktop app itself. Plan to drop `WEBADMIN_ORIGIN`-style
   origin-checking for this app; revisit only if `FLUTTER_WEB_ORIGIN`-style
   LAN access from the mobile app's web build is ever wanted (out of scope
   for this conversion).
6. Rate limiting on `/login` stays as-is — still valuable on a shared
   LAN-accessible app.

## Phase 3 — Solver: hosted microservice → local subprocess

**Status: not started.**

1. Keep the existing FastAPI/HTTP shape (Node still calls `fetch()` against
   `localhost:8001`) rather than rewriting to a stdin/stdout subprocess
   protocol — smallest change, `solve.py`/`duty_solve.py` untouched.
2. Package the Python solver as a standalone executable (PyInstaller
   onefile bundling `fastapi`+`uvicorn`+`ortools`) so end users don't need
   Python installed.
3. Electron's main process spawns this exe on app launch, **loopback-only**
   (`127.0.0.1`, not the LAN interface — no reason to expose the solver
   itself to the network), and kills it on app quit. `SOLVER_SERVICE_URL`
   keeps pointing at it exactly as today.
4. Add timeout/retry to the two `fetch()` call sites
   (`Backend/src/services/timetableGenerator.ts`,
   `Backend/src/services/gamesDutyScheduler.ts`) — currently neither has
   one, tolerable against an always-on hosted service but a real failure
   mode once solver startup is a race on every app launch. Add a
   `/health`-poll readiness check before the first solve request.

## Phase 4 — Electron packaging

**Status: not started.**

1. New `desktop/` folder holding the Electron main process.
2. **Backend runs as a spawned child process using a real Node executable,
   not `require()`'d in-process inside Electron's main** — avoids Prisma's
   native query-engine binary needing to match Electron's bundled
   Node/V8 ABI, a real compatibility trap otherwise. Affects
   `binaryTargets` in `schema.prisma` and electron-builder's
   `extraResources` (needs to bundle `Backend/dist` + `node_modules` +
   the Prisma engine binary + the solver's PyInstaller exe).
3. **Decision confirmed: local static server, not `loadFile`.** Backend's
   Express app serves the built `web-admin/dist/` as static files (SPA
   fallback to `index.html`, same rewrite behavior as today's
   `vercel.json`) alongside its existing `/api` routes, all on one port.
   Electron's own `BrowserWindow` loads `http://localhost:PORT` on the
   host machine; other staff laptops on the LAN open a normal browser to
   `http://<host-LAN-IP>:PORT` directly.
4. Bind the Express server to `0.0.0.0` (or explicitly enumerate the LAN
   interface) so other devices on the network can actually reach it —
   this reverses the loopback-only assumption that would otherwise apply
   to a single-machine app, precisely because of the LAN-access
   requirement. Windows Defender Firewall will likely prompt to allow the
   app through on first LAN-accessible run — expect and document that in
   install instructions, not a bug to fix.
5. First-run flow: if the SQLite file doesn't exist in `userData`, run
   migrations against it and seed the admin account.
6. `electron-builder` config targeting a Windows NSIS installer (`.exe`).

## Phase 5 — Cleanup

**Status: not started.**

1. `docs/deployment.md` documents Supabase region + Vercel/Railway
   topology that no longer applies — update or archive once Phases 1-4
   are working, not before (don't invalidate the historical record while
   still mid-migration).
2. Root `CLAUDE.md` references Vercel/Railway/Supabase throughout — update
   after the conversion is actually working, not as a blocking step.
3. Remove now-dead env vars (`DIRECT_URL`; `WEBADMIN_ORIGIN`/
   `FLUTTER_WEB_ORIGIN` per the Phase 2 CORS decision above).
4. `mobile-app/` is untouched by any of this — out of scope, keeps
   pointing at whatever backend deployment (if any) is decided for it
   separately in the future.

## Open items carried forward (not blocking, revisit later)

- LAN traffic is unencrypted HTTP by design (Phase 2, item 2) — accepted
  for v1, optional TLS hardening later if the client wants it.
- File upload/storage: not built yet anywhere in the app (confirmed by
  code search) — nothing to migrate now, but if/when it's built, target
  local disk under the same `userData`-style path, not cloud storage,
  matching the rest of the offline design.
