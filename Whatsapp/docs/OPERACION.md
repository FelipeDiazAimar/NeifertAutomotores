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
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de servicio del CRM (lee usuarios) | Ídem | `.env` servidor — **solo servidor** |
| `WA_DATABASE_URL` | Base del WhatsApp (proyecto "Whatsapp Neifert") | Supabase → Connect → Session pooler | `.env` servidor |
| `WA_R2_*` | Bucket privado de archivos y respaldo | Cloudflare → R2 → Manage API tokens | `.env` servidor |
| `WA_BACKUP_CLAVE` | Cifra el respaldo de la sesión | La inventa quien instala (larga, al azar) | `.env` + **gestor de contraseñas** |
| `RESEND_API_KEY` | Envío de alertas por email | Resend → API Keys (la del CRM) | `.env` servidor |
| `SESION_SECRETO` | Firma la cookie del panel | Se genera sola en `data/secreto-sesion` | PC titular |
| Token del túnel | Instala `cloudflared` | Cloudflare Zero Trust → Tunnels | Servicio de Windows de cloudflared |
| Sesión de WhatsApp | La llave de la línea | Al escanear el QR | `data/sesion` + respaldo cifrado |

Todo `.env` y `data/` están en `.gitignore`: nunca van al repositorio.
