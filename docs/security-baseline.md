# Security Baseline — Ali Public School Management System

This system will eventually hold real personal data (teacher records, eventually student/parent records and login credentials). These are the baseline rules to follow from the very first line of auth code — retrofitting security after launch is much harder than building it in from the start.

## 1. Authentication & passwords
- Hash passwords with `bcrypt` (cost factor 10–12). Never store, log, or return plaintext passwords anywhere — not in error messages, not in debug logs, not in API responses.
- JWT access tokens should be short-lived (e.g. 15–60 min). Use a refresh-token pattern for longer sessions instead of issuing long-lived access tokens.
- On logout, invalidate the refresh token server-side (keep a small revocation list or store refresh tokens in the DB so they can be deleted).

## 2. Secrets management
- `DATABASE_URL`, `JWT_SECRET`, any third-party API keys: only in `.env` files, never hardcoded in source, never committed to git.
- Each app folder (`Backend/`, `WebAdmin/`, `MobileApp/`) needs its own `.gitignore` entry for `.env` — don't assume a root-level `.gitignore` covers all of them.
- Different secrets for local/dev vs production. Never reuse a production `JWT_SECRET` in a dev environment that might be shared/screenshotted.

## 3. Authorization (role-based access control)
- Every API endpoint must check the caller's role **server-side**, based on the JWT, before doing anything — not just hide a button in WebAdmin or skip a screen in Flutter. The UI hiding something is a convenience, not a security boundary.
- A `TEACHER`-role user should only ever be able to fetch/modify their **own** data (e.g. their own schedule), never another teacher's, even if they guess another teacher's ID. Check `req.user.teacherId === requestedTeacherId` (or equivalent) on every relevant route, not just on the ones that feel sensitive.
- Destructive/structural actions (deleting a teacher, changing the timetable structure, regenerating the whole schedule) should be `ADMIN`-only, enforced server-side.

## 4. Transport & network security
- HTTPS only in production, for Backend, WebAdmin, and any API the Flutter app calls. No plain HTTP for anything carrying a login or token.
- CORS on the Backend should allow only known origins (the WebAdmin domain, and whatever's needed for the mobile app's requests) — not a wildcard `*`, especially once auth is involved.

## 5. Input validation & injection protection
- Prisma parameterizes queries by default, which already protects against classic SQL injection — but never use `prisma.$queryRawUnsafe` (or string-concatenated raw SQL) with user-supplied input.
- Validate every incoming request body (e.g. with `zod`) before it touches the database — reject malformed/unexpected fields rather than trusting the client. This applies to every controller, not just the obviously sensitive ones (auth, password) — a class/subject/teacher CRUD endpoint that skips validation is just as exploitable.
- Validate types AND ranges/formats where it matters (e.g. `targetPeriodsPerWeek` can't be negative or absurdly large, `email` must actually look like an email, IDs passed in URL params should be checked against the expected ID format before hitting Prisma).

## 6. Rate limiting & brute force
- Rate-limit login and password-reset endpoints specifically (e.g. 5–10 attempts per IP per few minutes). This is cheap to add early and expensive to add after an incident.
- Also rate-limit any endpoint that creates or resets credentials (e.g. `set-password`), and any endpoint that's cheap to spam and expensive to serve (bulk exports, timetable auto-generation). A correctly-authenticated but malicious/compromised account shouldn't be able to hammer these without limit either.

## 7. Backups & data loss
- Once real school data is in the database (not just seed/test data), confirm automated backups are actually turned on with the hosting provider — don't assume it's on by default; check.
- Keep at least one manual export/dump before any risky migration (schema change, bulk data correction).

## 8. Mobile-specific (Flutter)
- Store JWT/refresh tokens in secure storage (`flutter_secure_storage`), not plain `SharedPreferences` — SharedPreferences is not encrypted on the device.
- Don't log tokens or API responses containing personal data to the console in release builds.
- **Before submitting to the App Store / Play Store:**
  - `API_BASE_URL` (`MobileApp/.env`, read via `envied`) is compiled into the binary — it can't be changed after the fact like a server config. It must be set to the real production HTTPS domain and the app rebuilt, not left pointing at `localhost` or a dev LAN IP.
  - The production backend must be actually deployed and reachable at that HTTPS domain before building the release binary — test the real URL from a device off your home network, not just the emulator.
  - Do not add an iOS ATS exception (`NSAppTransportSecurity` / arbitrary loads) or Android `usesCleartextTraffic`/network security config to "make it work" with an HTTP backend. If the app needs one of these to run, the backend isn't ready to ship — fix the backend's HTTPS setup instead of weakening the OS's transport security default.
  - Rotate all `.env` secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, DB credentials) to real production values before the production backend goes live — the dev placeholders must never be reachable from a published app.
  - CORS (`WEBADMIN_ORIGIN` / `FLUTTER_WEB_ORIGIN`) only applies to browser-based requests (WebAdmin, Flutter Web) — native app builds don't send an `Origin` header and aren't gated by it. Don't mistake a working native build for "CORS is fine, so we're production-ready" — the HTTPS/domain checks above are separate and still required.

## 9. Web-specific (WebAdmin)
- Prefer an httpOnly cookie for the auth token over `localStorage` if feasible — `localStorage` is readable by any JS on the page, which makes XSS more dangerous. If using `localStorage` for simplicity early on, treat upgrading this as a pre-launch task, not optional polish.

## 10. Logging hygiene
- Never log full request bodies for auth endpoints (they contain passwords). Never log JWTs or refresh tokens in plaintext in server logs.

## 11. Dependency vulnerabilities
- Run `npm audit` (Backend and WebAdmin) periodically, and definitely right before any real launch — fix or explicitly accept (with a comment why) any `high`/`critical` finding, don't just ignore the output.
- Before adding a new npm/pub package, prefer ones that are actively maintained (recent commits/releases) over an abandoned one that happens to have the right API — an unmaintained dependency is a security liability even before any CVE is filed against it.
- Pin dependency versions in production (`package-lock.json` / `pubspec.lock` committed, which they already should be) so a `npm install` on the deploy server can't silently pull in a newer, unvetted version.
- Consider turning on Dependabot (or Renovate) on the GitHub repo once one exists, so dependency CVEs surface automatically instead of relying on someone remembering to check.

## 12. Error handling & information leakage
- API error responses must never include a raw stack trace, a Prisma error object, a SQL fragment, or an internal file path — only a curated `{ error, code }` shape (see `Backend/src/utils/apiError.ts` / `handleControllerError` — every controller should route unexpected errors through this, not `console.log` + a raw 500 body).
- Don't let error messages reveal whether a specific resource exists when the caller isn't authorized to know that (the login endpoint already does this right — same "Invalid email or password" whether the email exists or not; apply the same thinking anywhere an ID/email is looked up on behalf of an unauthenticated or under-privileged caller).
- Server logs (not the API response) can be more detailed for debugging, but still must never contain passwords, tokens, or full personal-data payloads in plaintext — see §10.
- In production, disable any framework/library debug or verbose-error mode (e.g. Express's default HTML error page, stack traces in responses) — these are fine in local dev only.

## 13. File upload safety
Not built yet, but the moment any feature accepts a file (teacher profile photo, a document, a bulk-import spreadsheet), it must land with all of these from the first commit, not "phase 2":
- Enforce a server-side allow-list of file types by inspecting actual file content/magic bytes, not just the client-supplied `Content-Type` header or file extension (both are trivially spoofable).
- Enforce a hard file-size limit before the body is fully read into memory (e.g. via `multer`'s `limits.fileSize` or equivalent), so a malicious large upload can't be used to exhaust server memory/disk.
- Never store uploaded files under a name derived from user input — generate a random filename/id server-side, and store the original filename only as metadata (prevents path traversal like `../../etc/passwd` and overwrite attacks).
- Store uploads outside the web server's directly-servable root (or in object storage like S3), and serve them back through an authenticated endpoint that checks the requester's role — don't drop them in a public `/uploads` folder anyone can browse.
- Never allow uploading types that a browser can execute or render as active content (`.html`, `.svg`, `.js`) into any path the app also serves back to users — this is a classic stored-XSS vector via "file" upload.

## 14. Pre-launch security gate
Everything above is meant to be true before this system holds any real school data outside of testing/dev. Before a real launch (not just internal testing), explicitly re-check every section above, with special attention to §11–13, since they're the newest additions:
- [ ] §6 Rate limiting — covers all credential-creating/resetting endpoints, not just login
- [ ] §5 Input validation — every controller validates its input, not just auth
- [ ] §2 Secrets — no hardcoded secrets/URLs anywhere in source (see root `CLAUDE.md`'s note on this), production `.env` values are real and rotated
- [ ] §11 Dependency vulnerabilities — `npm audit` run and clean (or findings explicitly accepted)
- [ ] §12 Error handling & information leakage — no stack traces/internal errors ever reach an API response
- [ ] §13 File upload safety — only relevant once a file-upload feature exists, but must be done at the same time as that feature, not after
