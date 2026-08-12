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

// Diagnostic (2026-08-12): a real-world run quit silently right after
// seeding, with no "[main] Fatal startup error" line and no crash log —
// meaning something crashed OUTSIDE the try/catch in main(), most likely
// an uncaught exception/rejection somewhere async. These make that
// visible instead of a silent, unexplained app.quit().
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

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
    checkSeededScript: isPackaged
      ? packagedPath('backend', 'prisma', 'check-seeded.ts')
      : devPath('Backend', 'prisma', 'check-seeded.ts'),
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
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
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
  return config
}

// Shown once, on first run — the school double-clicks the installer, opens
// the app, and needs to see their generated admin credentials without
// Abdullah setting anything up by hand or walking them through a terminal.
// Runs in parallel with seedDatabase()/startBackendStack() (see main()),
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
    // loadFile() returns a Promise that rejects on failure — Electron's
    // main process runs on Node, where an unhandled rejection crashes the
    // whole process by default (since Node 15). Never leave this
    // uncaught, or any transient load failure takes the entire app down
    // silently with no error message at all.
    firstRunWindow
      .loadFile(path.join(__dirname, 'first-run.html'), {
        query: {
          email: config.seedAdminEmail,
          password: config.seedAdminPassword,
          configPath: getConfigPath(),
        },
      })
      .catch((err) => console.error('[main] first-run window failed to load:', err))
    firstRunWindow.webContents.on('did-finish-load', () => console.log('[main] first-run window loaded successfully.'))
    firstRunWindow.webContents.on('render-process-gone', (_e, details) =>
      console.error('[main] first-run window renderer crashed:', details),
    )
    // The page's "Continue" button calls window.close() — that's the
    // signal to proceed, not any IPC round-trip.
    firstRunWindow.on('closed', () => {
      console.log('[main] first-run window closed.')
      firstRunWindow = null
      resolve()
    })
  })
}

function runChildToCompletion(exePath, args, env, label, { captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { env, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      if (captureStdout) stdout += d.toString()
      process.stdout.write(`[${label}] ${d}`)
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      process.stderr.write(`[${label}] ${d}`)
    })
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${label} exited with code ${code}: ${stderr}`))
    })
    child.on('error', reject)
  })
}

// Whether to seed is decided from the database's REAL content (does any
// Class exist), not from whether config.json already exists. Found live
// (2026-08-12): a first launch that gets interrupted mid-seed — e.g. by an
// unrelated port conflict on this dev machine, but a crash or an
// antivirus-killed process would do the same on a real school PC — left
// config.json's password recorded with NO matching User row ever created,
// and every later launch saw config.json already existing and never
// retried. This check is what actually happened, so it can't desync the
// same way — whatever launch first finds an empty database completes the
// seeding, reusing config.json's already-generated (and possibly
// already-shown) credentials rather than generating new ones.
async function checkNeedsSeed(paths, dbEnv) {
  const output = await runChildToCompletion(
    paths.nodeExe,
    [paths.tsxCli, paths.checkSeededScript],
    dbEnv,
    'check-seeded',
    { captureStdout: true },
  )
  return output.includes('EMPTY')
}

async function runMigrations(paths, dbEnv, dbPath) {
  console.log(`[db] Running migrations against ${dbPath}...`)
  await runChildToCompletion(
    paths.nodeExe,
    [paths.prismaCli, 'migrate', 'deploy', '--schema', paths.prismaSchema],
    dbEnv,
    'prisma',
  )
}

async function seedDatabase(paths, dbEnv, config) {
  console.log('[db] Database has no real school data yet — seeding now...')
  await runChildToCompletion(paths.nodeExe, [paths.tsxCli, paths.seedScript], dbEnv, 'seed')
  await runChildToCompletion(
    paths.nodeExe,
    [paths.tsxCli, paths.seedAdminScript],
    { ...dbEnv, SEED_ADMIN_EMAIL: config.seedAdminEmail, SEED_ADMIN_PASSWORD: config.seedAdminPassword },
    'seed-admin',
  )
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
  // Without this, a spawn-level failure (bad path, EACCES, etc.) fires an
  // 'error' event with no listener, which Node treats as an uncaught
  // exception and crashes the whole main process immediately.
  child.on('error', (err) => console.error(`[${label}] spawn error:`, err))
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
  const config = loadOrCreateConfig()
  const dbPath = path.join(app.getPath('userData'), 'data', 'app.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const dbEnv = { ...process.env, DATABASE_URL: `file:${dbPath}` }

  // Migration + the seeded-content check run first and are awaited (fast,
  // a couple seconds at most) — whether to seed, and whether to show the
  // credentials window at all, both depend on knowing the database's real
  // state, not a guess made before checking it.
  await runMigrations(paths, dbEnv, dbPath)
  const needsSeed = await checkNeedsSeed(paths, dbEnv)

  // Credentials window shown in parallel with seeding + backend/solver
  // startup (not after) — first real launch can take a while (Windows
  // Defender scanning the freshly-installed exe/node_modules; observed
  // anywhere from ~20s to over 60s across repeated real-install tests),
  // so the credentials screen doubles as the wait indicator instead of
  // the school staring at a blank window.
  let firstRunWindowClosed = null
  if (needsSeed) {
    firstRunWindowClosed = showFirstRunWindow(config)
  }

  try {
    await Promise.all([
      (needsSeed ? seedDatabase(paths, dbEnv, config) : Promise.resolve()).then(() =>
        startBackendStack(paths, dbPath, config),
      ),
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
  win.loadURL(`http://localhost:${BACKEND_PORT}`).catch((err) => console.error('[main] main window failed to load:', err))
  win.webContents.on('did-finish-load', () => console.log('[main] main window loaded successfully.'))
  win.webContents.on('render-process-gone', (_e, details) => console.error('[main] main window renderer crashed:', details))
  // Quit when THIS window closes — not the generic app-wide
  // 'window-all-closed' event, which would also fire (and prematurely
  // quit the whole app) the moment the first-run credentials window
  // closes via its own "Continue" button, before the main window has
  // even opened yet.
  win.on('closed', () => {
    console.log('[main] main window closed — quitting.')
    app.quit()
  })
}

app.whenReady().then(() => {
  main().catch((error) => {
    console.error('[main] Fatal startup error:', error)
    writeCrashLog(error)
    app.quit()
  })
})

app.on('before-quit', killManagedProcesses)
