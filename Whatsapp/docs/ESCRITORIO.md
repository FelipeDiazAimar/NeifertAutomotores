# App de escritorio — la PC que hace de servidor

`Whatsapp/escritorio` es un instalador de Windows (`Neifert WhatsApp Setup.exe`) que
convierte una PC en el servidor del WhatsApp. En esa PC no hace falta Git, Node ni tocar
archivos: se instala, se elige el archivo de configuración una vez y queda andando.

Los demás empleados **no instalan nada**: usan el WhatsApp desde el CRM, que llega a esta
PC por `https://wa.neifertautomotores.com` (Cloudflare Tunnel).

---

## Qué hace la app

- Corre el servidor de WhatsApp con el Node que trae adentro y lo vuelve a levantar si se cae.
- Corre Cloudflare Tunnel (`cloudflared`, incluido) si la configuración tiene `WA_TUNEL_TOKEN`.
- Ícono junto al reloj: estado de la línea, versión, abrir WhatsApp, reiniciar, buscar
  actualización, ver registros, cambiar configuración, iniciar con Windows, apagar.
- Ventana propia con el panel (QR, Conexión, chats). Pide usuario y contraseña del CRM.
- Arranca sola al iniciar sesión en Windows (oculta, solo el ícono).
- Cerrar la ventana **no** apaga el servidor. Solo "Apagar el servidor y salir" lo apaga.
- Aviso de Windows si la línea pasa 5 minutos sin conectar (las alertas por email las
  manda el servidor, ver OPERACION.md).

Dónde guarda las cosas (`%APPDATA%\Neifert WhatsApp`):

| Qué | Dónde |
|---|---|
| Configuración (cifrada con la cuenta de Windows) | `config.cifrada` |
| Sesión de WhatsApp, registros, diario local | `data\` |
| Versiones del servidor bajadas | `versiones\` |
| Registro de la app (servidor, túnel, actualizaciones) | `app.log` |

---

## Actualizaciones: el instalador no se toca

El instalador trae una versión inicial del servidor. Las siguientes se **publican** y la PC
servidor las baja sola (revisa al minuto de arrancar y cada 30 minutos):

```sh
cd Whatsapp/escritorio
npm run publicar
```

- Arma el servidor + panel con sus dependencias (sin `.env`, sin `data/`, sin ffmpeg) y lo
  sube al bucket privado de R2 (`app/servidor/<versión>.tar.gz` + `ultima.json`).
- Usa las credenciales de R2 de `Whatsapp/servidor/.env` de quien publica.
- La PC servidor verifica la huella SHA-256, lo descomprime, reinicia el servidor con la
  versión nueva (unos segundos sin conexión) y guarda la anterior.
- **Si la versión nueva se cae al arrancar tres veces seguidas, vuelve sola a la anterior**
  y la marca como mala (no la vuelve a intentar).
- Antes de publicar: `npm test` y `npm run lint` en la raíz del repo. Lo que se publica
  corre en producción en menos de 30 minutos.

El instalador solo hay que rearmarlo si cambia la app en sí (`main.cjs`, ventanas,
versión de Electron o de cloudflared).

---

## Armar el instalador (en la PC de desarrollo)

```sh
cd Whatsapp/escritorio
npm install
node node_modules/electron/install.js   # npm 11 bloquea el script que baja Electron
npm run empaquetar
```

Resultado: `Whatsapp/escritorio/dist/Neifert WhatsApp Setup 1.0.0.exe` (~160 MB). Lleva
Electron, el servidor, el panel, ffmpeg y cloudflared. **No lleva claves ni conversaciones.**

El `.exe` no está firmado digitalmente: Windows SmartScreen va a mostrar "Windows protegió
tu PC" → **Más información → Ejecutar de todas formas**. (Firmarlo requiere un certificado
de firma de código, ~USD 100–400 por año.)

---

## Instalar en la PC servidor

1. **Preparar el archivo de configuración** (el `.env` del servidor) y pasárselo a quien
   instala **por un gestor de contraseñas** (Bitwarden Send, 1Password), nunca por chat
   ni mail. Modelo: `Whatsapp/servidor/.env.example`. Mínimo:

   | Variable | Para qué |
   |---|---|
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Login con el CRM y la integración con clientes |
   | `WA_DATABASE_URL` | Base de mensajes (proyecto "Whatsapp Neifert") |
   | `WA_R2_BUCKET`, `WA_R2_ENDPOINT`, `WA_R2_ACCESS_KEY_ID`, `WA_R2_SECRET_ACCESS_KEY` | Archivos, respaldo y actualizaciones |
   | `WHATSAPP_NUMERO` | El número de la concesionaria (549 + área + número) |
   | `CRM_URL=https://neifertautomotores.com/crm/whatsapp` | Quién puede mostrar el panel |
   | `WA_TUNEL_TOKEN` | Cloudflare Tunnel (ver abajo) |
   | `WA_BACKUP_CLAVE` | Cifra el respaldo de la sesión (guardarla también en el gestor) |
   | `WA_ALERTA_EMAIL`, `RESEND_API_KEY` | Alertas por email |

   No hace falta `HOST`, `PUERTO`, `DATA_DIR` ni `WA_DETRAS_DE_PROXY`: los pone la app.
2. En la PC servidor: doble clic en `Neifert WhatsApp Setup.exe`.
3. Se abre **Configurar el servidor de WhatsApp** → **Elegir archivo…** → el `.env`. La
   app muestra si falta algo (sin mostrar los valores). Dejar marcado "Borrar el archivo
   original" → **Guardar y arrancar el servidor**.
4. Se abre el panel: entrar con un usuario **admin o dueño** del CRM → Conexión → escanear
   el QR con el celular de la concesionaria (dejar WhatsApp abierto unos minutos).
5. Para que vuelva sola después de un corte de luz:
   - BIOS de la PC: "Restore on AC power loss" → **Power On** (si la placa lo tiene).
   - Windows: inicio de sesión automático en esa cuenta (`netplwiz` → destildar "Los
     usuarios deben escribir su nombre y contraseña").
   - Configuración → Sistema → Energía: **no suspender** nunca con la PC enchufada.
   - Windows Update → Opciones avanzadas → **horas activas** en el horario de atención.

---

## Cloudflare Tunnel con `wa.neifertautomotores.com`

El CRM está en https, así que necesita llegar a esta PC por https. El túnel lo hace sin
abrir puertos del router ni tener IP fija. Hoy el DNS de `neifertautomotores.com` está en
Vercel; hay que pasarlo a Cloudflare (gratis, una sola vez; la web sigue en Vercel).

1. **Cuenta de Cloudflare** → **Add a domain** → `neifertautomotores.com` → plan Free.
   Cloudflare copia los registros DNS actuales: **revisar que estén los de Vercel** (el `A`
   del dominio y el `CNAME`/`A` de `www`), y cualquier `MX`/`TXT` del correo.
2. Cloudflare da dos servidores de nombres (`xxx.ns.cloudflare.com`). Cambiarlos donde está
   registrado el dominio (si se compró en Vercel: Vercel → Domains → el dominio →
   Nameservers). Tarda de minutos a unas horas.
3. En Vercel → proyecto → Settings → Domains, el dominio tiene que seguir en verde (Vercel
   funciona con DNS externo; si pide un registro, agregarlo en Cloudflare).
4. Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** → Cloudflared →
   nombre `neifert-whatsapp`. En "Install connector" copiar **solo el token** (lo que va
   después de `--token`) → `WA_TUNEL_TOKEN` del archivo de configuración. No hace falta
   correr el comando de instalación: la app trae `cloudflared`.
5. En el túnel → **Public Hostname** → `wa` . `neifertautomotores.com` → Service
   `HTTP` → `localhost:3100`.
6. En Vercel (proyecto del CRM) → Environment Variables:
   `VITE_WHATSAPP_PANEL_URL=https://wa.neifertautomotores.com` → **Redeploy**.

Comprobación: desde cualquier PC, `https://wa.neifertautomotores.com/api/salud` responde
`{"ok":true,...}` con la línea conectada.

---

## Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| El ícono dice "Sin conexión" | Ícono → Ver registros (`app.log` y `data\logs`). Ícono → Reiniciar el servidor. |
| El CRM dice que no llega al servidor | ¿La PC está prendida y la app abierta? `app.log` debe decir "Iniciando Cloudflare Tunnel" sin errores después. Revisar `WA_TUNEL_TOKEN`. |
| Una actualización rompió algo | La app vuelve sola a la anterior si el servidor no arranca. Si arranca pero anda mal: publicar una versión corregida (`npm run publicar`). |
| Hay que cambiar una clave | Ícono → Cambiar configuración… → elegir el `.env` nuevo (completo). |
| La PC se rompió | Instalar la app en otra PC con el mismo archivo de configuración → ícono → **Restaurar la sesión desde el respaldo…** (con `WA_BACKUP_CLAVE` y R2 conecta sin QR; si no, escanear el QR de nuevo). **Nunca dos PC con la app a la vez** (se desconectan entre sí, error 440). |
| Desinstalar | Configuración de Windows → Aplicaciones → Neifert WhatsApp. La carpeta `%APPDATA%\Neifert WhatsApp` queda (sesión y configuración); borrarla a mano si la PC deja de ser el servidor. |
