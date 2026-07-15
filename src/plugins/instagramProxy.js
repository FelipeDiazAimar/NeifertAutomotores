import { fetchInstagramPage } from '../server/instagramCore.js'

/**
 * Plugin de Vite que expone /api/instagram-proxy en el servidor de desarrollo.
 * La lógica real vive en src/server/instagramCore.js (compartida con la
 * función serverless de producción en api/instagram-proxy.js).
 *
 * GET /api/instagram-proxy          → primera página (24 posts)
 * GET /api/instagram-proxy?after=X  → página siguiente (cursor X)
 */
export function instagramProxyPlugin() {
  return {
    name: 'instagram-proxy',
    configureServer(server) {
      server.middlewares.use('/api/instagram-proxy', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const after = new URL(req.url, 'http://x').searchParams.get('after') ?? null

        try {
          const page = await fetchInstagramPage(after)
          res.end(JSON.stringify(page))
        } catch (err) {
          console.error('[instagram-proxy] Error:', err.message)
          res.statusCode = 502
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}
