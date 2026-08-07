# Ali Public School — Management System

Multi-app monorepo for Ali Public School (Junior, Girls, Boys campuses). Replaces fragile Excel timetables with a database-backed system and role-based apps for Admins, Teachers, and eventually Students/Parents.

## Apps in this repo

| Folder | What it is | Stack |
|--------|-----------|-------|
| `Backend/` | REST API — single source of truth for all data | Node.js · Express · TypeScript · Prisma · PostgreSQL |
| `web-admin/` | Admin panel (web) | React · Vite · Tailwind CSS |
| `mobile-app/` | Teacher + Student/Parent app _(not yet started)_ | Flutter |

All apps talk **only** to `Backend`'s REST API. Nothing touches the database directly except `Backend`.

---

## One-time setup

Run these steps **once** when you first clone the repo, or after another developer adds new dependencies.

### 1. Install dependencies for all apps

```bash
npm run install:all
```

This runs `npm install` inside `Backend/` and `web-admin/` in sequence.

### 2. Configure environment variables

Each app has its own `.env` file that **must not be committed** (both are in `.gitignore`).

#### `Backend/.env`

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@localhost:5432/ali_school_db?schema=public` | Prisma database connection |
| `JWT_SECRET` | ✅ | `a-long-random-string` | Signs access + refresh JWTs — use a strong random value, never reuse between dev and prod |
| `WEBADMIN_ORIGIN` | ✅ | `http://localhost:5173` | CORS allowed origin for WebAdmin (must match the Vite dev server URL exactly, no trailing slash) |
| `PORT` | optional | `3000` | Express listen port (defaults to 3000) |
| `NODE_ENV` | optional | `development` | Set to `production` in prod to enable Secure cookies |
| `SEED_ADMIN_EMAIL` | ✅ for seed | `admin@alipublicschool.com` | Email for the seeded dev admin account |
| `SEED_ADMIN_PASSWORD` | ✅ for seed | `ChangeMe123` | Password for the seeded dev admin account (min 8 chars) |

#### `web-admin/.env`

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `VITE_API_BASE_URL` | ✅ | `http://localhost:3000/api` | Base URL for all API calls from the frontend |

### 3. Push the database schema

```bash
npm run db:migrate
```

This runs `prisma migrate dev` inside `Backend/`. You will be prompted to name the migration.  
_(The project uses Prisma Migrate in dev — not `db push`. If this is a brand-new database and you have no migrations folder yet, Prisma will create one.)_

### 4. Seed the first admin account

```bash
npm run db:seed-admin
```

Reads `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `Backend/.env`, bcrypt-hashes the password, and upserts an `ADMIN` user into the database. Safe to run again — it won't create duplicates.

> ⚠️ **Dev-only account.** Change or remove this account before going to production.

---

## Daily use

### Start everything (one command)

```bash
npm run dev
```

Starts `Backend` (port 3000) and `web-admin` (port 5173) together in a single terminal window with colour-coded, interleaved logs:

- 🔵 **BACKEND** — Express API + TypeScript, hot-reloaded by `tsx watch`
- 🟢 **WEBADMIN** — Vite dev server with HMR

If either process crashes, the other is stopped automatically (`--kill-others-on-fail`).

### Inspect the database

```bash
npm run db:studio
```

Opens **Prisma Studio** at `http://localhost:5555` — a browser UI to browse and edit all database tables and rows without writing SQL.

---

## Adding MobileApp to `dev` later

When `mobile-app/` (Flutter) has a runnable dev command (e.g. `flutter run`), add it as a third entry inside the `concurrently` line in the root `package.json`:

```jsonc
// Before (current):
"dev": "concurrently -n BACKEND,WEBADMIN -c blue,green ... \"npm run dev --prefix Backend\" \"npm run dev --prefix web-admin\""

// After (when MobileApp is ready):
"dev": "concurrently -n BACKEND,WEBADMIN,MOBILEAPP -c blue,green,magenta ... \"npm run dev --prefix Backend\" \"npm run dev --prefix web-admin\" \"npm run dev --prefix mobile-app\""
```

No other changes to the root setup are needed.

---

## Project conventions

- Secrets live in `.env` files only — never committed, never hardcoded in source.
- Every API endpoint enforces role checks **server-side** (not just UI-level hiding).
- Auth uses **httpOnly cookies** for JWTs — tokens are never stored in `localStorage`.
- See [`docs/security-baseline.md`](docs/security-baseline.md) for the full security checklist.
- See [`CLAUDE.md`](CLAUDE.md) for the full project context, stack decisions, and dev conventions.
