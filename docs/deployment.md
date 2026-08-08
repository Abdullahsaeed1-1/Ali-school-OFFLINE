# Deployment decisions & tracking

Where real hosting choices get recorded, so they don't get re-litigated or
forgotten between sessions. See `docs/security-baseline.md` §14 for the
security pre-launch gate — this doc is about infrastructure/hosting
choices specifically.

## Database — Supabase (decided, done 2026-08-08)

- **Provider:** Supabase (managed Postgres).
- **Region:** `ap-northeast-2` (Seoul, South Korea). Already chosen and
  the project is live — not up for reconsideration, but every other piece
  of infrastructure below needs to be picked with this region in mind
  (see the latency finding right below).
- **Connection:** two URLs, both required — `DATABASE_URL` (pooled,
  `pgbouncer=true`, port 6543, used for normal runtime queries) and
  `DIRECT_URL` (direct, port 5432, used only by Prisma's migration
  engine). `schema.prisma`'s `datasource db` block wires both — this was
  a required code change, not just an `.env` change, since Supabase's
  pooled connection doesn't reliably support the prepared
  statements/advisory locks `prisma migrate deploy` needs.
- **Migration:** local dev Postgres → Supabase, done via `prisma migrate
  deploy` (schema) + a custom Node/Prisma copy script (data — `pg_dump`/
  `psql` aren't installed in this dev environment). Verified before
  copying by diffing the live local DB against a freshly-reseeded
  throwaway schema — found and preserved one real difference (a
  teacher's manual lock a naive reseed would have silently discarded).
  Post-copy, verified with a 3-campus Generate run matching the
  established baseline. Full account in PENDING_QUESTIONS.md item 37.

## ⚠️ Backend hosting-region latency finding (2026-08-08) — do not forget when choosing a Backend host

Ran the post-migration Generate verification with the Backend still
running on a local dev laptop (nowhere near Seoul) talking to the new
Supabase DB. Results:

| Campus | Solver's own solve time | Total request time | Gap (DB round-trip overhead) |
|---|---|---|---|
| Junior | 1.76s | 43.9s | ~42s |
| Girls | 16.7s | 55.2s | ~38s |
| Boys | 15.8s | 36.8s | ~21s |

The CP-SAT solve itself was exactly as fast as ever (Junior's internal
`solveTimeMs` matched baseline precisely). The extra 20-40 seconds is
`timetableGenerator.ts`'s many sequential Prisma round-trips, each now
crossing the network to Seoul instead of hitting `localhost`.

**This is a real problem for production, not just a one-off test
artifact.** If the deployed Backend ends up hosted somewhere far from
`ap-northeast-2`, every real admin's Generate click will take 35-55
seconds instead of being near-instant for Junior and merely slow (not
extremely slow) for Girls/Boys.

**The fix is a hosting decision, not a code change:** when choosing where
to deploy `Backend/` and `Backend/solver/`, **pick a host/region near
`ap-northeast-2` (Seoul)** — e.g. a provider with an actual Seoul or
Tokyo region, or at minimum East Asia. This is Supabase's own documented
recommendation (co-locate your app server with your database region).
Don't default to a host's US/EU region out of habit — check the region
list explicitly before committing.

## WebAdmin — Vercel (decided 2026-08-08, in progress)

Frontend only. See chat history / commit history for the actual
step-by-step deploy — this doc just records the decision: Vercel,
connected to the `Abdullahsaeed1-1/Ali-school-main` GitHub repo, root
directory `web-admin/`. `VITE_API_BASE_URL` must point at the real
production Backend's HTTPS URL once Backend hosting is chosen — it
cannot stay pointed at `localhost` in a production build (Vite bakes
`VITE_`-prefixed vars into the bundle at build time, same category of
constraint as the Flutter app's `API_BASE_URL`, see root `CLAUDE.md`).

## Backend + solver — not yet decided

Open. Whatever is chosen, cross-check against the latency finding above
before committing.
