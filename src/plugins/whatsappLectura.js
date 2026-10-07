import fs from 'node:fs'
import path from 'node:path'
import { handleWhatsappLectura } from '../server/whatsappLectura.js'

/**
 * WhatsApp en solo lectura (para cuando la PC servidor está apagada):
 *   - En el build copia el panel del WhatsApp (Whatsapp/web) a dist/wa-lectura, así el
 *     CRM lo puede abrir sin la PC. En producción, /wa-lectura/api/* lo atiende la
 *     función de api/crm/usuarios.js (ver vercel.json).
 *   - En desarrollo sirve esa misma copia y sus rutas de lectura (src/server/whatsappLectura.js).
 */
const PANEL = path.resolve(import.meta.dirname, '../../Whatsapp/web')
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = ''
    req.on('data', (c) => (datos += c))
    req.on('end', () => {
      try {
        resolve(datos ? JSON.parse(datos) : {})
      } catch {
        resolve({})
      }
    })
  })
}

export function whatsappLecturaPlugin({ env = {} } = {}) {
  let salida = 'dist'
  return {
    name: 'whatsapp-lectura',
    configResolved(config) {
      salida = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/wa-lectura/api', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        req.query = Object.fromEntries(url.searchParams)
        if (req.method === 'POST') req.body = await leerCuerpo(req)
        await handleWhatsappLectura(req, res, { env, ruta: url.pathname.replace(/^\/+/, '') })
      })
      server.middlewares.use('/wa-lectura', (req, res, next) => {
        const pedido = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        const archivo = path.join(PANEL, pedido === '/' ? 'index.html' : pedido)
        if (!archivo.startsWith(PANEL) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return next()
        res.setHeader('Content-Type', TIPOS[path.extname(archivo)] || 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(archivo).pipe(res)
      })
    },
    closeBundle() {
      if (!fs.existsSync(PANEL)) return
      fs.cpSync(PANEL, path.join(salida, 'wa-lectura'), { recursive: true })
    },
  }
}
