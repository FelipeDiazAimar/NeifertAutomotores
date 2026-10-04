# Servidor de WhatsApp de Neifert

Cómo funciona el WhatsApp compartido de la concesionaria, dónde conviene alojarlo y
cómo se instala. Para el detalle de cómo funciona Baileys por dentro, ver
[Baileys.md](Baileys.md).

---

## 1. La idea en una frase

El número de la concesionaria se vincula **una sola vez**, a un único servidor. Los
empleados no se conectan a WhatsApp: entran desde el CRM a ese servidor con su usuario,
y todos ven y responden lo mismo, en el mismo momento.

```
Teléfono con WhatsApp Business
        │  se vincula una vez (ocupa 1 de los 4 dispositivos permitidos)
        ▼
  SERVIDOR DE WHATSAPP  ── guarda mensajes, fotos y la sesión (carpeta data/)
        │  https, con el login del CRM
        ├──▶ empleado 1 (navegador)
        ├──▶ empleado 2 (navegador)
        ├──▶ empleado 3 (navegador)
        └──▶ empleado 4 (navegador)
```

### Por qué no se pisan

- **Hay un solo lugar que escribe.** Los navegadores no guardan nada: le piden al
  servidor que mande el mensaje, archive un chat, etc. No hay copias que se desincronicen.
- **Todos ven todo al instante.** El servidor avisa a todos los navegadores abiertos por
  un canal en vivo (Server-Sent Events): un mensaje nuevo o una respuesta aparece en las
  cuatro pantallas sin recargar.
- **Se ve quién está en cada chat.** Si Nico tiene abierto un chat, los demás ven
  "Nico está acá" en el encabezado y un puntito con su inicial en la lista.
- **Cada mensaje queda firmado.** Lo que se manda desde el panel guarda qué empleado lo
  envió; se ve arriba de la burbuja y en "Información" del mensaje. Lo que se manda
  desde el celular queda sin firma.

### Lo que no hay que hacer

- **Vincular el número en cada computadora.** Usa los 4 dispositivos que permite
  WhatsApp, cada PC guarda su propia copia con huecos, y dos servidores con la misma
  sesión se desconectan entre sí (error 440 `connectionReplaced`).
- **Copiar la carpeta `data/sesion`** a otro lado mientras el servidor corre. Es la llave
  de la cuenta: dos copias vivas se pisan y pueden romper la sesión.
- **Olvidarse del teléfono.** Hay que abrir WhatsApp en el celular al menos una vez cada
  14 días; si no, WhatsApp desconecta los dispositivos vinculados.

---

## Dónde corre

En la **PC titular** de la concesionaria, que queda siempre encendida, como tarea de
Windows que arranca sola, publicada por https con Cloudflare Tunnel. No hace falta Vercel
ni otro hosting. Instalación, respaldo, alertas y restauración: [OPERACION.md](OPERACION.md).

---

## 2. Login con el CRM

No hay usuarios ni contraseñas propias del WhatsApp, ni se elige "qué PC" o "qué
empleado" se es: cada uno entra con su usuario del CRM y queda identificado con él.

1. En el CRM, el ítem **WhatsApp** del menú (`/crm/whatsapp`) muestra el panel embebido
   en la misma página. El panel le pide al CRM el token de Supabase del usuario por
   mensaje entre ventanas (`postMessage`), y solo lo acepta si viene de un origen de
   `CRM_URL` (`GET /api/publico`). El token nunca va en la dirección, el historial ni
   los registros de ningún servidor.
2. El servidor le pregunta a Supabase de quién es ese token, busca el usuario en
   `crm.usuarios` y revisa que esté **activo** y tenga **permiso**.
3. Si todo da, deja una cookie propia, firmada, que dura 12 horas (`SESION_HORAS`). Si
   la sesión vence con el panel abierto, el panel le pide al CRM un token nuevo y sigue.
4. En cada pedido se vuelve a mirar el usuario (con 60 s de caché). Si lo dan de baja o
   le sacan el permiso en el CRM, **pierde el acceso en menos de un minuto**.

### Embebido en el CRM

- El panel solo se deja mostrar dentro del sitio de `CRM_URL` (cabecera
  `frame-ancestors`). En esta PC también se acepta `localhost`, para el CRM de desarrollo.
- Por https la cookie va `SameSite=None; Partitioned`, así funciona aunque el CRM y el
  servidor estén en dominios distintos. Igual conviene un subdominio del mismo dominio
  (por ejemplo `wa.` + el dominio del CRM): Safari es más estricto con las cookies de
  otros sitios dentro de una página.
- Todo pedido que cambia algo trae la cabecera `X-NF-WA: 1`; sin ella el servidor lo
  rechaza. Así otro sitio no puede mandar acciones con la cookie del empleado.

### Quién tiene permiso

Por rol del CRM (configurable en el `.env` del servidor), y solo usuarios **activos**:

| Variable | Por defecto | Qué pueden hacer |
|---|---|---|
| `WHATSAPP_ROLES` | `admin,dueno,vendedor` | Entrar a la bandeja y escribir |
| `WHATSAPP_ROLES_LINEA` | `admin,dueno` | Además: ver el QR, vincular, desvincular, reconectar, preferencias, salir de grupos y ver la auditoría |
| `WHATSAPP_ROLES_LECTURA` | — | Solo mirar: no escriben ni cambian nada |

El servidor lo controla en cada pedido (403 si no corresponde) y el panel esconde lo que
el usuario no puede usar. Cada acción queda en la **auditoría** (`wa.auditoria`), también
los intentos rechazados.

### Quién puede vincular la línea

Solo los roles de `WHATSAPP_ROLES_LINEA`: a los demás el servidor ni les manda el QR. Con
el número de la concesionaria fijado (`WHATSAPP_NUMERO`), además, si se escanea con otro
número el servidor lo desvincula al instante, no guarda nada de esa cuenta, lo deja en la
auditoría y la pantalla avisa qué número se rechazó.

**Desvincular** también es de `WHATSAPP_ROLES_LINEA`: corta la línea para todos.

La línea se vincula únicamente con QR. Funciona igual con WhatsApp y con WhatsApp
Business (la app del celular).

### Freno de seguridad

Si el servidor queda accesible desde otras computadoras (`HOST=0.0.0.0`) y el login no
está configurado, **no arranca**. Así nunca queda un panel abierto donde cualquiera de la
red pueda escribir con el número de la concesionaria.

`WHATSAPP_LOGIN=off` apaga el login, pero solo se acepta con `HOST=127.0.0.1` (usar el
panel únicamente desde la misma PC, para desarrollo).

---

## 3. Variables del servidor

Se leen de `Whatsapp/servidor/.env`, después del `.env` de la raíz del repo, y lo que ya
esté definido en el entorno tiene prioridad.

| Variable | Por defecto | Para qué |
|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0` para que entren otras computadoras. Exige el login con el CRM |
| `PUERTO` / `PORT` | `3100` | Puerto del panel |
| `WA_DATABASE_URL` | — | Conexión a la base de los mensajes (Session pooler de Supabase). También acepta `WA_SUPABASE_URL` |
| `ALMACEN` | `supabase` si hay `WA_DATABASE_URL`, si no `local` | `local` guarda en archivos, para pruebas |
| `DATA_DIR` | `data` | Sesión de WhatsApp, y archivos si no hay R2 (y mensajes en modo local) |
| `WA_R2_BUCKET` | — | Bucket **privado** de R2 para los archivos. Vacío: van a `DATA_DIR` |
| `WA_R2_ENDPOINT` | `R2_ENDPOINT` | Endpoint de la cuenta de R2 |
| `WA_R2_ACCESS_KEY_ID` / `WA_R2_SECRET_ACCESS_KEY` | `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Token con acceso de lectura y escritura al bucket. **Solo servidor** |
| `SUPABASE_URL` | (el de la raíz) | Proyecto de Supabase del CRM. También acepta `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | (el de la raíz) | Para verificar el token del usuario |
| `SUPABASE_SERVICE_ROLE_KEY` | (el de la raíz) | Para leer `crm.usuarios`. **Solo servidor** |
| `CRM_URL` | — | Dirección del CRM: el único sitio que puede embeber el panel, y adónde manda "Ir al CRM" a quien entra sin sesión |
| `WHATSAPP_ROLES` / `_LINEA` / `_LECTURA` | `admin,dueno,vendedor` / `admin,dueno` / — | Permisos por rol (ver "Quién tiene permiso") |
| `WA_DETRAS_DE_PROXY` | `off` | `on` con Cloudflare Tunnel o nginx: toma de ahí el https y la IP |
| `WA_BACKUP_CLAVE` | — | Cifra el respaldo de la sesión y los `.env` en R2 (ver OPERACION.md) |
| `WA_ALERTA_EMAIL`, `RESEND_API_KEY`, `WA_ALERTA_WEBHOOK` | — | Destino de las alertas (ver OPERACION.md) |
| `WA_MEDIA_MAX_MB` | `64` | Tamaño máximo de archivo, para bajar y para mandar |
| `WA_VERSION` | — | Versión fija del protocolo de WhatsApp Web |
| `WHATSAPP_NUMERO` | — | Número de la concesionaria, con código de país. Si se escanea el QR con otro, se rechaza. Vacío: se acepta cualquiera |
| `SESION_HORAS` | `12` | Cuánto dura la sesión del panel |
| `SESION_SECRETO` | se genera | Firma de la cookie. Si no se define se guarda en `DATA_DIR/secreto-sesion` |
| `WHATSAPP_LOGIN` | — | `off` apaga el login (solo con `HOST=127.0.0.1`) |

Del lado del CRM (Vercel): `VITE_WHATSAPP_PANEL_URL`, la dirección del servidor.

---

## 4. Dónde se guarda cada cosa

Chats, contactos y mensajes van a Supabase (esquema `wa`, creado con
`supabase/whatsapp_schema.sql`). Al arrancar, el servidor trae todo a memoria y después
escribe los cambios en tandas cada 1,5 segundos. Si la base no responde, reintenta cada
10 segundos sin perder nada mientras el servidor siga prendido.

| Qué | Dónde |
|---|---|
| Mensajes | `wa.mensajes` (solo los últimos 365 días, ver abajo) |
| Chats (archivado, fijado, silenciado) | `wa.chats` |
| Contactos | `wa.contactos` |
| LIDs, preferencias, fotos de perfil conocidas, carpeta de cada chat | `wa.estado` |
| Fotos, videos, audios, stickers, documentos | Cloudflare R2 `media/<carpeta>/` (sin R2: `DATA_DIR/media/<carpeta>/`) |
| Fotos de perfil | Cloudflare R2 `fotos/` (sin R2: `DATA_DIR/fotos/`) |
| Sesión de WhatsApp (la llave) | `DATA_DIR/sesion/` |
| Firma de las cookies | `DATA_DIR/secreto-sesion` |

### Últimos 365 días

Se guarda lo de los últimos 365 días (`WA_VENTANA_DIAS`), y nada más viejo:

- **Al arrancar y una vez por día**, el servidor borra lo que quedó afuera: los mensajes
  (de la base), sus archivos (de R2 o del disco) y los chats que quedaron sin mensajes.
  Los grupos se quedan aunque estén vacíos. Lo hace el servidor y no la base, para que
  ningún archivo quede huérfano en R2.
- **Lo más viejo que manda WhatsApp con el historial no se guarda.**
- **Historial al vincular:** el servidor le pide al celular el historial completo, pero
  se presenta como navegador (Chrome), y el celular decide cuánto manda: no siempre es
  todo. Presentarse como WhatsApp de escritorio traería más, pero con esta versión de
  Baileys WhatsApp corta la conexión (error 428) y no llega a mostrar el QR. El
  historial solo llega al **vincular con QR**.
- **Todos los archivos se bajan solos**, también los del historial: fotos, audios,
  stickers, videos y documentos, de lo más nuevo a lo más viejo, de a uno (WhatsApp corta
  si se le piden muchos seguidos). Lo que falta se vuelve a poner en cola cada vez que
  el servidor conecta. Se puede apagar en **Preferencias → Descargar fotos, audios y
  documentos al llegar**. Los de más de 50 MB y los de "ver una vez" no se bajan.

### Sin pérdida ante un corte (diario local)

Los cambios van a Supabase en tandas cada 1,5 s. Para que un corte (luz, Windows Update,
un proceso que se mata) en ese lapso no pierda nada, cada mensaje y cada chat que cambia
se anota **antes** en `data/diario/` (src/diario.js). Lo que llega en vivo se fuerza al
disco en el momento; lo del historial, cada 200 ms. Cuando Supabase confirma la tanda, lo
anotado se borra. Al arrancar, lo que quedó en el diario se vuelve a cargar y a mandar
(el registro dice "Se recuperó lo que había quedado sin guardar").

Prueba (B-05): cargar 100 mensajes, matar el proceso con `kill -9` antes de la tanda y
volver a arrancar → los 100 están en Supabase. Se probó el 04/10/2026: 0 faltantes.

### Bandeja de salida

Si se manda algo (texto, archivo o nota de voz) con WhatsApp desconectado, o se corta
justo al mandar, no se pierde: queda en el chat con un reloj, "En cola", guardado como
cualquier mensaje (diario + Supabase, y su archivo en R2). Cuando vuelve la conexión sale
solo, en orden, firmado por quien lo escribió, y el borrador se reemplaza por el mensaje
real. Además, la cola se revisa cada minuto. Si falla por otra cosa (5 intentos) queda en
"No se pudo mandar" con **Reintentar** y **Descartar**. La caja de texto nunca se
deshabilita por falta de conexión.

### Conciliación de R2 y borrar un chat

- **Una vez por día**, después de la limpieza de la ventana, el servidor compara lo que hay
  en el bucket (`media/`, `miniaturas/`, `fotos/`) con lo que referencian los mensajes y
  borra lo que no usa nadie. Con freno: no toca archivos de menos de un día, ni carpetas
  con una mudanza pendiente, y si sobra más del 30 % no borra nada y avisa.
- **Borrar chat del respaldo** (ficha del chat, solo `WHATSAPP_ROLES_LINEA`): borra sus
  mensajes, su carpeta entera en R2 y su foto. En el celular el chat sigue. Queda en la
  auditoría.
- **Mudar archivos** (cuando WhatsApp une dos chats en uno): primero se copia todo, se
  verifica cada copia y recién ahí se borran los originales. Si falla a la mitad, queda
  anotado y se reintenta al arrancar.

La base solo tiene las tablas que se usan: `config`, `contactos`, `chats`, `mensajes`,
`estado` y `auditoria` (`supabase/whatsapp_v3_limpieza.sql` sacó `archivos`,
`r2_por_borrar` y `sesion`, que nunca se usaron).

### Archivos en Cloudflare R2

Con `WA_R2_BUCKET` definido, todo archivo nuevo (lo que llega y lo que se manda) y las
fotos de perfil se guardan en R2. El navegador nunca habla con R2: le pide el archivo al
servidor, que lo trae y lo entrega solo a quien entró desde el CRM. Los videos y audios
se pueden adelantar sin bajar todo (pedidos parciales).

1. En Cloudflare → **R2** → **Create bucket**, por ejemplo `neifert-whatsapp`. Dejalo
   **privado**: sin dominio público ni acceso por `r2.dev`. **No uses el bucket del
   catálogo**, que es público: las fotos de perfil van por número de teléfono y
   cualquiera con el enlace vería las conversaciones.
2. Credenciales: si el token de R2 del CRM (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`)
   tiene acceso a todos los buckets, sirve ese. Si está limitado al bucket del catálogo,
   creá uno en **R2 → Manage API Tokens** con *Object Read & Write* sobre el bucket nuevo
   y ponelo en `WA_R2_ACCESS_KEY_ID` / `WA_R2_SECRET_ACCESS_KEY`.
3. En `Whatsapp/servidor/.env`: `WA_R2_BUCKET=neifert-whatsapp`. El endpoint
   (`R2_ENDPOINT`, el de la cuenta) se toma del `.env` del CRM si no definís
   `WA_R2_ENDPOINT`. Reiniciá el servidor: al arrancar dice *Archivos … Cloudflare R2*.
4. Lo que ya estaba en el disco se sigue viendo (el servidor lo busca primero ahí). Para
   subirlo: `npm run subir-r2`. Cuando termine sin errores, `npm run subir-r2 -- --borrar`
   lo borra del disco. Se puede correr más de una vez.

**Una carpeta por contacto.** Dentro de `media/`, cada chat tiene su carpeta con el nombre
y el número: `Uli Avendaño (+5493406643845)`, o `Grupo Proyecto GIMNASIO (120363…)` para
los grupos. El número va siempre porque dos contactos pueden llamarse igual. El nombre se
fija la primera vez que se guarda un archivo de ese chat: si el contacto después se cambia
el nombre, la carpeta sigue igual (así nada queda repartido en dos). Las carpetas del
formato anterior (`media/<número>_s_whatsapp_net/`) se renombran solas al arrancar.

Las fotos de perfil van aparte, en `fotos/`, por número. Si una figura como guardada y no
está (por ejemplo, se borró a mano), el servidor la vuelve a bajar al conectar.

Sin `WA_R2_BUCKET`, los archivos quedan en `DATA_DIR` como antes. En producción R2 evita
depender del disco del servidor: si se cambia de host, solo hay que llevar `data/sesion`.

### Modo local, para pruebas

Con `ALMACEN=local` en `Whatsapp/servidor/.env`, chats y mensajes se guardan en
`DATA_DIR` (`estado.json` y `mensajes/<chat>.jsonl`) y la base no se toca. Sirve para
probar cambios sin ensuciar los datos reales. Para volver, se borra esa línea.

Para subir a Supabase lo que haya en los archivos locales, con el servidor apagado:

```sh
npm run importar
```

Se puede correr más de una vez: actualiza lo que ya existe, no duplica.

Volumen real medido en septiembre de 2026: unos 260 mensajes por día, 400 bytes por
mensaje: el texto de un año entero ocupa alrededor de 38 MB. Lo que más crece son los
archivos.

---

## 5. Solución de problemas

| Síntoma | Qué pasa |
|---|---|
| El panel dice "Entrá desde el CRM" | No hay sesión o venció (12 h). Abrirlo de nuevo con el botón del CRM. |
| "Tu usuario no tiene acceso al WhatsApp" | El usuario está inactivo en el CRM, o su rol no está en `WHATSAPP_ROLES` ni en `WHATSAPP_ROLES_LECTURA`. |
| El servidor no arranca y habla de `HOST` | Está abierto a la red sin login configurado. Completar las variables de Supabase. |
| Error 440 / "Otra conexión abrió esta misma sesión" | Hay dos servidores con la misma carpeta `data/`. Dejar uno solo. |
| Se desvinculó solo | Pasaron más de 14 días sin abrir WhatsApp en el celular, o se cerró desde el teléfono. Escanear el QR otra vez. |
