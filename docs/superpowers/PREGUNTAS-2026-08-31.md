# Preguntas para la mañana — 2026-08-31 (noche)

Dejaste corriendo para que termine **Usuarios/Roles** + **gestoría y peritaje**.
Esto es lo que hice y lo que necesito que me aclares para seguir.

> Nota: hay **otro** doc de preguntas, `docs/PENDIENTES-Y-PREGUNTAS.md`, sobre los
> KPIs del dashboard y el detalle de cliente (ediciones que ya estaban en la rama
> sin commitear cuando arranqué — las committeé junto con lo mío en `bc2a3b7`).
> Ese doc pide re-correr algunos `supabase/*.sql` y tiene 5 preguntas sobre
> "Valor del stock" y "veh. vendidos". Contestá los dos.

---

## ✅ Terminado esta noche

### Módulo 6 — Usuarios / Roles (completo, 8 tareas)
- Schema: `crm.rol` ahora tiene `dueno`; tabla `crm.roles(rol, vistas_default text[])`;
  columna `crm.usuarios.vistas_override text[]`. **Aplicado a la base.**
- RLS: `crm.roles` y escritura en `crm.usuarios` → `admin` o `dueno`.
  Verificado con `scripts/verificar-crm-rls.mjs` → **17/17 PASS**.
- Backend `api/crm/usuarios.js`: alta de usuario + reset de contraseña, validando
  el token del que llama (rol admin/dueno activo) antes de usar el service role.
  Ruta dev en `crmProxy.js`.
- Front:
  - `src/crm/lib/vistas.js` — catálogo de 6 vistas (`panel · clientes · vehiculos ·
    tareas · usuarios · roles`), `vistaDeRuta`, `vistasEfectivas`.
  - `useUsuarios` / `useRolesCrm` / `useUsuarioMutations` / `useMisVistas`.
  - `/crm/usuarios` — un acordeón por usuario: cambiar rol, activar/desactivar,
    checklist de las 6 vistas (setea `vistas_override`), "Restablecer a las del
    rol", "Resetear contraseña", "Nuevo usuario".
  - `/crm/roles` — un acordeón por rol con su checklist de `vistas_default` +
    "Guardar".
  - `VistaGuard` envuelve el grupo del CRM: si entrás por URL a una vista que no
    tenés → pantalla **"No tenés acceso a esta sección"** (no redirect). Las
    rutas sin gate (`/crm/cambiar-password`) pasan siempre.
  - El sidebar filtra sus ítems por tus vistas efectivas; agregué Usuarios y Roles
    con el logo de `/admin`.
- Tests: ~290 verdes. `npm run build` OK.
- Bonus: limpié `eslint.config.js` (bloque de globals de Node para
  `api/` `scripts/` `src/server/` `src/plugins/` y configs) — sacó ~25 errores
  preexistentes de `process`/`Buffer`/`global`. Quedan 2 errores preexistentes
  ajenos (`ImageCropper.jsx`, `VehicleCard.jsx`: setState en effect).

### Gestoría y peritaje — revisados + más tests
Los revisé a fondo: **schemas** (derivados del legacy), **tablas** `crm.peritajes`
/ `crm.gestoria` (consistentes con los schemas), **servicios + hooks**,
**componentes** (`PeritajeForm`, `PeritajeLectura`, `GestoriaChecklist`) y están
**enganchados como tabs en `VehiculoDetallePage`**. Todo con tests verdes.
Agregué tests que faltaban (`peritajes.service` listar/actualizar,
`gestoria.service` obtener, `PeritajeLectura` render/formato).

**No encontré nada roto ni a medio hacer** en gestoría/peritaje. → ver pregunta 2.

---

## ❓ Necesito que me contestes

### 1. Contraseñas de Juani y Victor
Para crearlos desde el ABM nuevo (`/crm/usuarios` → "Nuevo usuario") necesito
usuario + nombre completo + contraseña de cada uno. Pasámelos y los creo (o los
creás vos con el botón, ya funciona).

### 2. ¿Qué falta de "gestoría y peritaje"?
Para mí quedaron completos. Decime concretamente qué esperás que tengan y no
tienen. Opciones que se me ocurren:
- ¿Un **PDF/imprimible** del peritaje (como el del CRM viejo)?
- ¿**Editar** un peritaje ya guardado desde la UI? (el service `actualizar`
  existe pero la pantalla hoy solo deja **crear** y **ver**).
- ¿Migrar los peritajes/gestorías **históricos** del legacy a `crm.*`? (la
  migración `supabase/crm_migracion.sql` los contempla pero no la corrí).
- ¿Campos del peritaje que faltan o están mal etiquetados? (son ~120, salieron
  del POST de `peritaje.php`).
- ¿Fotos adjuntas al peritaje?
- ¿Algo del flujo de gestoría (responsables, vencimientos, alertas)?

### 3. Commit mezclado (menor)
El commit `bc2a3b7` se llevó de arrastre ~11 archivos tuyos que estaban sin
commitear (ediciones en `DetalleCompatModal`, `ClienteDetallePage`,
`crm_migracion.sql`, etc.). No se perdió nada y los tests pasan, pero quedaron
bajo un mensaje que no los menciona. Si querés lo parto en dos commits.

### 4. SQL: lo que ya apliqué vs lo que te queda

Apliqué a la base (idempotentes, **no tocan datos**):
- `supabase/crm_roles_schema.sql` (módulo 6)
- `supabase/crm_schema.sql` (tabla `crm.opciones_campo` — del combobox de la
  otra sesión)
- `supabase/crm_clientes_schema.sql` (policy `clientes_delete` para cualquier
  usuario)

**Te queda a vos** (tocan/mueven datos, y dependen de tus respuestas a
`docs/PENDIENTES-Y-PREGUNTAS.md`):
- `select crm.migrar_desde_legacy();`
- `select crm.migrar_clientes_desde_legacy();`

### 5. ¿Sigo con "corte del sitio público"?
Es el módulo que falta: que el sitio público lea de `crm.vehiculos` como fuente
única y se apague el sync del CRM viejo. ¿Arranco spec + plan de eso, o hay otra
prioridad?

---

## Estado git
Rama `feat/crm-legacy-clone`, todo commiteado. Últimos commits:
`d07ad48` test peritaje/gestoria · `75672b5` verificación RLS ·
`bc2a3b7` páginas Usuarios/Roles + guard · `3a2103d` endpoint usuarios ·
`d182ae5` checklist + filas · `cecc8f6` servicio/hooks · `3a2103d`… (módulo 6).
