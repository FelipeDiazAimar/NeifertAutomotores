/*
 * Arma el paquete del servidor de WhatsApp (servidor + panel + dependencias de producción),
 * tal como lo corre la app de escritorio. Lo usan:
 *   preparar.mjs  la versión inicial que va adentro del instalador
 *   publicar.mjs  las actualizaciones que la PC servidor baja sola de R2
 *
 * Nunca lleva .env, data/ ni tests: ni claves ni conversaciones. Tampoco el binario de
 * ffmpeg (80 MB): lo trae el instalador y el servidor lo encuentra por WA_FFMPEG.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ESCRITORIO = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const WHATSAPP = path.join(ESCRITORIO, '..')

/** Versión: fecha y hora + commit (con "-mod" si había cambios sin commitear). */
export function versionNueva() {
  const d = new Date()
  const dos = (n) => String(n).padStart(2, '0')
  const fecha = `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`
  let commit = 'sin-git'
  let modificado = false
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: WHATSAPP }).toString().trim()
    modificado = execSync('git status --porcelain -- servidor web', { cwd: WHATSAPP }).toString().trim() !== ''
  } catch {}
  return { version: `${fecha}-${commit}${modificado ? '-mod' : ''}`, commit, modificado }
}

/** Arma el paquete en `destino` (se borra antes). Devuelve la ficha de versión. */
export function armarServidor(destino) {
  fs.rmSync(destino, { recursive: true, force: true })
  const servidor = path.join(WHATSAPP, 'servidor')
  const destinoServidor = path.join(destino, 'servidor')
  for (const item of ['index.js', 'package.json', 'package-lock.json', 'src', 'scripts']) {
    fs.cpSync(path.join(servidor, item), path.join(destinoServidor, item), { recursive: true })
  }
  fs.cpSync(path.join(WHATSAPP, 'web'), path.join(destino, 'web'), { recursive: true })
  for (const prohibido of ['.env', 'data', 'test']) {
    if (fs.existsSync(path.join(destinoServidor, prohibido))) throw new Error(`No debería haberse copiado ${prohibido}`)
  }

  execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: destinoServidor, stdio: 'inherit' })
  // El binario de ffmpeg lo pone la app (resources/bin/ffmpeg.exe).
  const ffmpeg = path.join(destinoServidor, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  const binario = fs.existsSync(ffmpeg) ? fs.readFileSync(ffmpeg) : null
  fs.rmSync(ffmpeg, { force: true })

  const ficha = { ...versionNueva(), creado: new Date().toISOString() }
  fs.writeFileSync(path.join(destino, 'version.json'), JSON.stringify(ficha, null, 2))
  return { ...ficha, ffmpeg: binario }
}
