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

**Status: done (2026-08-11).**

1. `Backend/src/controllers/auth.controller.ts`: `setAuthCookies` (login)
   and the `/refresh` handler's cookie-setting no longer branch on
   `NODE_ENV` — always `SameSite=Lax`, `Secure=false` now. The old
   `isProduction`-gated `SameSite=None`/`Secure=true` existed solely to
   route around Vercel↔Railway being different registrable domains, which
   no longer applies. Extracted the duplicated single-cookie logic in
   `/refresh` into a shared `setAccessTokenCookie` helper.
2. **`JWT_REFRESH_SECRET` wired up properly** (was declared in
   `.env`/docs but never read — refresh tokens were signed with
   `JWT_SECRET`, same as access tokens). Added `getJwtRefreshSecret()`
   alongside the existing `getJwtSecret()`; refresh tokens are now signed
   at login and verified at `/refresh` and `/logout` with their own
   dedicated secret, not the access-token one.
3. Multi-staff-per-machine: confirmed the existing one-`refreshToken`
   -per-`User`-row model already handles this correctly with no schema
   change — verified live below.

### Live verification (2026-08-11)

- `tsc --noEmit`: clean.
- **Cookie flags**: logged in, inspected raw `Set-Cookie` headers —
  confirmed `SameSite=Lax` with no `Secure` flag on both `accessToken` and
  `refreshToken`, matching the new policy exactly (no more
  environment-dependent branching).
- **Refresh token uses its own secret**: extracted the issued
  `refreshToken` and verified it directly with `jsonwebtoken` — rejected
  by the access-token secret (`invalid signature`), accepted by the
  dedicated refresh secret. Confirms access and refresh tokens are no
  longer interchangeable.
- **Full auth cycle**: `POST /refresh` → `200`, `GET /me` immediately
  after → returns the correct user, `POST /logout` → `200`, `POST
  /refresh` again after logout → `401` (DB-stored refresh token hash
  correctly cleared, old cookie can't be replayed).
- **Multi-account, same machine** (the actual motivating case for this
  phase): gave a seeded teacher an email + login credentials, logged them
  in on a *separate* cookie jar while the admin's session (a different
  cookie jar) stayed active. Both `GET /me` calls returned the correct,
  distinct user simultaneously. Logged the teacher out — their session
  correctly returned `401` afterward, while the admin's session,
  untouched, still returned `200`. Confirms one staff member's
  login/logout has zero effect on another's concurrent session on the
  same computer.
- Cleanup: reseeded to remove the test teacher's email/login account
  (`seed.ts` wipes `Teacher`/linked `User` rows on every run, so this
  fully restores pristine state — unlike Phase 1's stray Subject, nothing
  needed manual removal here).

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

**Status: done (2026-08-11) for the solver executable and Node-side
robustness. The actual spawn-on-launch/kill-on-quit wiring into an app
lifecycle is Phase 4's job (Electron doesn't exist yet) — what's proven
here is that the mechanism itself works correctly, standalone.**

1. Kept the existing FastAPI/HTTP shape — `solve.py`/`duty_solve.py`
   untouched. `Backend/solver/run_frozen.py` is a new standalone entrypoint
   (`uvicorn.run(app, ...)` called programmatically) since a frozen exe has
   no `uvicorn` CLI to resolve `main:app` against.
2. Packaged with PyInstaller as `Backend/solver/dist/aps-solver/` —
   **`--onedir`, not `--onefile`.** `--onefile` was tried first and
   technically "worked," but its bootloader extracts to a temp dir and
   re-launches the real program as a *child* process — killing the PID a
   spawner gets only kills the bootloader, leaving the actual solver
   process (and its held port) orphaned. Confirmed this failure mode
   directly (see verification below) before switching to `--onedir`, whose
   exe *is* the real process — no relaunch, no orphan.
3. `--add-binary` required to actually bundle ortools's native DLLs
   (`ortools.dll`, `abseil_dll.dll`, `libprotobuf.dll`, etc.) — PyInstaller's
   dependency scanner doesn't find them on its own since they live in
   `ortools/.libs/`, not next to the `.pyd` files that import them. Without
   this the exe builds "successfully" but crashes immediately on launch
   with `DLL load failed`. Full build command and rationale in
   `Backend/solver/requirements-build.txt`.
4. `Backend/src/utils/solverClient.ts` (new): centralizes both solver call
   sites (`timetableGenerator.ts`, `gamesDutyScheduler.ts`) behind
   `solveTimetable()`/`solveDuty()`. Adds what was missing before —
   `AbortController`-based request timeouts (120s for `/solve`, matching
   CP-SAT's own observed worst case of ~30s with generous headroom; 30s
   for `/solve-duty`, which caps itself at 10s internally), one retry on
   `ECONNREFUSED` specifically (the real failure mode once solver startup
   is a race on every app launch — was previously untimeouted and
   un-retried, tolerable only because the solver used to be an always-on
   hosted service). Also exports `waitForSolverReady()`, a `/health`-poll
   helper for Phase 4's Electron main process to await right after
   spawning, before the first solve request.

### Live verification (2026-08-11)

- Built the exe, ran it directly (`./dist/aps-solver.exe`, the first
  `--onefile` attempt): crashed immediately with `ImportError: DLL load
  failed while importing cp_model_helper` — exactly the failure the
  build-time "Library not found" warnings predicted. Fixed with
  `--add-binary`; rebuilt; ran again — starts clean, `GET /health` → `{
  "status": "ok" }`.
- **Real solve through the packaged exe**: pointed the Node backend's
  `SOLVER_SERVICE_URL` at the running exe, ran `POST
  /api/timetable/generate` for Junior campus through the real API — `280
  entries, 0 unassigned, OPTIMAL, 0 conflicts`, an exact match to Phase 1's
  dev-Python-solver result for the same campus. Confirms the packaged exe
  produces identical, correct output to the dev environment, not just "it
  runs."
- **Subprocess lifecycle proof** (the actual point of this phase): wrote a
  throwaway Node script spawning the exe via `child_process.spawn`,
  polling `/health` until ready, confirming a request works, then calling
  `child.kill()`. On the first `--onefile` build: `child.kill()` returned
  successfully and the `exit` event fired, but the solver was **still
  reachable on its port afterward** — the orphan-process bug, caught
  directly rather than assumed. Rebuilt `--onedir`; re-ran the identical
  proof: spawned PID now matches the real `uvicorn`-reported server PID,
  `kill()` terminates it, and the port is confirmed released a moment
  later. This is exactly the failure mode Phase 4 needs to not ship.
- **Full Generate through the onedir exe + new retry-wrapped client**: ran
  Girls campus (exercises both `/solve` and `/solve-duty`, unlike Junior)
  through the real API with `Backend/src/utils/solverClient.ts` active —
  `200 OK` in 13s, `conflicts: []`. Direct DB check: 0 double-bookings.
  Entry count reconciled exactly (467 assigned + 280 leftover from the
  Junior test = 747 total; unassigned requirements never get a DB row, so
  this isn't a discrepancy).
- Cleanup: stopped all spawned processes (confirmed via process list — no
  lingering `node`/`aps-solver.exe` tied to this repo), reseeded to
  pristine state.

**New gitignore entries** (`Backend/.gitignore`): `solver/build` and
`solver/*.spec` — `solver/dist` was already covered by the existing bare
`dist` rule. `Backend/solver/requirements-build.txt` tracks the two
packaging-only dependencies (`pyinstaller`, `pyinstaller-hooks-contrib`)
separately from `requirements.txt`'s runtime deps.

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

**Status: done (2026-08-11).** Built, installed via the real NSIS
installer, and fully verified — including two real startup-timeout bugs
that only surfaced from the actual installed app, not the dev-mode build.

1. **WebAdmin build made same-origin-safe.** `web-admin/.env.production`
   (new — only affects `vite build`, never `vite dev`) sets
   `VITE_API_BASE_URL=/api`, relative instead of the dev `.env`'s absolute
   `http://localhost:3000/api`. This mattered specifically because of the
   LAN-access decision: a laptop loading the page from the host machine's
   IP but with an absolute `localhost:3000` baked into the JS bundle would
   send every API call to *its own* localhost, not the server's — silently
   breaking LAN access for every device except the host itself. Confirmed
   the built bundle contains `/api`, not `localhost:3000`.
2. **`Backend/src/index.ts`** now serves WebAdmin's built static files +
   SPA fallback when `WEBADMIN_DIST_PATH` is set (Electron sets it; plain
   `npm run dev` never does, so local dev against the Vite server is
   unaffected). Express 5 dropped bare `*` wildcard routes, so the SPA
   fallback is a plain middleware check, not a route pattern. Backend was
   already binding to `0.0.0.0` (from the original Railway-specific
   commit) — turns out to be exactly what LAN access needs too, no change
   required there.
3. **`desktop/` — the Electron app.** `main.js`: resolves dev vs. packaged
   paths, generates and persists JWT secrets + a random admin password in
   `userData/config.json` on first run (never regenerated — that would
   invalidate every session/account on every restart), runs `prisma
   migrate deploy` + seed scripts against `userData/data/app.db` on first
   run only, spawns the solver (Phase 3's onedir exe) and Backend (a real
   bundled Node executable running `Backend/dist/index.js` directly — not
   required in-process into Electron's own bundled Node/V8, avoiding the
   ABI mismatch risk with Prisma's native query engine flagged when this
   plan was first written), waits for both `/health` endpoints, then opens
   a `BrowserWindow` at `http://localhost:<port>`. `before-quit` kills both
   child processes.
4. **Bundled a real portable Node runtime** (`desktop/node-runtime/`,
   fetched by `desktop/scripts/fetch-node-runtime.mjs`, gitignored — 85MB
   binary, not committed) rather than leaving that as an unfulfilled
   assumption. Backend spawns through this exact binary in both dev and
   packaged mode, so the dev-mode test genuinely exercises the same
   artifact that ships.
5. `desktop/package.json`'s `electron-builder` config bundles Backend's
   `dist` + `node_modules` + `prisma`, the solver's onedir folder, WebAdmin's
   `dist`, and the portable Node runtime as `extraResources`, targeting a
   Windows NSIS installer.

### Live verification (2026-08-11)

**Dev-mode (unpackaged, `electron .`):**
- First-run flow executed for real from a genuinely empty `userData`:
  config generated, migration applied, seed + seed-admin ran, solver
  spawned and passed its health check, Backend spawned and passed its
  health check, a real `BrowserWindow` opened (confirmed via OS process
  enumeration — title "web-admin", matching the built page).
- Logged in through the spawned backend with the auto-generated admin
  password from `config.json`. Hit the server via its actual LAN IP
  (`192.168.10.100`, not loopback) — root page, login, and `/api/campuses`
  all returned correctly, proving the "different laptop on the same
  network" scenario this phase's architecture decision exists for.
- Ran a full `Generate Timetable` through the complete stack (Electron →
  spawned Backend → spawned solver) — `280/0/OPTIMAL/0 conflicts` for
  Junior, matching every prior phase's result for the same campus.
- **Quit teardown** (the specific risk flagged for this phase): snapshotted
  the backend and solver PIDs and their listening ports, closed the main
  window (`CloseMainWindow()` — a real WM_CLOSE, not a forced kill,
  simulating an actual user closing the app), confirmed via the process's
  own log that `before-quit` fired and called `kill()` on both children by
  the exact PIDs snapshotted, then confirmed both ports released and both
  PIDs gone from the process list. No orphans.

**Real installer (`electron-builder --win` → NSIS `.exe`, then actually
installed and run — not just "the build succeeded"):**
- Built a 275MB `Ali Public School Setup 1.0.0.exe`. Ran it silently
  (`/S`), confirmed it installed to
  `%LOCALAPPDATA%\Programs\ali-school-desktop` with all `extraResources`
  correctly laid out (`backend/`, `solver/`, `node-runtime/`, `webadmin`
  alongside `app.asar`).
- **First launch of the installed app failed** — the solver, then on the
  next attempt the backend, each failed their 15-second readiness check
  with a connection failure, even though both eventually did come up
  (confirmed by running the solver executable directly and watching it
  succeed, just slowly). Diagnosis: a freshly-installed, unsigned
  executable gets scanned by Windows Defender on first touch, and
  PyInstaller's onedir output plus Backend's full `node_modules` tree are
  hundreds of small files scanned individually — real first-run latency
  that the dev-mode testing above never hit (those files had already been
  touched/scanned repeatedly during development). This is a genuine
  deployment consideration, not a test artifact: any end user's first
  launch after installing will see this same delay. **Fixed** by raising
  both readiness timeouts from 15s to 60s in `main.js` — not a magic
  number, generous headroom over the ~20s actually observed.
- Rebuilt, reinstalled, relaunched: first-run flow completed end-to-end
  (migration — "no pending migrations," correctly detecting the schema was
  already current from the earlier failed attempt — solver ready, backend
  ready). Re-ran the full verification pass (root page, login with the
  *same* persisted credentials from the first attempt — confirming
  `config.json` survives reinstalls since it lives in `userData`, separate
  from the install directory — LAN access, full Generate Timetable) against
  the actual installed binaries this time, not dev-tree paths. All passed.
  Repeated the quit-teardown check against the installed app specifically
  — same result, both ports released, zero lingering processes.
- Cleaned up: ran the generated uninstaller silently, removed the leftover
  empty install directory it left behind, cleared the test `userData`.
  Confirmed via process enumeration afterward: nothing left running.

**What's NOT yet done** (explicitly out of scope for this pass, flagged
rather than silently skipped):
- Code signing — **deliberately deferred, a decision, not a gap.**
  Confirmed with Abdullah 2026-08-12: stay unsigned while the app is still
  being actively tested and changed; buy and wire in a real
  code-signing certificate once it's finalized, not before. Every
  `signtool.exe` step during the build logs "no signing info identified,
  signing is skipped" — expected. Consequence to keep in mind: unsigned
  means Windows SmartScreen will warn on first run on other machines.
- A custom app icon (currently Electron's default) and installer branding
  — cosmetic, still deferred.
- ~~A first-run UI showing the generated admin password~~ — **done, see
  addendum below.**

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

### Addendum (2026-08-12) — first-run UI

Requirement from Abdullah: he hands over the installer file and the
school runs it themselves — no manual setup per install, no terminal
access to read a generated password off a console no one will see.

1. `desktop/first-run.html` — a small static page showing the
   auto-generated admin email + password (large, monospace, one-click
   copy), a note that this only appears once, and a "Continue" button.
   Receives the credentials via URL query params when loaded (no IPC/
   preload needed — it's fully local, read-only display of data that
   only exists because this exact process just generated it).
2. `desktop/main.js`: `showFirstRunWindow()` opens this page **in
   parallel with** `ensureDatabase()`/`startBackendStack()`, not after —
   Phase 4's own verification found first real launch can take 20-60s
   (Defender scanning the fresh install), so the credentials screen
   doubles as the wait indicator instead of a blank window. "Continue"
   calls `window.close()`; the main process's `'closed'` handler on that
   window is the signal to proceed, no round-trip needed.
3. **Caught by review before testing, not by a failed run:** the
   generic `app.on('window-all-closed', ...)` handler would have fired
   the instant the *first-run* window closed too (Electron fires it
   whenever open-window count hits zero, regardless of which window
   closed) — quitting the whole app the moment the school clicked
   "Continue," before the main window ever opened. Fixed by tying the
   quit-on-close behavior to the main window's own `'closed'` event
   specifically, not the app-wide event.
4. `isFirstRun` is now computed once in `main()` (new config generated
   AND no db file yet) and threaded through to both `ensureDatabase`
   (gates seeding) and the credentials-window decision, so the two can't
   disagree.
5. Startup failures that happen while the credentials window is still
   open now close that window and show a native `dialog.showErrorBox`
   with the real error — previously a failure here would have left an
   orphaned window with no explanation and only a console error no one
   would see.

**Live-verified (2026-08-12, dev mode):** fresh `userData` → launched →
confirmed via process enumeration that the first-run window opened
(title "Ali Public School — First-Time Setup") while migration/seed/
solver/backend all ran in the background per the log timestamps — solver
and backend were both already `ready` by the time the window was still
open. Closed the window (simulating "Continue") — confirmed the main
window opened correctly and the app did **not** quit prematurely (the
bug described above, confirmed fixed). Logged in with the *exact*
password shown on screen — real proof the displayed credentials are the
real ones, not a placeholder. Quit cleanly, confirmed both ports
released. Relaunched from the now-existing `userData` — confirmed the
first-run window did **not** appear the second time (straight to the
main window, log shows "No pending migrations to apply," no reseed).

**Real installer, this addendum (2026-08-12):** rebuilt and installed.
Caught one packaging bug immediately: `first-run.html` wasn't in
`desktop/package.json`'s `files` list (only `main.js`/`package.json`
were), so the credentials page would have 404'd inside the packaged
`app.asar` the moment a real user hit first-run — dev mode never caught
this since it loads straight off disk, not from an archive. Fixed, and
worth noting as a category: anything `main.js` loads by relative path
needs to be in that list explicitly, `files` doesn't default to "whatever
main.js happens to reference."

On the first real-install retest after that fix, backend startup missed
its (then 60s) readiness timeout with no diagnosable cause — the
intended `console.error` never appeared in the captured log, most likely
lost to an async-stderr-write-then-immediate-`app.quit()` race on
Windows (a real, if second-order, finding — not chased down further
since the fix generalizes regardless of the exact mechanism). Rather than
just retry and hope, added `writeCrashLog()` — a synchronous
`fs.appendFileSync` to `userData/startup-error.log`, referenced in the
error dialog shown to the user — so a real failure is diagnosable by
Abdullah without a dev console, and bumped both readiness timeouts from
60s to 120s (observed range across repeated real-install tests: ~20s to
just over 60s; 120s leaves actual margin instead of sitting right at the
edge). Rebuilt again — this run's backend became ready in ~40s, under
budget either way, so the original timeout-miss reads as one slow outlier
rather than every run being marginal.

**Final full pass, real installed app, first-run UI end to end:**
credentials window opened showing real generated values, logged in with
the exact displayed password (`200`), closed the window and confirmed
the main window opened (no premature quit), hit the server via its real
LAN IP (`200`), ran a full Generate Timetable through the installed
backend+solver (`200`), quit and confirmed both ports released with zero
lingering processes. Uninstalled via the generated uninstaller, removed
the leftover empty install directory, cleared test `userData`. Confirmed
clean afterward.

## Phase 5 — Cleanup

**Status: done (2026-08-12).**

1. `docs/deployment.md` rewritten from scratch — the Supabase
   region/Vercel/Railway content it had was entirely about the *original*
   online repo's decisions, none of it applicable here. Now a short
   pointer describing this repo's actual distribution (Electron/NSIS
   installer), the build command, and the code-signing decision — full
   architectural detail stays in this file (`offline-conversion-plan.md`)
   rather than being duplicated.
2. Root `CLAUDE.md`: added an "OFFLINE CONVERSION REPO" banner at the top
   (previously nothing in the file identified this as the converted copy
   at all), updated the repo layout tree (`desktop/`, `web-admin/`
   lowercase, `mobile-app/` lowercase, SQLite not PostgreSQL), tech stack
   section (SQLite conversion, enums-as-strings, Electron), the HTTPS
   line in the security baseline (offline LAN exception, doesn't relax
   the rule elsewhere), the Postgres-host backup line (replaced with the
   real local-file-backup responsibility), and the "where to look"
   pointers (added this file, corrected `deployment.md`'s description).
   Still 84 lines — comfortably under the file's own ~150-200 line budget.
3. `docs/security-baseline.md` §4: added the LAN/HTTP exception this
   offline app relies on, explicit that it's scoped to this app's LAN
   traffic only and doesn't relax HTTPS-only anywhere else (mobile app,
   any future hosted piece).
4. **Corrected a stale assumption from the original Phase 2 plan**,
   rather than blindly executing it: that plan said to remove
   `WEBADMIN_ORIGIN`/`FLUTTER_WEB_ORIGIN` as "now-dead env vars." They're
   not dead — Phase 4's actual implementation kept CORS untouched on
   purpose, because local dev (`npm run dev` against the Vite server on
   5173) is genuinely cross-origin and still needs it; only the packaged
   app's same-origin serving makes CORS a non-issue, not the env vars
   themselves. Removing them would have broken local dev. `DIRECT_URL`
   (genuinely dead, Postgres-only) was already removed in Phase 1.
5. `mobile-app/` — confirmed still untouched, out of scope, exactly as
   planned. No action needed.

## Open items carried forward (not blocking, revisit later)

- LAN traffic is unencrypted HTTP by design (Phase 2, item 2) — accepted
  for v1, optional TLS hardening later if the client wants it.
- File upload/storage: not built yet anywhere in the app (confirmed by
  code search) — nothing to migrate now, but if/when it's built, target
  local disk under the same `userData`-style path, not cloud storage,
  matching the rest of the offline design.
