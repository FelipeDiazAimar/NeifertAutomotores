# Manual de operación — WhatsApp de Neifert en la PC titular

Este manual es para quien instala y mantiene el servidor de WhatsApp en la PC de la
concesionaria que queda siempre encendida. Para saber cómo funciona por dentro, ver
[SERVIDOR.md](SERVIDOR.md).

---

## 1. Qué corre dónde

```
Celular de la concesionaria ──(vinculado una vez, QR)──▶ PC titular: servidor de WhatsApp
                                                          │  · sesión de WhatsApp (data/sesion)
                                                          │  · registros (data/logs)
                                                          ├──▶ Supabase "Whatsapp Neifert": mensajes, chats, auditoría
                                                          ├──▶ Cloudflare R2 (bucket privado): fotos, audios, videos,
                                                          │     documentos, fotos de perfil y el respaldo cifrado
                                                          └──▶ Cloudflare Tunnel: https://wa.<dominio> (sin abrir puertos)
CRM (Vercel, https) ── muestra el panel embebido desde https://wa.<dominio>
```

- **La PC titular** es el único lugar donde corre el servidor. No hace falta Vercel ni
  otro hosting para WhatsApp.
- **Nunca dos servidores con la misma sesión.** Se desconectan entre sí (error 440).

---

## 2. Instalación en la PC titular

Requisitos: Windows 10/11, [Node.js 20.12 o más nuevo](https://nodejs.org), Git, conexión
estable y la PC configurada para no suspenderse.

1. **Carpeta fuera de OneDrive.** Por ejemplo `C:\NeifertWhatsapp`:
   ```powershell
   git clone <repo> C:\NeifertWhatsapp
   cd C:\NeifertWhatsapp\Whatsapp\servidor
   npm install --omit=dev
   ```
2. **Configuración.** Copiar `.env.example` como `.env` y completarlo (ver el
   [inventario de secretos](#8-inventario-de-secretos)). Mínimo: Supabase del CRM,
   `WA_DATABASE_URL`, R2, `WHATSAPP_NUMERO`, `CRM_URL`, `WA_BACKUP_CLAVE`, alertas.
3. **HTTPS con Cloudflare Tunnel** (ver punto 3). El CRM está en https y un navegador no
   deja mostrar un panel http adentro de una página https.
4. **Servicio de Windows.** En PowerShell **como administrador**:
   ```powershell
   cd C:\NeifertWhatsapp\Whatsapp\servidor
   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-servicio.ps1 -SinSuspension
   ```
   Registra dos tareas en el Programador de tareas:
   - **Neifert WhatsApp**: arranca al prender la PC (aunque nadie inicie sesión) y, si el
     proceso se cae, Windows lo vuelve a levantar cada minuto.
   - **Neifert WhatsApp - vigia**: cada 5 minutos consulta `/api/salud`; si el servidor no
     responde dos veces seguidas, lo reinicia, lo anota en `data\logs\vigia-externo.log` y
     manda un email (si están las alertas configuradas).

   `-SinSuspension` evita que la PC se suspenda enchufada. `-AbrirFirewall` abre el puerto
   en la red privada: solo hace falta si otras PC entran directo por la red (`HOST=0.0.0.0`);
   con Cloudflare Tunnel **no** hace falta.
5. **Vincular la línea.** Un admin entra al CRM → WhatsApp → Conexión y escanea el QR con
   el celular de la concesionaria.
6. **Prueba de aceptación.** Reiniciar la PC (`shutdown /r /t 0`) y, sin iniciar sesión,
   comprobar desde otra máquina `https://wa.<dominio>/api/salud` → `{"ok":true,"conexion":"conectado"}`.

### Windows Update

Configurar las **horas activas** (Configuración → Windows Update → Opciones avanzadas)
para que no reinicie en horario de atención. Aunque reinicie, el servicio vuelve solo.

---

## 3. HTTPS con Cloudflare Tunnel

El túnel publica el servidor en `https://wa.<dominio>` sin abrir puertos del router ni
tener IP fija. Requiere que el dominio esté en Cloudflare.

1. Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo Cloudflared),
   nombre `neifert-whatsapp`.
2. Elegir Windows y copiar el comando de instalación (`cloudflared service install <token>`);
   correrlo en la PC titular como administrador. Queda como servicio de Windows.
3. **Public Hostname**: `wa.<dominio>` → servicio `http://localhost:3100`.
4. En `Whatsapp/servidor/.env`: `WA_DETRAS_DE_PROXY=on` (así toma el https y la IP real
   del túnel) y `CRM_URL=https://<dominio-del-crm>/crm/whatsapp`.
5. En Vercel (proyecto del CRM): `VITE_WHATSAPP_PANEL_URL=https://wa.<dominio>` y redeploy.

Con el túnel, `HOST` queda en `127.0.0.1`: el servidor no escucha en la red, solo el túnel
llega a él.

---

## 4. Respaldo y restauración (PC nueva sin QR)

Con `WA_BACKUP_CLAVE` y R2 configurados, el servidor respalda **cifrado** en R2:

| Qué | Cuándo | Dónde (bucket) |
|---|---|---|
| Sesión de WhatsApp (`data/sesion`) | Cada vez que cambia (agrupado) y cada 6 h | `respaldo/sesion.enc` |
| Copia diaria de la sesión (14 días) | Junto con la anterior | `respaldo/historial/sesion-AAAA-MM-DD.enc` |
| Los dos `.env` (servidor y proyecto) | Al arrancar y cada 24 h | `respaldo/env.enc` |

Mensajes, chats y auditoría ya están en Supabase; archivos y fotos, en R2. Con el
respaldo de la sesión, **todo** queda fuera de la PC.

Cifrado: AES-256-GCM con clave derivada (scrypt) de `WA_BACKUP_CLAVE`. **La clave no va en
el respaldo**: guardarla en un gestor de contraseñas (y una copia en sobre cerrado).

Forzar un respaldo ya (por ejemplo antes de mudar el servicio): `npm run respaldar`.

### Restaurar en una PC nueva

1. **Apagar la PC vieja** (o desinstalar su servicio). Si quedan las dos, error 440.
2. Instalar como en el punto 2 (pasos 1 y 4 hasta `npm install`).
3. Crear `Whatsapp/servidor/.env` con solo:
   ```
   WA_R2_BUCKET=neifert-whatsapp
   WA_R2_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com
   WA_R2_ACCESS_KEY_ID=...
   WA_R2_SECRET_ACCESS_KEY=...
   WA_BACKUP_CLAVE=...
   ```
4. `npm run restaurar` → trae la sesión y los dos `.env`. (`--fecha=AAAA-MM-DD` para un
   día anterior; `--forzar` si ya había algo.)
5. Instalar el servicio (punto 2, paso 4) y el túnel (punto 3).
6. Aceptación: `npm start` (o el servicio) **conecta sin QR** y el historial aparece igual.

> Si el respaldo es de hace varias horas, puede que algunos mensajes recibidos en el medio
> no se descifren (WhatsApp rota claves). La línea conecta igual y lo nuevo llega bien.

---

## 5. Alertas y monitoreo

El servidor avisa por email (Resend, `WA_ALERTA_EMAIL` + `RESEND_API_KEY`) o por webhook
(`WA_ALERTA_WEBHOOK`) cuando:

| Situación | Cuándo avisa |
|---|---|
| La línea no está conectada | A los 15 min (`WA_ALERTA_MINUTOS`), y cuando vuelve |
| Se desvinculó desde el celular | En el momento |
| Otra PC abrió la misma sesión (440) | En el momento; reintenta a los 5 y a los 30 min |
| WhatsApp rechazó la conexión (403) | En el momento; reintenta cada 30 min |
| Sesión dañada (500) | Al tercer intento fallido |
| El celular no da señales | A los 10 días (`WA_ALERTA_CELULAR_DIAS`); WhatsApp desvincula a los 14 |
| El celular no responde pedidos de archivos | Tres seguidos (¿sin internet?) |
| No se pudo respaldar la sesión | En el momento |
| El servidor no responde `/api/salud` | Lo detecta el vigía externo (tarea de Windows) |

Sin destino configurado, los avisos quedan solo en el registro (y el servidor lo advierte
al arrancar).

- **Registro:** `data/logs/AAAA-MM-DD.log` (uno por día, 30 días, `WA_LOG_DIAS`) y la pestaña
  **Conexión → Actividad** del panel.
- **Auditoría:** tabla `wa.auditoria` en Supabase y **Conexión → Auditoría** (solo admins):
  quién entró, mandó, desvinculó, cambió preferencias, y los intentos sin permiso.
- **Salud:** `GET /api/salud` → `200 {"ok":true}` conectado; `503` servicio vivo pero línea
  sin conectar. No requiere login y no da datos de la cuenta.
- **Si la PC estuvo suspendida** (el reloj salta), el servidor fuerza la reconexión solo.

---

## 6. Celular de la concesionaria

- Tiene que **abrir WhatsApp al menos una vez cada 14 días**; si no, WhatsApp desvincula
  los dispositivos. El servidor avisa a los 10 días sin señales (cuenta como señal un
  mensaje mandado desde el celular o que responda un pedido de archivos).
- Conviene que quede con internet y cargando: para bajar archivos viejos, el servidor le
  pide al celular que los vuelva a subir.
- Al vincular, dejar WhatsApp abierto unos minutos: ahí manda el historial.

---

## 7. Permisos

| Rol del CRM (por defecto) | Bandeja y escribir | QR, vincular/desvincular, preferencias | Auditoría |
|---|---|---|---|
| admin, dueno (`WHATSAPP_ROLES_LINEA`) | Sí | Sí | Sí |
| vendedor (`WHATSAPP_ROLES`) | Sí | No | No |
| `WHATSAPP_ROLES_LECTURA` | Solo ver | No | No |
| Usuario inactivo o rol sin acceso | No entra (pierde el acceso en menos de 60 s) | | |

Cada acción que cambia algo queda en `wa.auditoria` con usuario, rol, chat e IP, también
los intentos rechazados (`resultado = 'denegado'`).

---

## 8. Inventario de secretos

| Variable | Qué es | Dónde se saca | Dónde vive |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Proyecto Supabase del **CRM** | Supabase → CRM → Project Settings → API | `.env` servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de servicio del CRM (lee usuarios y clientes; crea clientes, seguimientos y tareas desde el chat) | Ídem | `.env` servidor — **solo servidor** |
| `WA_DATABASE_URL` | Base del WhatsApp (proyecto "Whatsapp Neifert") | Supabase → Connect → Session pooler | `.env` servidor |
| `WA_R2_*` | Bucket privado de archivos y respaldo | Cloudflare → R2 → Manage API tokens | `.env` servidor |
| `WA_BACKUP_CLAVE` | Cifra el respaldo de la sesión | La inventa quien instala (larga, al azar) | `.env` + **gestor de contraseñas** |
| `RESEND_API_KEY` | Envío de alertas por email | Resend → API Keys (la del CRM) | `.env` servidor |
| `SESION_SECRETO` | Firma la cookie del panel | Se genera sola en `data/secreto-sesion` | PC titular |
| Token del túnel | Instala `cloudflared` | Cloudflare Zero Trust → Tunnels | Servicio de Windows de cloudflared |
| Sesión de WhatsApp | La llave de la línea | Al escanear el QR | `data/sesion` + respaldo cifrado |

Todo `.env` y `data/` están en `.gitignore`: nunca van al repositorio.

---

## 9. Costos: espacio en R2 y filas en Supabase

Medido el 4/10/2026 con la línea real (un año de historial, ~60 mensajes por día):

| Qué | Hoy | Un año completo (estimado) | Límite gratis |
|---|---|---|---|
| Mensajes en Supabase (`wa.mensajes`) | 22.965 filas · 73 MB con índices (~3,2 KB por mensaje) | ~25.000 filas · ~80 MB | 500 MB (plan Free) |
| Chats / contactos | 287 / 2.530 filas · 1,4 MB | Similar | — |
| Archivos en R2 (`media/`) | 703 archivos · 189 MB | ~2.800 archivos · **~0,8 GB** (lo que falta bajar declara 633 MB) | 10 GB por mes |
| Miniaturas + fotos de perfil | 1 MB | ~10 MB | — |
| Respaldo cifrado de la sesión | < 1 MB (15 copias) | Igual | — |

- **R2:** almacenamiento a **USD 0,015 por GB-mes** pasados los 10 GB gratis; **las
  descargas no se cobran**. Operaciones: 1 millón de escrituras y 10 millones de lecturas
  gratis por mes; este uso no llega al 1 %. Con la ventana de 365 días el espacio se
  estabiliza en ~1 GB: **costo esperado USD 0**. Aun con 10 veces más volumen seguiría
  por debajo de los 10 GB gratuitos.
- **Supabase:** con la ventana de 365 días la base queda en ~80–150 MB y entra en el plan
  Free. Para tener copias diarias automáticas de la base y evitar cualquier pausa del
  proyecto, el plan Pro cuesta USD 25 por mes.
- Los 2 archivos de más de 64 MB (850 MB entre los dos) quedan como "grande" y no se bajan
  solos: eso es lo que evita que el espacio se dispare.
- El panel muestra el uso real en **Conexión → Espacio usado** (R2 + base).

Precios de referencia de Cloudflare y Supabase a octubre de 2026: confirmarlos en sus
páginas de precios antes de presupuestar.

---

## 10. Riesgo de baneo y Plan B

Baileys no es la API oficial: WhatsApp puede restringir o bloquear el número si detecta
uso automatizado o masivo. El uso de Neifert (atención 1 a 1, ~60 mensajes por día, todo
escrito por personas) es de riesgo bajo. Para mantenerlo así:

**Qué no hacer**
- Envíos masivos o difusiones desde el panel (no hay función para eso, y no agregarla).
- Escribirles primero, en cantidad, a números que nunca hablaron con la concesionaria.
- Mandar el mismo texto a muchos chats seguidos.
- Vincular la misma sesión en dos PC (los 440 repetidos se ven sospechosos).
- Pasar más de 14 días sin abrir WhatsApp en el celular.

**Señales de alerta** (el servidor manda email):
- Cierre **403** ("WhatsApp rechazó la conexión"): cuenta restringida.
- El celular muestra "Tu cuenta está suspendida" o pide verificar el número.
- Muchos mensajes que quedan con un solo tilde (no se entregan).

**Si llega un 403 o una suspensión**
1. No reintentar a mano ni volver a vincular en el momento: el servidor espera 30 min solo.
2. En el celular: abrir WhatsApp, leer el aviso y, si ofrece **"Solicitar revisión"**,
   pedirla (explicar que es atención a clientes de una concesionaria).
3. Mientras tanto, atender desde el celular (si la cuenta lo permite) o avisar a los
   clientes por los otros canales (Instagram, teléfono fijo, web).
4. Si la revisión sale bien: volver a vincular desde Conexión. Los chats y archivos
   guardados siguen ahí (están en Supabase y R2, no en WhatsApp).
5. Si el bloqueo es definitivo: pasar al Plan B.

**Plan B: WhatsApp Business Platform (Cloud API oficial de Meta)**

| | Baileys (hoy) | Cloud API oficial |
|---|---|---|
| Costo fijo | USD 0 | USD 0 (Meta no cobra la plataforma; un proveedor intermediario —BSP— puede cobrar abono) |
| Responder a un cliente que escribió (ventana de 24 h) | Gratis | **Gratis** (mensajes de servicio) |
| Escribir primero o fuera de las 24 h | Gratis | Solo con **plantilla aprobada**; se cobra por mensaje según la categoría |
| Riesgo de baneo por automatización | Existe | No (es la vía permitida) |
| Celular | Tiene que existir y abrirse cada 14 días | No hace falta |
| Grupos | Sí | No (la API no maneja grupos) |
| Historial anterior | Lo manda el celular al vincular | No se trae (salvo con la "coexistencia", ver abajo) |

Costos de referencia por mensaje de plantilla para números de **Argentina** (Meta cobra
por mensaje entregado desde julio de 2025; **verificar la tabla vigente en la página de
precios de WhatsApp Business Platform antes de decidir**):

| Categoría | Para qué | USD por mensaje (aprox.) |
|---|---|---|
| Servicio | Responder dentro de las 24 h desde que escribió el cliente | 0 |
| Utilidad | Avisos de turnos o del estado de una gestión (gratis dentro de la ventana de 24 h) | ~0,026 |
| Autenticación | Códigos de verificación | ~0,026 |
| Marketing | Promociones, novedades del stock | ~0,062 |

Estimación para Neifert: casi todo es responder a clientes que escriben, así que el costo
sería de **USD 0 a 10 por mes** (por ejemplo, 150 plantillas de utilidad o de
seguimiento fuera de las 24 h ≈ USD 4–9).

Qué implicaría migrar:
1. Cuenta de Meta Business verificada y el número dado de alta en la plataforma. Opción
   "coexistencia": Meta permite (desde 2025) usar la app **WhatsApp Business** y la Cloud
   API con el mismo número, trayendo hasta 6 meses de historial; confirmar que esté
   disponible para el número al momento de migrar. Si no, hace falta un número que no
   esté en la app.
2. Reemplazar `src/whatsapp.js` (Baileys) por un módulo que reciba los mensajes por webhook
   y mande por la Graph API. El resto (almacén, Supabase, R2, panel, permisos, auditoría,
   CRM) queda igual: el panel no habla con Baileys, habla con el servidor.
3. Cargar y aprobar las plantillas (seguimiento, recordatorio de turno, etc.).
4. Se pierden los grupos y el "escribiendo…" del cliente.

Esfuerzo estimado: 1 a 2 semanas de desarrollo, más el trámite de verificación de Meta
(de días a semanas). Conviene tener la cuenta de Meta Business verificada **antes** de
necesitarla.

---

## 11. Checklist de aceptación (demo en vivo)

Cómo comprobar cada punto de la auditoría. ✅ = probado en desarrollo; 👁 = verificar en la
demo con la línea y la PC titular reales.

| # | Qué | Cómo se prueba | Estado |
|---|---|---|---|
| 1 | El QR solo acepta `WHATSAPP_NUMERO` | Escanear con otro celular: se desvincula solo y queda `rechazo_numero` en Conexión → Auditoría y Actividad | ✅ |
| 2 | Corte del proceso → reconecta sin QR | Cerrar el proceso (o `Stop-Process`) y `npm start`: conecta solo | ✅ |
| 3 | Texto 1 a 1 con tildes de entregado y leído | Mandar desde el panel a un celular de prueba y responder; ver ✓, ✓✓ y ✓✓ azul | 👁 |
| 4 | Grupo: autor, respuesta citada, mención | En un grupo de prueba: responder citando, escribir "@" y elegir a alguien; al mencionado le llega el aviso | ✅ panel · 👁 aviso en el celular |
| 5 | Alta, baja y cambio de asunto generan aviso | Agregar y sacar a alguien, cambiar el asunto: aparece la línea centrada | ✅ |
| 6 | "Ver una vez": solo el aviso | Mandar una foto de ver una vez: se ve "Foto para ver una vez", sin archivo en R2 ni contenido guardado | ✅ |
| 7 | Eliminados y editados según la definición firmada | Configurar `WA_CONSERVAR_ELIMINADOS` / `WA_CONSERVAR_EDICIONES` según [PRIVACIDAD.md](PRIVACIDAD.md) firmado; eliminar y editar un mensaje desde el celular | ✅ (falta la firma) |
| 8 | Corte de red de 60 s → reconecta sin duplicados | Desconectar la red 60 s; al volver reconecta y lo recibido en el medio aparece una sola vez | ✅ |
| 9 | Dos operadores ven lo mismo, con autor | Dos navegadores con usuarios distintos: lo que manda uno le aparece al otro con su nombre | ✅ |
| 10 | Usuario inactivo o sin rol pierde el acceso en < 60 s | Desactivar un usuario en el CRM: en menos de un minuto el panel le dice que no tiene acceso | ✅ (y `auth.test.js`) |
| 11 | `HOST=0.0.0.0` sin login no arranca | Sacar `SUPABASE_*` y poner `HOST=0.0.0.0`: el servidor sale con el error explicado | ✅ |
| 12 | Desvincular desde el celular → QR, chats conservados, sin duplicar | Desvincular en el celular: aparece el QR (y llega la alerta); al volver a vincular, los chats siguen y no se duplican | ✅ |
| 13 | Archivo mayor al límite → "grande" con mensaje claro | Recibir un video de más de `WA_MEDIA_MAX_MB`: se ve el nombre con "X MB: supera el límite de descarga (64 MB)" | ✅ |
| 14 | Espacio usado = R2 + base; `subir-r2` y `--borrar` | Conexión → Espacio usado; `npm run subir-r2` y `npm run subir-r2 -- --borrar` | ✅ |
| 15 | Retención efectiva en base y R2 | `WA_VENTANA_DIAS`: la purga diaria borra mensajes y archivos anteriores (Actividad: "Ventana de N días") | ✅ |
| 16 | Bucket R2 privado y dedicado; la URL directa da error | Abrir `https://<cuenta>.r2.cloudflarestorage.com/neifert-whatsapp/media/...` sin firma → 400/403 | ✅ |
| 17 | Regla de 14 días y caso 440 documentados | Puntos 5 y 6 de este manual; Baileys.md § 3.1 y § 5 | ✅ |
| 18 | Historial inicial y sus límites documentados | SERVIDOR.md → "Últimos 365 días" (qué manda WhatsApp y qué se puede recuperar) | ✅ |
| 19 | Login embebido seguro | Cookie de 12 h HttpOnly; POST sin `X-NF-WA` → 403; `frame-ancestors` solo el CRM; el token viaja por `postMessage`, nunca en la URL | ✅ (y `auth.test.js`) |
| 20 | La nota de voz del panel llega como nota de voz | Grabar en el panel: en el celular se ve y se reproduce como nota de voz, con su onda | ✅ · 👁 |
| 21 | Entrega documental | `.env.example` · § 8 inventario de secretos · § 4 restauración cifrada · § 9 costos · § 10 baneo y Plan B | ✅ |

Tests automáticos: `npm test` desde la raíz del repo. Incluye `Whatsapp/servidor/test/`:
teléfonos, tipos de archivo, respaldo cifrado, diario local, almacén, login y permisos,
e integración con el CRM.
