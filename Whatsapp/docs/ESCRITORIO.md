# App de escritorio — la PC que hace de servidor

`Whatsapp/escritorio` es un instalador de Windows (`Neifert WhatsApp Setup.exe`) que
convierte una PC en el servidor del WhatsApp. En esa PC no hace falta Git, Node ni tocar
archivos: se instala, se elige el archivo de configuración una vez y queda andando.

Los demás empleados **no instalan nada**: usan el WhatsApp desde el CRM, que llega a esta
PC por `https://wa.neifertautomotores.com` (Cloudflare Tunnel).

---

## Qué hace la app

La app **no muestra el WhatsApp**: el WhatsApp se usa desde el CRM, en el navegador. La app
solo deja la PC andando como servidor:

- **Pantalla de inicio:** el número de la línea y un botón **Iniciar servidor**. El número
  se escribe como un celular local: **característica sin el 0 + número sin el 15**, 10
  dígitos (`3492 123456`, `11 2345 6789`). Sin +54 ni 9: eso lo agrega la app. Si se
  escribe de otra forma (con 0, 15, 54 o 9, o con otra cantidad de dígitos) no deja
  iniciar y explica qué corregir. El número queda guardado: no hay que escribirlo cada vez.
- **Al prender la PC** arranca sola con el número guardado (si quedó tildado "Iniciar el
  servidor solo al prender la PC"), así después de un corte de luz vuelve sin que nadie
  toque nada. Abriéndola a mano muestra la pantalla de inicio.
- **Ventanita de estado:** si hay que vincular la línea se abre sola con el **QR** y avisa;
  si no, muestra la línea conectada. "Cambiar número" detiene el servidor y vuelve al inicio.
- Corre el servidor con el Node que trae adentro y lo vuelve a levantar si se cae; corre
  Cloudflare Tunnel (`cloudflared`, incluido) si la configuración tiene `WA_TUNEL_TOKEN`.
- Ícono junto al reloj: estado, versión, abrir WhatsApp en el navegador, reiniciar, buscar
  actualización, ver registros, cambiar configuración, restaurar la sesión, iniciar con
  Windows, apagar.
- Cerrar la ventana **no** apaga el servidor. Solo "Apagar el servidor y salir" lo apaga.
- Aviso de Windows si la línea pasa 5 minutos sin conectar (las alertas por email las
  manda el servidor, ver OPERACION.md).

### Cada número con sus datos

Todo se guarda **por número de línea**, así se puede probar con un celular propio y usar
el de la concesionaria sin mezclar ni borrar nada:

| Dónde | Cómo se separa |
|---|---|
| Supabase (`wa.*`) | Columna `linea` en chats, mensajes, contactos, estado y auditoría (supabase/whatsapp_v4_lineas.sql) |
| Cloudflare R2 | Carpeta `lineas/<549…>/` (media, miniaturas, fotos de perfil, respaldo) |
| La PC | `data\lineas\<549…>\` (sesión de WhatsApp, diario local) |

Un número nuevo arranca vacío y se va llenando solo: no hay que crear tablas ni carpetas.
Para borrar las pruebas de un número: sus filas (`delete … where linea = '549…'`) y su
carpeta `lineas/549…/` en R2. Lo común a todas las líneas es solo `app/` (las
actualizaciones del servidor).

### Tope de espacio en R2

El bucket nunca pasa de **9 GB** (`WA_R2_LIMITE_GB`; el plan gratuito incluye 10). Al
llegar al 85 % se borran los archivos más viejos hasta bajar al 75 %: los mensajes quedan,
con el aviso "Archivo borrado para liberar espacio" (se puede volver a bajar a mano). Nunca
se sube algo que haga pasar el tope. El tope es por bucket: suma todas las líneas.

Dónde guarda las cosas en la PC (`%APPDATA%\Neifert WhatsApp`):

| Qué | Dónde |
|---|---|
| Configuración (cifrada con la cuenta de Windows) | `config.cifrada` |
| Número de la línea y si arranca solo | `ajustes.json` |
| Sesión de WhatsApp y diario local, por número | `data\lineas\<549…>\` |
| Registros del servidor | `data\logs\` |
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
   | `CRM_URL=https://neifertautomotores.com/crm/whatsapp` | Quién puede mostrar el panel |
   | `WA_TUNEL_TOKEN` | Cloudflare Tunnel (ver abajo) |
   | `WA_BACKUP_CLAVE` | Cifra el respaldo de la sesión (guardarla también en el gestor) |
   | `WA_ALERTA_EMAIL`, `RESEND_API_KEY` | Alertas por email |

   No hace falta `HOST`, `PUERTO`, `DATA_DIR` ni `WA_DETRAS_DE_PROXY`: los pone la app.
   **El número de la línea no va en este archivo**: se escribe en la app (paso 4).
2. En la PC servidor: doble clic en `Neifert WhatsApp Setup.exe`.
3. Se abre **Configurar el servidor de WhatsApp** → **Elegir archivo…** → el `.env`. La
   app muestra si falta algo (sin mostrar los valores). Dejar marcado "Borrar el archivo
   original" → **Guardar y arrancar el servidor**.
4. En la pantalla de inicio: escribir el número de la concesionaria (característica sin 0
   + número sin 15) → **Iniciar servidor**. Aparece el QR: escanearlo con el celular de
   ese número (dejar WhatsApp abierto unos minutos). Desde ahí el WhatsApp se usa en el CRM.
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
