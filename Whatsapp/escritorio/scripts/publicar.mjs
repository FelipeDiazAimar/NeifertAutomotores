/*
 * Publica una versión nueva del servidor de WhatsApp para que la PC servidor la baje sola
 * (revisa al arrancar y cada 10 minutos). No hace falta tocar el instalador ni la PC.
 *
 *   cd Whatsapp/escritorio
 *   npm run publicar
 *
 * Sube a R2 (el bucket privado del WhatsApp, con las credenciales de Whatsapp/servidor/.env):
 *   app/servidor/<versión>.tar.gz   el paquete (ver paquete.mjs)
 *   app/servidor/ultima.json        cuál es la vigente, con su huella SHA-256
 * y deja solo las últimas 5 versiones.
 *
 * Antes de publicar, que pasen los tests y el lint: lo que se publica lo corre la PC
 * servidor en cuanto lo ve.
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { WHATSAPP, armarServidor } from './paquete.mjs'

const PREFIJO = 'app/servidor/'
const CONSERVAR = 5
const servidor = (m) => import(pathToFileURL(path.join(WHATSAPP, 'servidor', 'src', m)).href)
const { ARCHIVOS_EN_R2, R2 } = await servidor('config.js')
const { borrar, guardar, listarArchivos } = await servidor('archivos.js')

if (!ARCHIVOS_EN_R2) {
  console.error('R2 no está configurado en Whatsapp/servidor/.env (WA_R2_BUCKET y credenciales): no hay dónde publicar.')
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-wa-publicar-'))
try {
  console.log('▸ Armando el paquete')
  const ficha = armarServidor(path.join(tmp, 'app-servidor'))
  if (ficha.modificado) console.log('  ⚠ Hay cambios sin commitear en servidor/ o web/: se publican igual (versión con "-mod").')

  console.log('▸ Comprimiendo')
  const archivo = path.join(tmp, `${ficha.version}.tar.gz`)
  // El tar de Windows (bsdtar), con rutas relativas: el de Git Bash toma "C:" como un host remoto.
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  execFileSync(tar, ['-czf', path.basename(archivo), 'app-servidor'], { cwd: tmp })
  const datos = fs.readFileSync(archivo)
  const sha256 = crypto.createHash('sha256').update(datos).digest('hex')
  console.log(`  ${(datos.length / 1048576).toFixed(1)} MB · sha256 ${sha256.slice(0, 16)}…`)

  console.log(`▸ Subiendo a R2 (bucket ${R2.bucket})`)
  const clave = `${PREFIJO}${ficha.version}.tar.gz`
  await guardar(clave, datos, 'application/gzip')
  // La ficha va última: recién ahí la PC servidor ve la versión nueva.
  const ultima = { version: ficha.version, archivo: clave, sha256, bytes: datos.length, commit: ficha.commit, creado: ficha.creado }
  await guardar(`${PREFIJO}ultima.json`, Buffer.from(JSON.stringify(ultima, null, 2)), 'application/json')

  const viejas = (await listarArchivos(PREFIJO))
    .filter((a) => a.clave.endsWith('.tar.gz'))
    .sort((a, b) => b.clave.localeCompare(a.clave))
    .slice(CONSERVAR)
  for (const v of viejas) await borrar(v.clave)

  console.log(`\nPublicada la versión ${ficha.version}.`)
  console.log('La PC servidor la toma en menos de 10 minutos (o ya: ícono → "Buscar actualización ahora").')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
