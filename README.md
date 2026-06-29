# Neifert Automotores

Web premium para **Neifert Automotores**, concesionaria ubicada en San Francisco, Córdoba. El proyecto combina una experiencia pública de catálogo y marca con un panel interno para gestionar vehículos, leads, contenido, usuarios y métricas comerciales.

La app funciona en dos modos:

- **Modo demo:** sin Supabase configurado, usa datos locales para poder recorrer la web y entrar al panel.
- **Modo producción:** conectada a Supabase para autenticación, base de datos, storage y realtime.

## Tabla De Contenidos

- [Vista general](#vista-general)
- [Características](#características)
- [Stack técnico](#stack-técnico)
- [Requisitos](#requisitos)
- [Instalación rápida](#instalación-rápida)
- [Variables de entorno](#variables-de-entorno)
- [Conectar Supabase](#conectar-supabase)
- [Scripts disponibles](#scripts-disponibles)
- [Rutas](#rutas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Flujo de administración](#flujo-de-administración)
- [Datos, realtime y storage](#datos-realtime-y-storage)
- [Deploy](#deploy)
- [Calidad y mantenimiento](#calidad-y-mantenimiento)

## Vista General

Neifert Automotores está pensada como una web de alto impacto visual para mostrar unidades premium, contar historias reales del salón y facilitar el contacto por WhatsApp. En paralelo, incluye un dashboard privado para que el equipo comercial pueda administrar el inventario, registrar oportunidades y revisar indicadores.

**Experiencia pública**

- Home con hero editorial, historias, testimonios y mapa.
- Catálogo con búsqueda, filtros, ordenamiento y vista de detalle.
- Página de Instagram editable desde el admin.
- Página de cita/contacto con mensaje directo a WhatsApp.
- Navegación responsive y modo claro/oscuro.

**Panel interno**

- CRM de leads con estados, filtros rápidos, búsqueda y vista mobile.
- Administración de catálogo con alta, edición, baja, imágenes y accesos rápidos.
- Gestión de contenido de home, Instagram, footer, redes y contacto.
- Dashboard de estadísticas con KPIs, tráfico, canales y modelos más buscados.
- Pantalla de usuarios para gestión de accesos.

## Características

- **Catálogo editable:** vehículos con marca, modelo, año, kilometraje, precio, categoría, estado, imágenes y ficha de detalle.
- **Leads comerciales:** formulario de registro, seguimiento por estado y actualización realtime cuando Supabase está conectado.
- **Integración WhatsApp:** botones globales, mensajes prearmados por vehículo y formulario de cita.
- **Contenido autogestionable:** textos principales, historias, testimonios, galería de Instagram, footer y datos de contacto.
- **Analítica comercial:** KPIs, leads por canal, tráfico, tendencia de cierre y modelos destacados.
- **Modo demo completo:** permite evaluar la interfaz sin backend real.
- **Supabase listo:** schema, seed, RLS, views, storage público y realtime.
- **Diseño responsive:** layouts adaptados para escritorio y mobile, con tab bars y paneles optimizados.
- **Animaciones cuidadas:** Framer Motion y Lenis para transiciones suaves.

## Stack Técnico

- **Frontend:** React 19, Vite 8, JSX.
- **Estilos:** Tailwind CSS v4, tokens propios, glassmorphism, dark/light mode.
- **Estado:** Zustand para UI, catálogo, CRM y contenido editable.
- **Datos remotos:** TanStack Query.
- **Backend:** Supabase Auth, Database, Storage y Realtime.
- **Formularios:** React Hook Form y Zod.
- **Gráficos:** Recharts.
- **Animaciones:** Framer Motion y Lenis.
- **Iconos:** Lucide React.
- **Notificaciones:** Sonner.
- **Calidad:** ESLint y Prettier.

## Requisitos

- Node.js 18 o superior.
- npm.
- Opcional: una cuenta/proyecto en Supabase para usar backend real.

## Instalación Rápida

```bash
npm install
npm run dev
```

Por defecto, Vite levanta la app en:

```txt
http://localhost:5173
```

Si no existe un archivo `.env` con credenciales de Supabase, la app entra automáticamente en **modo demo**. En ese modo se pueden ver las pantallas públicas y recorrer el panel con datos de ejemplo.

## Variables De Entorno

Copiá el ejemplo:

```bash
cp .env.example .env
```

Contenido esperado:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
VITE_WHATSAPP_PHONE=5491100000000
```

### Variables

| Variable | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | API anon key pública de Supabase. |
| `VITE_WHATSAPP_PHONE` | Número del salón en formato internacional, sin `+` ni espacios. |

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar el archivo [`supabase/schema.sql`](supabase/schema.sql).
4. Ejecutar el archivo [`supabase/seed.sql`](supabase/seed.sql) para cargar datos iniciales.
5. Crear `.env` desde `.env.example` y completar las credenciales.
6. Reiniciar el servidor:

```bash
npm run dev
```

### Usuario Administrador

El panel `/admin/*` requiere una sesión válida cuando Supabase está configurado. Creá un usuario desde **Authentication > Users** en Supabase.

Para actualizar el perfil del primer usuario:

```sql
update public.profiles
set full_name = 'Marcos Neifert', role = 'Gerente de Ventas'
where id = (select id from auth.users order by created_at limit 1);
```

## Scripts Disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Genera el build de producción en `dist/`. |
| `npm run preview` | Sirve localmente el build generado. |
| `npm run lint` | Ejecuta ESLint sobre el proyecto. |
| `npm run format` | Formatea `src/**/*.{js,jsx,css}` con Prettier. |

## Rutas

### Públicas

| Ruta | Pantalla |
| --- | --- |
| `/` | Home con hero, historias, testimonios, CTA y mapa. |
| `/catalogo` | Catálogo de vehículos. |
| `/catalogo/:id` | Detalle de vehículo. |
| `/instagram` | Galería de Instagram editable. |
| `/cita` | Formulario de cita y contacto por WhatsApp. |
| `/login` | Inicio de sesión. |

### Admin

| Ruta | Pantalla |
| --- | --- |
| `/admin/crm` | CRM y registro de leads. |
| `/admin/crm/:id` | Detalle de lead. |
| `/admin/catalogo` | Gestión de vehículos. |
| `/admin/contenido` | Gestión de contenido del sitio. |
| `/admin/estadisticas` | Dashboard de métricas. |
| `/admin/usuarios` | Gestión de usuarios. |

## Estructura Del Proyecto

```txt
.
├── public/
│   └── favicon.png
├── src/
│   ├── assets/              # Logos e imágenes locales
│   ├── components/
│   │   ├── admin/           # Formularios y uploaders del panel
│   │   ├── catalog/         # Filtros, cards, grid y galería de vehículos
│   │   ├── common/          # UI reutilizable
│   │   ├── crm/             # Leads, KPIs y filtros CRM
│   │   ├── home/            # Secciones de home
│   │   ├── layout/          # Layout público/admin y navegación
│   │   ├── search/          # Overlay de búsqueda
│   │   └── stats/           # Gráficos y componentes de analítica
│   ├── context/             # AuthProvider y contexto de sesión
│   ├── hooks/               # Hooks de data, realtime y UI
│   ├── lib/                 # Helpers, constantes, mocks y formatters
│   ├── pages/
│   │   ├── admin/           # Pantallas privadas
│   │   ├── auth/            # Login
│   │   └── public/          # Pantallas públicas
│   ├── plugins/             # Plugin Vite para proxy de Instagram
│   ├── routes/              # Router y protección de rutas
│   ├── services/            # Capa de datos Supabase con fallback demo
│   ├── store/               # Stores Zustand
│   ├── styles/              # CSS global y tokens
│   ├── App.jsx
│   └── main.jsx
├── supabase/
│   ├── schema.sql           # Tablas, RLS, views, storage y realtime
│   └── seed.sql             # Datos iniciales
├── .env.example
├── package.json
├── vite.config.js
└── README.md
```

## Flujo De Administración

### Catálogo

Desde `/admin/catalogo` se pueden:

- Crear vehículos.
- Editar información comercial y técnica.
- Cargar imágenes.
- Cambiar estado entre disponible, reservado o vendido.
- Copiar enlace público de la unidad.
- Copiar mensaje de WhatsApp prearmado.
- Revisar estadísticas locales de vistas y consultas.

### CRM

Desde `/admin/crm` se pueden:

- Registrar leads.
- Filtrar por estado.
- Buscar leads.
- Visualizar KPIs rápidos.
- Ver listado en tabla para desktop y cards para mobile.
- Recibir actualizaciones realtime cuando Supabase está activo.

### Contenido

Desde `/admin/contenido` se pueden modificar:

- Hero de la home.
- CTA principal.
- Historias, fotos, videos y testimonios.
- Página de Instagram.
- Footer.
- Redes sociales y datos de contacto.

Los cambios del store de contenido se guardan automáticamente en el cliente en modo demo. Con Supabase configurado, el proyecto queda preparado para persistencia real mediante la capa de servicios.

### Estadísticas

Desde `/admin/estadisticas` se visualizan:

- Ventas totales.
- Nuevos leads.
- Visitas web.
- Tasa de conversión.
- Tráfico mensual.
- Origen de leads.
- Modelos más buscados.
- Tendencia de cierre.

## Datos, Realtime Y Storage

El archivo [`supabase/schema.sql`](supabase/schema.sql) crea y configura:

- `profiles`: perfiles de usuarios.
- `vehicles`: inventario de vehículos.
- `leads`: oportunidades comerciales.
- `stories`: historias y testimonios.
- `daily_traffic`: tráfico diario para métricas.
- Views para KPIs, canales, modelos y tráfico.
- Row Level Security para lectura pública controlada y operaciones autenticadas.
- Buckets públicos de storage para `vehicles`, `stories` y `avatars`.
- Realtime para `leads` y `vehicles`.

## Deploy

### Build De Producción

```bash
npm run build
```

El resultado queda en:

```txt
dist/
```

### Preview Local

```bash
npm run preview
```

### Plataformas Recomendadas

La app es una SPA de Vite, por lo que puede desplegarse en Vercel, Netlify, Cloudflare Pages o cualquier hosting estático.

Configuración típica:

| Campo | Valor |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

Recordá cargar en la plataforma las mismas variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_WHATSAPP_PHONE=...
```

Para rutas SPA, el hosting debe redirigir las rutas internas a `index.html`.

## Calidad Y Mantenimiento

Antes de entregar cambios importantes:

```bash
npm run lint
npm run build
```

Para aplicar formato:

```bash
npm run format
```

## Notas De Desarrollo

- Los imports usan alias `@` hacia `src`.
- El puerto se toma desde `PORT` o cae en `5173`.
- `src/services/supabaseClient.js` decide si la app usa Supabase o modo demo.
- El plugin `src/plugins/instagramProxy.js` está registrado en Vite para soporte del flujo de Instagram.
- Los mocks principales viven en `src/lib/mockData.js`.
- El contenido editable inicial vive en `src/store/useSiteStore.js`.

## Checklist Rápido Para Producción

- Configurar Supabase y ejecutar `schema.sql`.
- Cargar datos base con `seed.sql` o inventario real desde el panel.
- Crear usuario administrador.
- Definir `VITE_WHATSAPP_PHONE`.
- Revisar textos en `/admin/contenido`.
- Cargar imágenes reales del catálogo.
- Probar `/catalogo`, `/cita`, `/login` y `/admin/*`.
- Ejecutar `npm run lint`.
- Ejecutar `npm run build`.
