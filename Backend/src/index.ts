import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.routes.js'
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

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests with no Origin header (native mobile HTTP clients, curl, Postman)
      // aren't subject to browser CORS in the first place — let them through.
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true, // Required for cookies to work cross-origin
  }),
)

// Parse httpOnly cookies from incoming requests (needed by authMiddleware and auth controllers).
app.use(cookieParser())

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'OK', message: 'Ali School Backend Running' })
})

app.use('/api/auth', authRoutes)
app.use('/api/campuses', campusesRoutes)
app.use('/api/capacity-advisor', capacityAdvisorRoutes)
app.use('/api/classes', classesRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/subjects', subjectsRoutes)
app.use('/api/teachers', teachersRoutes)
app.use('/api/timetable', timetableRoutes)
app.use('/api/warnings', warningsRoutes)

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
