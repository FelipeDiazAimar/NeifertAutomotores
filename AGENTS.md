# Neifert Automotores — AGENTS.md

## Stack (no TypeScript)

- **React 19 + Vite 8** · JSX (no `.tsx` anywhere)
- **Tailwind CSS v4** — config in `vite.config.js` via `@tailwindcss/vite` plugin, not `tailwind.config`
- **Zustand** with `persist` (localStorage, key `nf-site-content`) for editable site content
- **TanStack Query** for remote data (vehicles, leads)
- **Framer Motion** + **Lenis** for animations/scroll
- **React Router v7** with `lazy()` code-splitting per page
- **Vitest + Testing Library** (`npm test` → `vitest run`, jsdom) for unit/integration tests

## Commands

```sh
npm run dev       # vite (port from $PORT or 5173)
npm run build     # vite build → dist/
npm run preview   # vite preview (serve built dist)
npm run lint      # eslint .
npm run format    # prettier --write "src/**/*.{js,jsx,css}"
```

Required order before commits: `npm run lint && npm run build`.

## Project structure

```
src/
  components/
    admin/        # ImageUploader, VideoUploader, VehicleForm, ContentFields
    catalog/      # Vehicle cards, filters, gallery
    common/       # Button, GlassCard, Spinner, etc.
    home/         # HeroCarousel, StoryCard, ZigZagSection, StoryCTA
    layout/       # PublicLayout, AdminLayout + nav
    stats/        # Charts and analytics components
  lib/            # Helpers, constants, mockData, mediaFormats
  pages/
    admin/        # AdminCatalogPage, AdminContentPage, StatsPage, AdminUsersPage
    auth/         # LoginPage
    public/       # HomePage, CatalogPage, VehicleDetailPage, etc.
  plugins/        # Vite proxy plugins (CRM, R2, Instagram sync)
  routes/         # AppRouter.jsx + ProtectedRoute
  services/       # Supabase layer with demo fallback
  store/          # useSiteStore (content), useCatalogStore, useAuthStore
```

## Routing

- Public routes under `<PublicLayout>`: `/`, `/catalogo`, `/catalogo/:id`, `/instagram`, `/cita`, `/contacto`, `/terminos`, `/privacidad`, `/cookies`
- Admin routes under `<ProtectedRoute>` + `<AdminLayout>`: `/admin/catalogo`, `/admin/contenido`, `/admin/estadisticas`, `/admin/usuarios`
- `/login` is standalone (no layout wrapper)

## Admin content editing

`/admin/contenido` has tabs: Home, Catálogo, Instagram, Footer, Redes & Contacto.

Home page images use these aspect ratios (defined in `src/lib/mediaFormats.js`):

| Section       | Aspect ratio | Constant                   | Max size |
|---------------|-------------|----------------------------|----------|
| Carrusel      | 21:9        | `HOME_ASPECT_RATIOS.carousel` | 10 MB |
| ZigZag (StoryCard) | 4:5     | `HOME_ASPECT_RATIOS.story`    | 10 or 50 MB |
| CTA           | 21:9        | `HOME_ASPECT_RATIOS.cta`      | 10 MB |
| Video         | 4:5         | `HOME_ASPECT_RATIOS.story`    | 50 MB |

`ImageUploader` accepts `aspectRatio` (`{ w, h }`) and `maxSizeMB` props. Defaults to 1:1 square / 5 MB for vehicle photos.

`ImageCropper` is a reusable crop modal extracted from ImageUploader. It shows a translucent overlay outside the crop area for positioning precision.

## Media upload flow

1. User selects file → `cropQueue` state → `ImageCropper` modal opens
2. User positions/zooms/rotates → confirms crop
3. Cropped file → `uploadImageMedia(file, { maxSizeMB, skipRatioCheck })` → Cloudflare R2 (presigned URL) → Supabase Storage fallback → dataURL demo fallback
4. `skipRatioCheck` is `true` when `aspectRatio` is not 1:1 (avoids misleading "recommended ratio" warnings)
5. Image compression uses `compressImage()` targeting `maxSizeMB` or `MAX_IMAGE_MB` (5 MB)

Video upload uses `uploadVideoMedia(file, { maxSizeMB })` with `validateVideoFile(file, maxMB)`. Default limit: 1024 MB.

## Data modes

- **Demo mode** (no `.env` / no Supabase creds): uses localStorage + mock data. Content store persists to `nf-site-content`.
- **Production mode** (Supabase env vars set): uses Supabase Auth, Database, Storage, Realtime. Content store auto-syncs via `saveSiteContent` with 800 ms debounce.

The service layer (`src/services/`) decides mode at runtime via `isSupabaseConfigured`.

## Imports & aliases

- `@` → `src/` (configured in `vite.config.js`)
- All UI uses `@/lib/cn` (wrapper around `tailwind-merge` + `clsx`)

## Key Vite plugins (proxies)

All in `src/plugins/`: `instagramProxy`, `crmProxy`, `r2Proxy`, `usersProxy`, `instagramSyncProxy`, `instagramReportSyncProxy`. These create dev-only API endpoints for CRM sync, R2 upload, Instagram scraping, etc.

## Environment variables

| Variable | Required | Used for |
|----------|----------|----------|
| `VITE_SUPABASE_URL` | No (demo if absent) | Supabase connection |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anon key |
| `VITE_WHATSAPP_PHONE` | No | WhatsApp button number |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Vite proxies (server-side only) |
| `R2_*` | No | Cloudflare R2 storage via proxy |
| `CRM_EXT_API_TOKEN` | No | CRM viejo: API pública (stock + leads) |
| `CRM_SYNC_*` | No | CRM viejo: panel interno (cartera completa de clientes) |
| `INSTAGRAM_AGENT_TOKEN` | No | Instagram sync |
| `CRON_SECRET` | Sí (prod) | Auth del cron `api/crm/check-alertas` (`Authorization: Bearer`) |
| `SEED_SECRET` | No (cae a `CRON_SECRET`) | Script `scripts/seed-crm-usuarios.mjs` |
| `RESEND_API_KEY` | Sí (prod, alertas) | Emails de alertas vía Resend (solo servidor) |
| `VITE_VAPID_PUBLIC_KEY` | Sí (prod, alertas) | Web Push (la usa el frontend para suscribirse) |
| `VAPID_PRIVATE_KEY` | Sí (prod, alertas) | Web Push (solo servidor) |
| `VAPID_SUBJECT` | Sí (prod, alertas) | Web Push (`mailto:alertas@neifertautomotores.com`) |
| `WA_SUPABASE_URL` (o `WA_DATABASE_URL`) | Sí (WhatsApp en solo lectura) | Base del WhatsApp: el CRM lee los chats guardados cuando la PC servidor está apagada (`/wa-lectura/`) |
| `WA_R2_BUCKET`, `WA_R2_ENDPOINT`, `WA_R2_ACCESS_KEY_ID`, `WA_R2_SECRET_ACCESS_KEY` | Sí (WhatsApp en solo lectura) | Archivos y fotos del WhatsApp en R2 (enlaces temporales de descarga) |
| `WA_LINEA` | No | Línea a mostrar en solo lectura si ningún servidor anotó todavía este CRM (cada servidor anota su `CRM_URL` → línea al arrancar; si no hay ninguna, se avisa y no se muestra otra) |

`loadEnv(mode, cwd, '')` in vite.config.js loads ALL env vars (not just `VITE_` prefix) so proxies can use service-role keys.

## Conventions

- No TypeScript — all files are `.js` / `.jsx`
- Prettier with `prettier-plugin-tailwindcss` for class sorting
- Custom `inputCls` string in `ContentFields.jsx` for shared input styling
- `cn()` utility for conditional className merging
- Admin pages use `Section` + `TextField` from `ContentFields.jsx` for consistent form layout
- Zustand stores use `persist` middleware for demo mode; content auto-syncs in production
