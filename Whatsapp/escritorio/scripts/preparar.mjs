/*
 * Prepara lo que va adentro del instalador (npm run empaquetar lo corre antes de armarlo):
 *   build/app-servidor           versión inicial del servidor y el panel (ver paquete.mjs)
 *   build/bin/ffmpeg.exe         ffmpeg (notas de voz, miniaturas, formas de onda)
 *   build/bin/cloudflared.exe    Cloudflare Tunnel (se baja de GitHub la primera vez)
 *   build/icon.ico, icono.png    el ícono, a partir del favicon del sitio
 *
 * El instalador casi nunca cambia: las versiones nuevas del servidor se publican con
 * `npm run publicar` y la PC servidor las baja sola.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ESCRITORIO, WHATSAPP, armarServidor } from './paquete.mjs'

const BUILD = path.join(ESCRITORIO, 'build')
const BIN = path.join(BUILD, 'bin')
const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
const paso = (t) => console.log(`\n▸ ${t}`)

paso('Servidor y panel (versión inicial del instalador)')
const ficha = armarServidor(path.join(BUILD, 'app-servidor'))
console.log(`Versión ${ficha.version}`)

paso('ffmpeg')
fs.mkdirSync(BIN, { recursive: true })
if (!ficha.ffmpeg) throw new Error('No se descargó ffmpeg (ffmpeg-static). Revisá la conexión y volvé a correr.')
const ffmpeg = path.join(BIN, 'ffmpeg.exe')
fs.writeFileSync(ffmpeg, ficha.ffmpeg)

paso('Cloudflare Tunnel')
const cloudflared = path.join(BIN, 'cloudflared.exe')
if (fs.existsSync(cloudflared)) {
  console.log('Ya estaba (borrá build/bin/cloudflared.exe para bajar la última versión)')
} else {
  const r = await fetch(CLOUDFLARED_URL)
  if (!r.ok) throw new Error(`No se pudo bajar cloudflared (${r.status})`)
  fs.writeFileSync(cloudflared, Buffer.from(await r.arrayBuffer()))
  console.log(`Descargado: ${(fs.statSync(cloudflared).size / 1048576).toFixed(1)} MB`)
}

paso('Ícono')
const favicon = path.join(WHATSAPP, '..', 'public', 'favicon.png')
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', favicon, '-vf', 'scale=256:256', path.join(BUILD, 'icon.ico')])
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', favicon, '-vf', 'scale=256:256', path.join(ESCRITORIO, 'icono.png')])

console.log('\nListo. Ahora: npx electron-builder --win nsis (o npm run empaquetar, que hace todo).')
