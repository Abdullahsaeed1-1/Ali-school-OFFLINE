import type { Request, Response } from 'express'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { prisma } from '../config/prisma.js'
import { handleControllerError } from '../utils/apiError.js'

// ---------------------------------------------------------------------------
// GET /api/backup  (ADMIN only)
// Offline desktop app has no cloud sync and no automated backups (see
// docs/offline-conversion-plan.md) — this is the school's only way to get a
// copy of their own data, whether for safekeeping or to hand to Abdullah so
// a future app update can be developed/tested against their real data
// instead of the seed baseline.
// ---------------------------------------------------------------------------
export const downloadBackup = async (_req: Request, res: Response) => {
  // A fresh snapshot file, not the live .db — `VACUUM INTO` gives a single,
  // consistent file regardless of whether the live database is in WAL mode
  // (a plain copy of just the main .db file could miss rows still sitting
  // in a `-wal` file that hasn't been checkpointed back yet).
  const tempPath = path.join(os.tmpdir(), `ali-school-backup-${Date.now()}-${process.pid}.db`)
  try {
    // tempPath is built entirely from server-generated values (os.tmpdir(),
    // Date.now(), process.pid) — no request input reaches this string, so
    // this isn't the raw-SQL-with-user-input pattern the security baseline
    // warns against. VACUUM INTO doesn't support parameter binding for the
    // target filename in better-sqlite3/Prisma's SQLite driver, so a quote
    // escape is enough to keep the SQL well-formed.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`)

    const filename = `ali-school-backup-${new Date().toISOString().slice(0, 10)}.db`
    res.download(tempPath, filename, (err) => {
      fs.unlink(tempPath, () => {})
      if (err && !res.headersSent) {
        console.error('[backup] Failed to send backup file:', err)
      }
    })
  } catch (error) {
    fs.unlink(tempPath, () => {})
    return handleControllerError(error, res)
  }
}
