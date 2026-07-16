import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { instagramProxyPlugin } from './src/plugins/instagramProxy.js'
import { crmProxyPlugin } from './src/plugins/crmProxy.js'
import { r2ProxyPlugin } from './src/plugins/r2Proxy.js'
import { usersProxyPlugin } from './src/plugins/usersProxy.js'
import { instagramSyncProxyPlugin } from './src/plugins/instagramSyncProxy.js'
import { instagramReportSyncProxyPlugin } from './src/plugins/instagramReportSyncProxy.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' = carga TODAS las vars de .env (no solo las con prefijo VITE_), para
  // poder pasarle al proxy del CRM la service role key sin exponerla al bundle
  // del cliente (import.meta.env solo expone las VITE_*).
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      instagramProxyPlugin(),
      crmProxyPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        crmSyncUser: env.CRM_SYNC_USER,
        crmSyncPass: env.CRM_SYNC_PASS,
      }),
      r2ProxyPlugin({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET_NAME,
        endpoint: env.R2_ENDPOINT,
        publicUrlBase: env.R2_PUBLIC_URL,
        storageLimitGB: parseInt(env.R2_STORAGE_LIMIT_GB || '0') || 10,
      }),
      usersProxyPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      instagramSyncProxyPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        r2AccessKeyId: env.R2_ACCESS_KEY_ID,
        r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
        r2Bucket: env.R2_BUCKET_NAME,
        r2Endpoint: env.R2_ENDPOINT,
        r2PublicUrl: env.R2_PUBLIC_URL,
      }),
      instagramReportSyncProxyPlugin({
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        agentToken: env.INSTAGRAM_AGENT_TOKEN,
        r2PublicUrl: env.R2_PUBLIC_URL,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: parseInt(process.env.PORT || '5173'),
      strictPort: false,
    },
    build: {
      chunkSizeWarningLimit: 700,
    },
  }
})
