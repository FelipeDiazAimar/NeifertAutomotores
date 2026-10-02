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

No hay usuarios ni contraseñas propias del WhatsApp. Se usa la sesión del CRM:

1. En el CRM aparece la vista **WhatsApp** en el menú. El botón **Abrir WhatsApp** abre
   el panel en otra pestaña pasándole el token de Supabase del usuario (`#t=...`).
2. El servidor le pregunta a Supabase de quién es ese token, busca el usuario en
   `crm.usuarios` y revisa que esté **activo** y tenga **permiso**.
3. Si todo da, deja una cookie propia, firmada, que dura 12 horas (`SESION_HORAS`). El
   token se borra de la barra de direcciones.
4. En cada pedido se vuelve a mirar el usuario (con 60 s de caché). Si lo dan de baja o
   le sacan el permiso en el CRM, **pierde el acceso en menos de un minuto**.

### Quién tiene permiso

La misma regla de vistas que el resto del CRM:

- Tiene la vista `whatsapp` (por su rol, o marcada a mano en su usuario), **o**
- su rol está en `WHATSAPP_ROLES_SIEMPRE` (por defecto `admin` y `dueno`).

Para que admin y dueño vean el botón en el menú del CRM hay que correr una vez
[`supabase/crm_whatsapp_vista.sql`](../../supabase/crm_whatsapp_vista.sql), o marcar la
vista **WhatsApp** en la pantalla **Roles**. A un vendedor puntual se le puede dar desde
**Usuarios**.

> Quien tiene acceso al panel también ve la pestaña **Conexión**, donde se puede
> desvincular la línea. Dénselo solo a quien corresponda.

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
| `DATA_DIR` | `data` | Sesión de WhatsApp y archivos (y mensajes en modo local) |
| `SUPABASE_URL` | (el de la raíz) | Proyecto de Supabase del CRM. También acepta `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | (el de la raíz) | Para verificar el token del usuario |
| `SUPABASE_SERVICE_ROLE_KEY` | (el de la raíz) | Para leer `crm.usuarios` y `crm.roles`. **Solo servidor** |
| `CRM_URL` | — | Adónde manda el botón "Ir al CRM" a quien entra sin sesión |
| `WHATSAPP_ROLES_SIEMPRE` | `admin,dueno` | Roles que entran sin tener la vista marcada |
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
| Fotos, audios, documentos | `DATA_DIR/media/<chat>/` (después, Cloudflare R2) |
| Fotos de perfil | `DATA_DIR/fotos/` |
| Sesión de WhatsApp (la llave) | `DATA_DIR/sesion/` |
| Firma de las cookies | `DATA_DIR/secreto-sesion` |

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
| "Tu usuario no tiene acceso al WhatsApp" | Falta la vista `whatsapp` para ese usuario o su rol. Se da desde Roles o Usuarios. |
| El servidor no arranca y habla de `HOST` | Está abierto a la red sin login configurado. Completar las variables de Supabase. |
| Error 440 / "Otra conexión abrió esta misma sesión" | Hay dos servidores con la misma carpeta `data/`. Dejar uno solo. |
| Se desvinculó solo | Pasaron más de 14 días sin abrir WhatsApp en el celular, o se cerró desde el teléfono. Escanear el QR otra vez. |
