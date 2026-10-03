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

Por ahora, solo en local, para probar. Dónde se va a alojar está pendiente de definir.

---

## 2. Login con el CRM

No hay usuarios ni contraseñas propias del WhatsApp, ni se elige "qué PC" o "qué
empleado" se es: cada uno entra con su usuario del CRM y queda identificado con él.

1. En el CRM, el ítem **WhatsApp** del menú (`/crm/whatsapp`) muestra el panel embebido
   en la misma página, pasándole el token de Supabase del usuario (`#t=...`).
2. El servidor le pregunta a Supabase de quién es ese token, busca el usuario en
   `crm.usuarios` y revisa que esté **activo** y tenga **permiso**.
3. Si todo da, deja una cookie propia, firmada, que dura 12 horas (`SESION_HORAS`). El
   token se borra de la dirección. Si la sesión vence con el panel abierto, el CRM lo
   recarga solo con un token nuevo.
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

Todo usuario **activo** del CRM. El ítem **WhatsApp** está siempre en el menú, para todos
los roles, y no hay que configurar nada en la base. Si lo dan de baja en el CRM, deja de
entrar.

Para limitarlo a algunos roles se usa `WHATSAPP_ROLES` en el servidor (por ejemplo
`admin,dueno`); el resto ve el menú pero el panel le dice que no tiene acceso.

### Quién puede vincular la línea

Cualquier usuario ve el QR en **Conexión** y lo puede escanear. Con el número de la
concesionaria fijado (`WHATSAPP_NUMERO`), si alguien lo escanea con otro número (por
ejemplo, su celular personal), el servidor lo desvincula al instante, no guarda nada de
esa cuenta y la pantalla avisa qué número se rechazó. **Sin `WHATSAPP_NUMERO` se acepta
cualquier número**: el servidor lo avisa al arrancar.

**Desvincular** (en **Conexión**) también lo puede hacer cualquier usuario. Corta la
línea para todos y pide confirmación; en el registro de actividad queda quién fue.

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
| `WHATSAPP_ROLES` | — (todos) | Limita el WhatsApp a esos roles del CRM, separados por coma |
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
| Mensajes | `wa.mensajes` (se borran solos a los 365 días) |
| Chats (archivado, fijado, silenciado) | `wa.chats` |
| Contactos | `wa.contactos` |
| LIDs, preferencias, fotos de perfil conocidas | `wa.estado` |
| Fotos, videos, audios, stickers, documentos | Cloudflare R2 `media/<chat>/` (sin R2: `DATA_DIR/media/<chat>/`) |
| Fotos de perfil | Cloudflare R2 `fotos/` (sin R2: `DATA_DIR/fotos/`) |
| Sesión de WhatsApp (la llave) | `DATA_DIR/sesion/` |
| Firma de las cookies | `DATA_DIR/secreto-sesion` |

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
| "Tu usuario no tiene acceso al WhatsApp" | El usuario está inactivo en el CRM, o su rol no está en `WHATSAPP_ROLES`. |
| El servidor no arranca y habla de `HOST` | Está abierto a la red sin login configurado. Completar las variables de Supabase. |
| Error 440 / "Otra conexión abrió esta misma sesión" | Hay dos servidores con la misma carpeta `data/`. Dejar uno solo. |
| Se desvinculó solo | Pasaron más de 14 días sin abrir WhatsApp en el celular, o se cerró desde el teléfono. Escanear el QR otra vez. |
