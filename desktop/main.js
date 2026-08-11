// Electron main process — Ali Public School offline desktop app.
// See docs/offline-conversion-plan.md Phase 4 for the architecture this
// implements: Backend runs as a spawned child process using a real,
// bundled Node executable (not require()'d in-process — avoids Prisma's
// native query-engine binary needing to match Electron's own bundled
// Node/V8 ABI), serving both the API and WebAdmin's static build from one
// port so any device on the school's LAN can reach it, not just this
// machine. The solver runs as a second child process, loopback-only,
// using the spawn/health-poll/kill mechanism proven in Phase 3.
const { app, BrowserWindow, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

const isPackaged = app.isPackaged

function devPath(...segments) {
  return path.join(__dirname, '..', ...segments)
}
function packagedPath(...segments) {
  return path.join(process.resourcesPath, ...segments)
}

function getPaths() {
  return {
    nodeExe: isPackaged
      ? packagedPath('node-runtime', 'node.exe')
      : path.join(__dirname, 'node-runtime', 'node.exe'),
    backendEntry: isPackaged ? packagedPath('backend', 'dist', 'index.js') : devPath('Backend', 'dist', 'index.js'),
    backendNodeModules: isPackaged ? packagedPath('backend', 'node_modules') : devPath('Backend', 'node_modules'),
    prismaSchema: isPackaged
      ? packagedPath('backend', 'prisma', 'schema.prisma')
      : devPath('Backend', 'prisma', 'schema.prisma'),
    prismaCli: isPackaged
      ? packagedPath('backend', 'node_modules', 'prisma', 'build', 'index.js')
      : devPath('Backend', 'node_modules', 'prisma', 'build', 'index.js'),
    seedScript: isPackaged ? packagedPath('backend', 'prisma', 'seed.ts') : devPath('Backend', 'prisma', 'seed.ts'),
    seedAdminScript: isPackaged
      ? packagedPath('backend', 'prisma', 'seed-admin.ts')
      : devPath('Backend', 'prisma', 'seed-admin.ts'),
    tsxCli: isPackaged
      ? packagedPath('backend', 'node_modules', 'tsx', 'dist', 'cli.mjs')
      : devPath('Backend', 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    solverExe: isPackaged ? packagedPath('solver', 'aps-solver.exe') : devPath('Backend', 'solver', 'dist', 'aps-solver', 'aps-solver.exe'),
    webAdminDist: isPackaged ? packagedPath('webadmin') : devPath('web-admin', 'dist'),
  }
}

const BACKEND_PORT = Number(process.env.APS_BACKEND_PORT ?? 3000)
const SOLVER_PORT = Number(process.env.APS_SOLVER_PORT ?? 8001)

// ---------------------------------------------------------------------------
// First-run config: JWT secrets and the seed admin password are generated
// once and persisted in userData, not regenerated on every launch (that
// would invalidate every session and account on every restart). Shown to
// the school via showFirstRunWindow() below — this function only handles
// generating/persisting, never displaying.
// ---------------------------------------------------------------------------
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function loadOrCreateConfig() {
  const configPath = getConfigPath()
  if (fs.existsSync(configPath)) {
    return { config: JSON.parse(fs.readFileSync(configPath, 'utf8')), isNewConfig: false }
  }
  const config = {
    jwtSecret: crypto.randomBytes(48).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(48).toString('hex'),
    seedAdminEmail: 'admin@alipublicschool.com',
    seedAdminPassword: crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '') + 'Aa1!',
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  console.log(`[first-run] Generated admin login: ${config.seedAdminEmail} / ${config.seedAdminPassword}`)
  console.log(`[first-run] Saved to ${configPath} — change this password after first login.`)
  return { config, isNewConfig: true }
}

// Shown once, on first run — the school double-clicks the installer, opens
// the app, and needs to see their generated admin credentials without
// Abdullah setting anything up by hand or walking them through a terminal.
// Runs in parallel with ensureDatabase()/startBackendStack() (see main()),
// not after — first real launch can take a while (Windows Defender
// scanning the freshly-installed exe/node_modules; observed anywhere from
// ~20s to over 60s across repeated real-install tests, see Phase 4
// verification notes in docs/offline-conversion-plan.md), so the
// credentials screen doubles as the wait indicator instead of the school
// staring at a blank window.
let firstRunWindow = null

function showFirstRunWindow(config) {
  return new Promise((resolve) => {
    firstRunWindow = new BrowserWindow({
      width: 480,
      height: 560,
      resizable: false,
      title: 'Ali Public School — First-Time Setup',
    })
    firstRunWindow.setMenu(null)
    firstRunWindow.loadFile(path.join(__dirname, 'first-run.html'), {
      query: {
        email: config.seedAdminEmail,
        password: config.seedAdminPassword,
        configPath: getConfigPath(),
      },
    })
    // The page's "Continue" button calls window.close() — that's the
    // signal to proceed, not any IPC round-trip.
    firstRunWindow.on('closed', () => {
      firstRunWindow = null
      resolve()
    })
  })
}

function runChildToCompletion(exePath, args, env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { env, stdio: 'pipe' })
    let stderr = ''
    child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`))
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      process.stderr.write(`[${label}] ${d}`)
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} exited with code ${code}: ${stderr}`))
    })
    child.on('error', reject)
  })
}

async function ensureDatabase(paths, dbPath, config, isFirstRun) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const dbEnv = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
  }

  console.log(`[db] Running migrations against ${dbPath}...`)
  await runChildToCompletion(
    paths.nodeExe,
    [paths.prismaCli, 'migrate', 'deploy', '--schema', paths.prismaSchema],
    dbEnv,
    'prisma',
  )

  if (isFirstRun) {
    console.log('[db] First run — seeding real school data and admin account...')
    await runChildToCompletion(paths.nodeExe, [paths.tsxCli, paths.seedScript], dbEnv, 'seed')
    await runChildToCompletion(
      paths.nodeExe,
      [paths.tsxCli, paths.seedAdminScript],
      { ...dbEnv, SEED_ADMIN_EMAIL: config.seedAdminEmail, SEED_ADMIN_PASSWORD: config.seedAdminPassword },
      'seed-admin',
    )
  }
}

async function waitForHttpOk(url, timeoutMs, pollMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`)
}

// Synchronous, unlike console.error — a redirected stderr write on Windows
// can be asynchronous, and was observed being lost when app.quit() follows
// immediately after (Phase 4 addendum verification, 2026-08-12). A
// non-technical end user has no console to read anyway; this is the one
// place they (or Abdullah, remotely) could actually find out what broke.
function writeCrashLog(error) {
  try {
    const logPath = path.join(app.getPath('userData'), 'startup-error.log')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${error?.stack ?? error}\n`)
    return logPath
  } catch {
    return null
  }
}

let backendProcess = null
let solverProcess = null

function spawnManaged(exePath, args, env, label) {
  const child = spawn(exePath, args, { env, stdio: 'pipe' })
  child.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`))
  child.on('exit', (code, signal) => console.log(`[${label}] exited (code=${code}, signal=${signal})`))
  return child
}

async function startBackendStack(paths, dbPath, config) {
  solverProcess = spawnManaged(paths.solverExe, [], { ...process.env, SOLVER_PORT: String(SOLVER_PORT) }, 'solver')
  // Generous timeout — a freshly-installed, unsigned exe can take much
  // longer than a warm run to become ready on first launch (Windows
  // Defender real-time-scans it, and PyInstaller onedir's `_internal`
  // folder has hundreds of small files it scans individually). Observed
  // anywhere from ~20s to over 60s across repeated real-install tests
  // (2026-08-12), vs. ~2-7s on a machine that had already run/scanned the
  // same exe before — 120s leaves real margin above the worst case seen.
  await waitForHttpOk(`http://127.0.0.1:${SOLVER_PORT}/health`, 120_000)
  console.log('[main] Solver ready.')

  backendProcess = spawnManaged(
    paths.nodeExe,
    [paths.backendEntry],
    {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(BACKEND_PORT),
      DATABASE_URL: `file:${dbPath}`,
      JWT_SECRET: config.jwtSecret,
      JWT_REFRESH_SECRET: config.jwtRefreshSecret,
      SOLVER_SERVICE_URL: `http://127.0.0.1:${SOLVER_PORT}`,
      WEBADMIN_DIST_PATH: paths.webAdminDist,
    },
    'backend',
  )
  // Same generous timeout as the solver above, same reason — a freshly
  // installed node.exe plus Backend's full node_modules tree (hundreds of
  // files) gets AV-scanned on first touch.
  await waitForHttpOk(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 120_000)
  console.log('[main] Backend ready.')
}

function killManagedProcesses() {
  for (const [label, child] of [['solver', solverProcess], ['backend', backendProcess]]) {
    if (child && !child.killed) {
      console.log(`[main] Stopping ${label} (PID ${child.pid})...`)
      child.kill()
    }
  }
}

async function main() {
  const paths = getPaths()
  const { config, isNewConfig } = loadOrCreateConfig()
  const dbPath = path.join(app.getPath('userData'), 'data', 'app.db')
  // Single source of truth for "is this a first run" — gates both seeding
  // (ensureDatabase) and showing the credentials window, so the two can
  // never disagree (e.g. config.json regenerated but the db already
  // existed, or vice versa — shouldn't happen in normal operation, but if
  // it did, this ties the credentials screen to the DB's real state, not
  // config.json's).
  const isFirstRun = isNewConfig && !fs.existsSync(dbPath)

  let firstRunWindowClosed = null
  if (isFirstRun) {
    firstRunWindowClosed = showFirstRunWindow(config)
  }

  try {
    await Promise.all([
      ensureDatabase(paths, dbPath, config, isFirstRun).then(() => startBackendStack(paths, dbPath, config)),
      firstRunWindowClosed,
    ])
  } catch (error) {
    // Startup failed while the school might still be looking at the
    // credentials screen — close it and tell them plainly instead of
    // leaving a stray window with no explanation.
    if (firstRunWindow && !firstRunWindow.isDestroyed()) firstRunWindow.close()
    console.error('[main] Fatal startup error:', error)
    const logPath = writeCrashLog(error)
    dialog.showErrorBox(
      'Ali Public School — Startup failed',
      `The app could not start:\n\n${error.message}\n\n` +
        (logPath ? `Details saved to:\n${logPath}\n\n` : '') +
        `Please contact support with this message.`,
    )
    app.quit()
    return
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Ali Public School',
  })
  win.loadURL(`http://localhost:${BACKEND_PORT}`)
  // Quit when THIS window closes — not the generic app-wide
  // 'window-all-closed' event, which would also fire (and prematurely
  // quit the whole app) the moment the first-run credentials window
  // closes via its own "Continue" button, before the main window has
  // even opened yet.
  win.on('closed', () => app.quit())
}

app.whenReady().then(() => {
  main().catch((error) => {
    console.error('[main] Fatal startup error:', error)
    writeCrashLog(error)
    app.quit()
  })
})

app.on('before-quit', killManagedProcesses)
