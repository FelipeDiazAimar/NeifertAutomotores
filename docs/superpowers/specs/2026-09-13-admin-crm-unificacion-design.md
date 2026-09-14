# Unificación /admin + /crm y fotos de gestoría

**Fecha:** 2026-09-13
**Estado:** aprobado
**Depende de:** CRM nuevo completo (módulos 1-6, ver memoria `crm-nuevo-estado`), auth compartida vía `supabase.auth` + email sintético (`crmShadowEmail`/`emailDeUsuario`).

## 1. Objetivo

Hoy conviven dos paneles separados con logins/guards propios: el panel viejo
(`/admin/*`, tabla `public.vehiculos`, leads propios) y el CRM nuevo (`/crm/*`,
esquema `crm`). El pedido es trabajar todo "desde el mismo lugar": un único
menú, un único guard de acceso, y un único catálogo de vehículos (hoy son dos
tablas distintas sin sync entre sí). Además, agregar carga de fotos (formato
4:3) de seguro y título (frente/dorso) en la ficha de Gestoría de cada auto.

### Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| Unificación de men��/layout | Un solo sidebar (fusión de `AdminSidebar`+`CrmSidebar`), montado tanto en el árbol `/admin/*` como en `/crm/*`. Las URLs existentes de `/crm/*` **no se renombran** (evita romper enlaces/bookmarks internos); se accede a todo desde el mismo sidebar sin importar el prefijo de la URL actual. |
| Unificación de auth | Un solo `ProtectedRoute` que reemplaza a `ProtectedRoute` + `CrmProtectedRoute`: exige sesión Supabase + fila activa en `crm.usuarios` (como hoy exige `CrmProtectedRoute`). Como el login viejo se elimina (ver más abajo), todo el mundo entra vía `crm.usuarios`, así que `public.perfiles` deja de ser parte del gate. El gate fino por vista (`VistaGuard`/`useMisVistas`) se mantiene igual, ahora aplicado a todas las rutas del panel (no solo `/crm/*`). |
| Fuente única de vehículos | `crm.vehiculos` pasa a ser la única fuente, para admin **y** para la web pública. Se le agregan las columnas que hoy solo tiene `public.vehiculos` (marketing: categoría, descripción, es_nuevo, precio_usd, combustible, publicado). Los campos privados de `crm.vehiculos` (dueño, ITV, patente, nota, consignación) nunca se exponen a las queries públicas — se seleccionan columnas explícitas, no `select *`. |
| Publicación en la web | Nueva columna `crm.vehiculos.publicado` (boolean, default `false`). La web pública solo muestra `estado = 'disponible' AND publicado = true`. Un vehículo cargado en el CRM no aparece en la web hasta que alguien lo marca "Publicado". |
| Fotos públicas | La web pública usa `crm.vehiculo_fotos` (ya existe, con `es_portada`) en vez de `imagen_principal`/`imagenes` (jsonb) de `public.vehiculos`. |
| Retiro de lo viejo | Se eliminan: `/admin/catalogo` (`AdminCatalogPage`), tabla `public.vehiculos` (deprecada, no se dropea todavía — se dejan de escribir/leer desde el código), `src/services/crmVehicles.service.js` (sync con el CRM externo legacy hacia `public.vehiculos`), el botón "Sincronizar con CRM" de ese panel. |
| Renombres de secciones | `/admin/crm` → label "Carga Leads" (la página en sí no cambia, solo el nombre en el menú). `/admin/contenido` → "Administración Contenido Web". |
| Admin (Usuarios + Almacenamiento) | Nueva página única `/admin/admin` (o reutilizar `/admin/usuarios` como slug) con dos secciones apiladas: Usuarios arriba, Almacenamiento abajo — mismo patrón de tabs/secciones que ya usa `AdminContentPage` pero sin tabs, todo visible en scroll vertical. Reemplaza los dos ítems de menú separados. |
| Fotos de Gestoría | 3 campos nuevos en `crm.gestoria`: `foto_seguro_url`, `foto_titulo_frente_url`, `foto_titulo_dorso_url` (text, nullable). Un slot de foto único por campo (no galería), recorte/objeto en formato **4:3**, mismo mecanismo de subida que `fotos.service.js` (R2 presign + PUT), guardado directo como URL en la fila de `crm.gestoria` (no en `vehiculo_fotos`, que es para la galería general del auto). |

## 2. Schema `crm` — cambios

```sql
-- Vehículos: campos de marketing que hoy solo existen en public.vehiculos
alter table crm.vehiculos
  add column if not exists categoria text,
  add column if not exists descripcion text,
  add column if not exists es_nuevo boolean not null default false,
  add column if not exists precio_usd numeric,
  add column if not exists combustible text,
  add column if not exists publicado boolean not null default false;

-- Gestoría: fotos de seguro y título (frente/dorso), formato 4:3
alter table crm.gestoria
  add column if not exists foto_seguro_url text,
  add column if not exists foto_titulo_frente_url text,
  add column if not exists foto_titulo_dorso_url text;
```

RLS: estas columnas quedan cubiertas por las policies existentes de
`crm.vehiculos`/`crm.gestoria` (select para `crm.es_usuario()`, update según
rol) — no hace falta policy nueva. Para la lectura **pública** (web, sin
sesión), se agrega una policy de `select` en `crm.vehiculos` y
`crm.vehiculo_fotos` para el rol `anon`, acotada a `estado='disponible' and
publicado=true` (vehículos) y a fotos de esos vehículos — nunca se expone
`select *`, el cliente público solo pide las columnas necesarias.

DDL se aplica igual que en módulos anteriores: conexión directa Postgres
(`DATABASE_URL`) con `node --env-file=.env -e "...pg..."`.

## 3. Frontend — layout, sidebar y guard

- **Sidebar único**: nuevo `src/components/layout/AppSidebar.jsx` (reemplaza
  `AdminSidebar.jsx` + `CrmSidebar.jsx`), con un solo array `NAV`:
  ```
  Carga Leads       → /admin/crm            (icon Users)
  Catálogo          → /crm/vehiculos        (icon Car)
  Clientes          → /crm/clientes         (icon Users)
  Tareas            → /crm/tareas           (icon ListTodo, badge tareasHoy)
  Peritaje          → /crm/peritaje         (icon ClipboardCheck)
  Gestoría          → /crm/gestoria         (icon FileStack)
  Estadísticas      → /admin/estadisticas   (icon BarChart3)
  Administración Contenido Web → /admin/contenido (icon LayoutTemplate)
  Admin             → /admin/admin          (icon UserCog)  -- Usuarios + Almacenamiento
  Ver sitio         → /                     (icon Home)
  ```
  `/crm/usuarios` y `/crm/roles` (RBAC del CRM) no son ítems propios del
  sidebar: viven como secciones dentro de la página "Admin" (ver sección 4),
  junto a Usuarios-del-panel-viejo y Almacenamiento.
  Filtrado por vistas: se extiende `useMisVistas`/`VISTAS` (`src/crm/lib/vistas.js`)
  para cubrir también los ítems que hoy son "siempre visibles" en `/admin`
  (leads, contenido, estadísticas, admin) con vistas nuevas
  (`leads`, `contenido`, `estadisticas`, `admin`), agregadas a
  `crm.roles.vistas_default` para los 3 roles (todas por defecto, ya que hoy
  no tienen gate).
- **Layout único**: `src/components/layout/AppLayout.jsx` (reemplaza
  `AdminLayout` + `CrmLayout`), monta `AppSidebar` + versión mobile + `Outlet`.
  Se usa en ambos árboles de rutas (`/admin/*` y `/crm/*`) en `AppRouter.jsx`.
- **Guard único**: `src/routes/AppProtectedRoute.jsx` (reemplaza
  `ProtectedRoute` + `CrmProtectedRoute`): exige `session` y `crm.usuarios`
  activo (mismo patrón que `CrmProtectedRoute` ya usa hoy). Envuelve ambos
  árboles de rutas en `AppRouter.jsx`; `VistaGuard` se monta adentro para las
  vistas finas.
- **Login**: un solo login — `/crm/login` (`CrmLoginPage`, password real
  contra Supabase con el email sintético) pasa a ser el login general del
  panel completo. Se elimina `/login` (el viejo, que hacía bridge de
  credenciales contra el CRM externo PHP), `src/pages/auth/LoginPage.jsx`,
  `loginWithCrmCredentials`/`bridgeCrmSession` (`crmAuth.service.js`,
  `crmCore.js`) y la ruta `/api/crm/bridge-session`. Todos entran con el
  usuario/contraseña que ya tienen en `crm.usuarios`.

## 4. Frontend — página "Admin" (Usuarios, Roles, Accesos, Almacenamiento)

Nueva página `src/pages/admin/AdminPage.jsx` en `/admin/admin`, con 4
secciones apiladas una debajo de la otra (no tabs, todo en un solo scroll,
con separador/título por sección, mismo patrón visual que `AdminContentPage`):

1. **Usuarios (CRM)** — contenido de `UsuariosPage.jsx` (`/crm/usuarios`,
   RBAC: alta, rol, activo/inactivo, vistas, reset de contraseña).
2. **Roles (CRM)** — contenido de `RolesPage.jsx` (`/crm/roles`, vistas por
   defecto de cada rol).
3. **Accesos del panel viejo** — contenido de `AdminUsersPage.jsx` (lista de
   accesos/roles del panel `/admin` original).
4. **Almacenamiento** — contenido de `StoragePage.jsx` (dashboard de uso de
   R2).

`UsuariosPage.jsx`, `RolesPage.jsx`, `AdminUsersPage.jsx` y `StoragePage.jsx`
se retiran como rutas propias (`/crm/usuarios`, `/crm/roles`,
`/admin/usuarios`, `/admin/almacenamiento` dejan de existir); sus contenidos
se extraen a componentes reutilizados por `AdminPage`
(`src/components/admin/UsuariosCrmSection.jsx`,
`src/components/admin/RolesCrmSection.jsx`,
`src/components/admin/AccesosPanelSection.jsx`,
`src/components/admin/AlmacenamientoSection.jsx`). Gate de acceso a la página
completa: vista `admin` (solo roles `admin`/`dueno`, como hoy exigen
`/crm/usuarios` y `/crm/roles`).

## 5. Vehículos: fuente única

- **Servicios**: `src/crm/services/vehiculos.service.js` gana las columnas
  nuevas en sus selects/updates. Se agrega una función
  `listarPublicos(filtros)` (o se extiende `listar()` con un modo público)
  que selecciona **solo** columnas públicas
  (`id, marca, modelo, version, anio, km, transmision, color, moneda,
  precio_contado, precio_usd, categoria, descripcion, es_nuevo, combustible,
  estado`) + join/lookup de `crm.vehiculo_fotos` — nunca las privadas.
- **Web pública**: `src/hooks/useVehicles.js`, `src/pages/public/CatalogPage.jsx`,
  `src/pages/public/VehicleDetailPage.jsx`, `src/components/catalog/RelatedVehicles.jsx`
  y `src/components/search/AiSearchOverlay.jsx` pasan de
  `vehicles.service.js` (`public.vehiculos`) al nuevo servicio público sobre
  `crm.vehiculos`. Se mantiene la firma de los hooks para minimizar cambios en
  los componentes de presentación (mismo shape de objeto vehículo hacia la UI,
  mapeado desde los campos en español de `crm.vehiculos`).
- **Formulario CRM**: `src/crm/components/VehiculoForm.jsx` gana los campos
  nuevos (categoría, descripción, es_nuevo, combustible, precio_usd,
  "Publicado en la web" como switch).
- **Retiros**: `AdminCatalogPage.jsx`, ruta `/admin/catalogo`,
  `src/services/vehicles.service.js`, `src/services/crmVehicles.service.js`
  (`syncVehiclesFromCrm`, `fetchExternalVehicles`), el botón "Sincronizar con
  CRM" y sus llamadas a `crmCore.js`/`/api/crm/vehiculos`. La tabla
  `public.vehiculos` se deja de usar desde el código (no se dropea en esta
  spec, por si hace falta rollback).
- **Migración de datos existente**: script one-shot (similar a
  `scripts/migrate-legacy-to-crm.mjs`) que recorre `public.vehiculos` con
  `estado='disponible' and oculto=false` sin equivalente en `crm.vehiculos`
  (match por `id_externo`/`marca+modelo+patente` si hay, o se insertan como
  nuevos si no hay forma de matchear) y los inserta/actualiza en
  `crm.vehiculos` con `publicado=true` y las columnas de marketing
  (categoria, descripcion, es_nuevo, precio_usd, combustible) copiadas desde
  `public.vehiculos`. Las fotos (`imagen_principal`/`imagenes` jsonb) se
  migran a filas de `crm.vehiculo_fotos`. Se corre **antes** de apagar el
  sync viejo y cambiar la web pública de fuente, para que no se quede sin
  autos el día del corte.

## 6. Fotos de Gestoría (seguro y título)

- Componente nuevo `src/crm/components/FotoSlot.jsx`: variante de un solo
  archivo del patrón de `FotosUploader.jsx` — un recuadro con `aspect-ratio: 4/3`
  (recorte 4:3 vía `<input type="file">` + preview con `object-fit: cover`;
  sin recorte interactivo en v1, se sube la imagen tal cual y se muestra
  recortada a 4:3 con CSS — a confirmar si hace falta recorte real antes de
  subir). Botón para reemplazar/borrar.
- `src/crm/services/fotos.service.js` gana `subirArchivoUnico(carpeta, file)`
  (mismo presign+PUT, sin insertar en `vehiculo_fotos`, devuelve la URL) —
  reutilizado por `FotoSlot`.
- `src/crm/hooks/useGestoria.js` — `guardarCampos` ya acepta un patch
  arbitrario de columnas (visto en `GestoriaChecklist.jsx`), así que subir una
  foto y guardar `{ foto_seguro_url: url }` reutiliza la mutation existente
  sin cambios.
- `GestoriaChecklist.jsx` gana una sección "Documentación" arriba del listado
  de trámites, con 3 `FotoSlot`: "Foto del seguro", "Título — frente", "Título
  — dorso".

## 7. Testing

- Servicios: `vehiculos.service.js` (`listarPublicos` selecciona solo columnas
  públicas, nunca las privadas), `fotos.service.js` (`subirArchivoUnico`).
- Componentes: `FotoSlot` (subir reemplaza, borrar limpia la URL),
  `GestoriaChecklist` (nueva sección renderiza los 3 slots y persiste vía
  `guardarCampos`), `AppSidebar` (arma la lista completa, filtra por vistas),
  `AppProtectedRoute` (bloquea sin sesión, bloquea sin perfil ni fila crm,
  permite con cualquiera de los dos).
- Integración: `verificar-crm-rls.mjs` — agregar caso `anon` puede `select`
  vehículos `publicado=true`, no puede ver `duenio_nombre`/`itv`/`patente`
  (columnas no incluidas en el select público) ni vehículos con
  `publicado=false`.
- Web pública: catálogo y detalle siguen renderizando igual con datos de
  `crm.vehiculos` (mismo shape mapeado).

## 8. Fuera de alcance

Recorte real (crop UI) de las fotos 4:3 — se sube la imagen y se muestra
recortada por CSS. Migración de fotos/datos históricos de `public.vehiculos`
que no tengan equivalente en `crm.vehiculos` más allá de un script simple.
Drop de la tabla `public.vehiculos` (se deja de usar pero no se borra en esta
etapa). Unificar el login viejo (`/login`, CRM externo) — queda pendiente de
definir si se elimina.

## 9. Decisiones confirmadas (ya no son preguntas abiertas)

Usuarios/Roles del CRM → dentro de la página Admin (no ítems propios del
sidebar) · login viejo → se elimina, todos entran por `/crm/login` · datos de
`public.vehiculos` sin equivalente en `crm.vehiculos` → se migran con script
one-shot antes del corte · ruta de la página Admin → `/admin/admin`.
