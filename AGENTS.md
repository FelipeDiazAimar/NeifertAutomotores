# Neifert Automotores — AGENTS.md

## Stack (no TypeScript)

- **React 19 + Vite 8** · JSX (no `.tsx` anywhere)
- **Tailwind CSS v4** — config in `vite.config.js` via `@tailwindcss/vite` plugin, not `tailwind.config`
- **Zustand** with `persist` (localStorage, key `nf-site-content`) for editable site content
- **TanStack Query** for remote data (vehicles, leads)
- **Framer Motion** + **Lenis** for animations/scroll
- **React Router v7** with `lazy()` code-splitting per page
- No test framework (no `test` script, no test files)

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
| `CRM_SYNC_*` | No | CRM sync proxy |
| `INSTAGRAM_AGENT_TOKEN` | No | Instagram sync |

`loadEnv(mode, cwd, '')` in vite.config.js loads ALL env vars (not just `VITE_` prefix) so proxies can use service-role keys.

## Conventions

- No TypeScript — all files are `.js` / `.jsx`
- Prettier with `prettier-plugin-tailwindcss` for class sorting
- Custom `inputCls` string in `ContentFields.jsx` for shared input styling
- `cn()` utility for conditional className merging
- Admin pages use `Section` + `TextField` from `ContentFields.jsx` for consistent form layout
- Zustand stores use `persist` middleware for demo mode; content auto-syncs in production
