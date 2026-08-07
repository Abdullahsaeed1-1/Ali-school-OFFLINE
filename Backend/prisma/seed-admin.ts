/**
 * seed-admin.ts
 *
 * Creates (or updates) a single ADMIN user for development/testing purposes.
 * Credentials are read from env vars — never hardcoded.
 *
 * Usage:
 *   npx ts-node --esm prisma/seed-admin.ts
 *
 * Required env vars (in Backend/.env):
 *   SEED_ADMIN_EMAIL=admin@example.com
 *   SEED_ADMIN_PASSWORD=<at least 8 characters>
 *
 * ⚠️  DEV-ONLY: This creates a predictable account from env vars.
 *     Change the password (or delete this account) before going to production.
 */

import 'dotenv/config'
import bcrypt from 'bcrypt'
import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.error(
      '❌  SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env before running this script.',
    )
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('❌  SEED_ADMIN_PASSWORD must be at least 8 characters.')
    process.exit(1)
  }

  const normalizedEmail = email.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      passwordHash,
      role: Role.ADMIN,
    },
    update: {
      passwordHash,
      role: Role.ADMIN,
    },
  })

  console.log(`✅  Admin user upserted: ${user.email} (id: ${user.id})`)
  console.log('')
  console.log(
    '⚠️   DEV-ONLY REMINDER: This account was seeded from env vars.',
  )
  console.log(
    '    Change SEED_ADMIN_PASSWORD or remove this account before deploying to production.',
  )
}

seedAdmin()
  .catch((err) => {
    console.error('❌  Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
