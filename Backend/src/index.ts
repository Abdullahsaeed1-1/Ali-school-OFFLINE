import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.routes.js'
import backupRoutes from './routes/backup.routes.js'
import campusesRoutes from './routes/campuses.routes.js'
import capacityAdvisorRoutes from './routes/capacityAdvisor.routes.js'
import classesRoutes from './routes/classes.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import subjectsRoutes from './routes/subjects.routes.js'
import teachersRoutes from './routes/teachers.routes.js'
import timetableRoutes from './routes/timetable.routes.js'
import warningsRoutes from './routes/warnings.routes.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3000)

// CORS — allow only known frontend origins (WebAdmin + Flutter web, via env vars).
// credentials: true is required for the browser to send/receive httpOnly cookies
// on cross-origin requests between the dev servers and the Express API.
const allowedOrigins = [process.env.WEBADMIN_ORIGIN, process.env.FLUTTER_WEB_ORIGIN].filter(
  (origin): origin is string => Boolean(origin),
)
if (allowedOrigins.length === 0) {
  console.warn(
    '[WARN] No WEBADMIN_ORIGIN/FLUTTER_WEB_ORIGIN env vars set — CORS will block all cross-origin requests.',
  )
}

// Wrapped in a per-request middleware (rather than a single static `cors()`
// call) so the origin check can see `req` — needed for the same-origin
// exception below. Found live (2026-08-12, offline desktop app): Vite
// tags its built `<script type="module">`/`<link>` tags with a
// `crossorigin` attribute, which makes Chromium send a real `Origin`
// header even for a same-origin request. That's fine for the online
// deployment (WEBADMIN_ORIGIN is always set there), but the offline
// Electron app serves WebAdmin from itself — the Origin header ends up
// being the page's own address (`http://localhost:PORT`, or
// `http://<LAN-IP>:PORT` for another device on the school's network),
// which was never in `allowedOrigins` and got rejected with a 403,
// breaking every asset load. A request whose Origin matches its own Host
// is by definition same-origin and must never be blocked, regardless of
// which specific host/port/IP this instance happens to be reached at.
app.use((req, res, next) => {
  const requestOrigin = `${req.protocol}://${req.headers.host}`
  cors({
    origin: (origin, callback) => {
      // Requests with no Origin header (native mobile HTTP clients, curl, Postman)
      // aren't subject to browser CORS in the first place — let them through.
      if (!origin) return callback(null, true)
      if (origin === requestOrigin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true, // Required for cookies to work cross-origin
  })(req, res, next)
})

// Parse httpOnly cookies from incoming requests (needed by authMiddleware and auth controllers).
app.use(cookieParser())

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'OK', message: 'Ali School Backend Running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/backup', backupRoutes)
app.use('/api/campuses', campusesRoutes)
app.use('/api/capacity-advisor', capacityAdvisorRoutes)
app.use('/api/classes', classesRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/subjects', subjectsRoutes)
app.use('/api/teachers', teachersRoutes)
app.use('/api/timetable', timetableRoutes)
app.use('/api/warnings', warningsRoutes)

// Offline desktop app (docs/offline-conversion-plan.md Phase 4): serves
// WebAdmin's built static files from this same Express app/port instead of
// a separate Vercel deployment, so the API and frontend are same-origin —
// both to the Electron window on the host machine AND to any other device
// on the school's LAN that opens a browser to this machine's IP. Only
// active when WEBADMIN_DIST_PATH is set (Electron's main process sets it;
// plain `npm run dev` against the Vite dev server on 5173 never does, so
// local dev is unaffected).
const webAdminDistPath = process.env.WEBADMIN_DIST_PATH
if (webAdminDistPath && fs.existsSync(webAdminDistPath)) {
  app.use(express.static(webAdminDistPath))
  // SPA fallback — anything that isn't an API route or a real static file
  // (client-side routes like /teachers, /classes/:id) gets index.html so
  // React Router can take over. Express 5 dropped bare `*` wildcard route
  // patterns (path-to-regexp v8), so this is a plain middleware check
  // rather than a route pattern.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(webAdminDistPath, 'index.html'))
  })
} else if (webAdminDistPath) {
  console.warn(`[WARN] WEBADMIN_DIST_PATH=${webAdminDistPath} does not exist — not serving WebAdmin static files.`)
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'ROUTE_NOT_FOUND' })
})

// Centralized error handler — the last line of defense. Any error passed to
// next(err) (including CORS rejections and anything an async controller
// forgets to catch) lands here instead of leaking a stack trace to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Origin not allowed', code: 'CORS_FORBIDDEN' })
  }
  console.error('[unhandled server error]', err)
  return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL_ERROR' })
})

// Explicit '0.0.0.0' — Railway (and most container platforms) proxy in
// from outside the container, so the server must accept connections on
// every interface, not just loopback. Node's documented default when the
// host arg is omitted is already "all interfaces" (:: or 0.0.0.0), but
// leaving it implicit is exactly the kind of thing worth being explicit
// about in a container context rather than relying on default behavior.
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})

// Without this, Node's default behavior for a port already held by another
// process (e.g. an unrelated project's dev server) is to throw an unhandled
// 'error' event with a raw stack trace that's easy to miss — leaving that
// other process silently answering all API calls instead, which looks like
// a network/CORS bug to every client (WebAdmin, Flutter) rather than what it
// actually is.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[FATAL] Port ${PORT} is already in use by another process — the Ali School Backend did NOT start.\n` +
        `Find and stop whatever is using port ${PORT}, then restart.\n`,
    )
    process.exit(1)
  }
  throw err
})
