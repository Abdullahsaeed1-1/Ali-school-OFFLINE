// Electron main process — Ali Public School offline desktop app.
// See docs/offline-conversion-plan.md Phase 4 for the architecture this
// implements: Backend runs as a spawned child process using a real,
// bundled Node executable (not require()'d in-process — avoids Prisma's
// native query-engine binary needing to match Electron's own bundled
// Node/V8 ABI), serving both the API and WebAdmin's static build from one
// port so any device on the school's LAN can reach it, not just this
// machine. The solver runs as a second child process, loopback-only,
// using the spawn/health-poll/kill mechanism proven in Phase 3.
const { app, BrowserWindow } = require('electron')
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
// would invalidate every session and account on every restart). A real
// first-run UI (wizard showing the generated admin password) is future
// work — for now it's written to config.json and logged to the console on
// first run only.
// ---------------------------------------------------------------------------
function loadOrCreateConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
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

async function ensureDatabase(paths, dbPath, config) {
  const isFirstRun = !fs.existsSync(dbPath)
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
  // ~20s+ on first run after a real NSIS install vs. ~2-7s on a machine
  // that had already run/scanned the same exe before.
  await waitForHttpOk(`http://127.0.0.1:${SOLVER_PORT}/health`, 60_000)
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
  await waitForHttpOk(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 60_000)
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

  await ensureDatabase(paths, dbPath, config)
  await startBackendStack(paths, dbPath, config)

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Ali Public School',
  })
  win.loadURL(`http://localhost:${BACKEND_PORT}`)
}

app.whenReady().then(() => {
  main().catch((error) => {
    console.error('[main] Fatal startup error:', error)
    app.quit()
  })
})

app.on('window-all-closed', () => {
  // Windows/Linux convention: quitting the last window quits the app
  // (unlike macOS) — matches a single-purpose desktop app, not a
  // multi-window productivity suite.
  app.quit()
})

app.on('before-quit', killManagedProcesses)
