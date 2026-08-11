// Downloads the exact portable Node.exe bundled into the packaged app as
// extraResources/node-runtime (see ../package.json and ../main.js). Not
// committed to git (85MB binary) — run this once before `npm run dist`.
//
//   node scripts/fetch-node-runtime.mjs
//
// Pinned to the same Node version Backend/ was developed against, so the
// bundled runtime matches what Prisma's native query-engine binary (built
// during `npm install` in Backend/) actually expects.
import { createWriteStream, mkdirSync, renameSync, rmSync, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NODE_VERSION = 'v22.20.0'
const OUT_DIR = path.join(__dirname, '..', 'node-runtime')
const ZIP_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`
const ZIP_PATH = path.join(OUT_DIR, '_download.zip')
const EXTRACTED_DIR = path.join(OUT_DIR, `node-${NODE_VERSION}-win-x64`)

mkdirSync(OUT_DIR, { recursive: true })

console.log(`Downloading ${ZIP_URL} ...`)
const response = await fetch(ZIP_URL)
if (!response.ok) throw new Error(`Download failed: ${response.status}`)
await pipeline(response.body, createWriteStream(ZIP_PATH))

console.log('Extracting...')
execFileSync('powershell', ['-Command', `Expand-Archive -Path "${ZIP_PATH}" -DestinationPath "${OUT_DIR}" -Force`])

renameSync(path.join(EXTRACTED_DIR, 'node.exe'), path.join(OUT_DIR, 'node.exe'))
renameSync(path.join(EXTRACTED_DIR, 'LICENSE'), path.join(OUT_DIR, 'LICENSE-node.txt'))
rmSync(EXTRACTED_DIR, { recursive: true, force: true })
rmSync(ZIP_PATH, { force: true })

console.log(`Done: ${path.join(OUT_DIR, 'node.exe')}`)
