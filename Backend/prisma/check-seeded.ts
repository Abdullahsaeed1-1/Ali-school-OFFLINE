/**
 * check-seeded.ts — prints SEEDED or EMPTY depending on whether real
 * school data exists yet. Spawned by desktop/main.js after migrations,
 * to decide whether to run seed.ts/seed-admin.ts — NOT based on whether
 * config.json exists (see main.js comment: that flag can desync from the
 * database's real state if a previous run was interrupted mid-seed,
 * e.g. by a port conflict or a crash — the school would be left with
 * config.json's recorded password but no actual User row to match it,
 * and no way to retry since config.json already existing looked like
 * "already done"). Checking the database's real content directly makes
 * this resilient to that interruption, whenever/however it happens.
 *
 * npx tsx prisma/check-seeded.ts
 */
const { PrismaClient } = (await import('@prisma/client')) as any

const prisma = new PrismaClient()
const classCount = await prisma.class.count()
await prisma.$disconnect()

console.log(classCount === 0 ? 'EMPTY' : 'SEEDED')
