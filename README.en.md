<div align="center">

# Neifert Automotores — Premium Dealership Site + Commercial Panel

**High-impact catalog/brand site with private dashboard (inventory, leads, content, users, metrics). React 19 + Vite 8 + Tailwind v4 + Supabase + R2.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase)](https://supabase.com/)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://neifert-automotores.vercel.app)

**[🚀 Live Demo](https://neifert-automotores.vercel.app) · [📦 Repo](https://github.com/FelipeDiazAimar/NeifertAutomotores) · [🇪🇸 Español](README.md)**

</div>

## What is it?

Premium web for a car dealership (San Francisco, Córdoba): public catalog with brand storytelling + WhatsApp contact, plus a private dashboard for inventory, leads, editable site content (`/admin/contenido` tabs), users and stats. Two modes: **demo** (no Supabase → localStorage + mocks) and **production** (Supabase Auth/DB/Storage/Realtime with 800 ms debounced content sync).

## Stack & run

JS-only (no TS): React `19.2` + Vite `8.1` + Tailwind v4 (via plugin) · Zustand `5` persist (`nf-site-content`) · TanStack Query `5.101` · Framer Motion `12` + Lenis · Router `7.18` lazy · RHF + Zod 4 · R2 (`@aws-sdk/s3`) with Supabase/dataURL fallbacks + crop/compress flow · `docx`, `heic2any`, `web-push`, Recharts 3 · Vitest + Testing Library · `@` → `src/` alias · dev-only Vite proxies (CRM/R2/Instagram). Routes: public `/`, `/catalogo/:id`, `/instagram`, `/cita`, `/contacto`, legal; admin `/admin/catalogo|contenido|estadisticas|usuarios` + `/login`.

```bash
npm install
npm run dev        # 👉 http://localhost:5173 ($PORT aware)
npm run lint && npm run build   # required gate before commits
npm test           # vitest run
```

Env: `VITE_SUPABASE_URL/ANON_KEY` (demo if absent), `VITE_WHATSAPP_PHONE`, R2/CRM/Instagram keys, VAPID + Resend + `CRON_SECRET` in prod (see AGENTS.md table). Deploy: Vercel (`vercel.json`), live https://neifert-automotores.vercel.app.

## Author

**Felipe Diaz Aimar** — https://www.linkedin.com/in/felipe-aimar/ · felipediazaimar@gmail.com · https://github.com/FelipeDiazAimar · Private project, all rights reserved.
