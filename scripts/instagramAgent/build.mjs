/**
 * Empaqueta scripts/instagramAgent/main.mjs como un .exe standalone usando
 * el sistema oficial de Node (Single Executable Applications): no hace
 * falta tener Node instalado en la compu que lo va a correr.
 *
 * Uso: npm run build:instagram-agent
 * Salida: dist-agent/ActualizarInstagram.exe
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, 'dist-agent')
const BUNDLE = path.join(OUT_DIR, 'bundle.cjs')
const SEA_CONFIG = path.join(OUT_DIR, 'sea-config.json')
const BLOB = path.join(OUT_DIR, 'sea-prep.blob')
const EXE = path.join(OUT_DIR, 'ActualizarInstagram.exe')

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

console.log('1/4 — Bundleando (esbuild)…')
await esbuild.build({
  entryPoints: [path.join(__dirname, 'main.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: BUNDLE,
})

console.log('2/4 — Generando el blob de la app (node --experimental-sea-config)…')
writeFileSync(SEA_CONFIG, JSON.stringify({ main: BUNDLE, output: BLOB, disableExperimentalSEAWarning: true }, null, 2))
execFileSync(process.execPath, ['--experimental-sea-config', SEA_CONFIG], { stdio: 'inherit' })

console.log('3/4 — Copiando el binario de Node…')
copyFileSync(process.execPath, EXE)
try {
  execFileSync('signtool', ['remove', '/s', EXE], { stdio: 'ignore' })
} catch {
  // No hay signtool o el binario no estaba firmado — normal en la mayoría
  // de las instalaciones de Node, no es un error.
}

console.log('4/4 — Inyectando el bundle en el binario (postject)…')
execFileSync(
  process.execPath,
  [
    path.join(ROOT, 'node_modules/postject/dist/cli.js'),
    EXE,
    'NODE_SEA_BLOB',
    BLOB,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ],
  { stdio: 'inherit' }
)

console.log(`\nListo: ${EXE}`)
