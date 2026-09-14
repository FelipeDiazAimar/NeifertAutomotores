# WhatsApp · prueba local

Versión preliminar de la bandeja de WhatsApp de Neifert. Corre entera en tu PC: un servicio Node con Baileys se conecta a WhatsApp, guarda todo en archivos locales y sirve una pantalla web para usarlo. Sirve para probar el funcionamiento real con tu número antes de integrarlo al CRM y pasarlo a producción.

```
Whatsapp/
  mockup/     diseño de referencia (datos de ejemplo, sin conexión)
  servidor/   servicio Node + Baileys + API
  web/        pantalla de prueba (la sirve el servidor)
```

## Cómo correrlo

Requisito: Node.js 20 o superior.

```bash
cd Whatsapp/servidor
npm install
npm start
```

Abrí **http://localhost:3100**, entrá a **Conexión** y vinculá el número:

- **Con QR:** en el celular, WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá el código.
- **Con código:** escribí el número con código de país (ej. `5493564562413`), tocá **Pedir código** y cargalo en el celular desde *Vincular con número de teléfono*.

Para frenar el servicio: `Ctrl + C` en la terminal. La sesión queda guardada: al volver a hacer `npm start` se conecta sola, sin escanear de nuevo.

> Usá un número de prueba. Es una conexión no oficial y WhatsApp puede bloquear números que se usan para envíos masivos.

## Qué probar

| Prueba | Cómo | Qué tiene que pasar |
|---|---|---|
| Recibir texto | Desde otro celular, escribile a la línea | Aparece en la lista al instante, con contador de no leídos |
| Recibir foto, video y documento | Mandalos desde otro celular | Se ven en el chat; la foto se amplía con un clic y el documento se descarga |
| Recibir nota de voz | Grabá un audio desde otro celular | Se reproduce en el panel con la barra de progreso |
| **Anti-borrado** | Mandá un mensaje y usá *Eliminar para todos* | El mensaje sigue visible con el aviso "El contacto lo eliminó a las HH:MM" |
| Anti-borrado de multimedia | Mandá una foto y eliminala para todos | La foto sigue abriéndose en el panel |
| Edición | Editá un mensaje ya enviado | Muestra "editado" y "Ver versión anterior" con el texto original |
| Reacción | Reaccioná a un mensaje | Aparece el emoji debajo de la burbuja |
| Reaccionar desde el panel | Pasá el mouse por un mensaje → flechita → elegí un emoji | Llega la reacción al celular; tocar el mismo emoji la quita |
| Responder citando | Flechita del mensaje → Responder → escribí y Enter | En el celular llega como respuesta al mensaje citado |
| Ir al mensaje citado | Tocá la cita dentro de una burbuja | La conversación salta al original y lo resalta |
| "Escribiendo…" | Abrí un chat y escribí desde el otro celular | El encabezado y la lista muestran "escribiendo…" |
| Fotos de perfil | Esperá unos minutos después de conectar | Aparecen de a poco en la lista y en el encabezado |
| Archivados, fijados y silenciados | Archivá, fijá o silenciá un chat en el celular | La lista del panel se actualiza sola |
| Borradores | Escribí algo sin enviar y cambiá de chat | La lista muestra "Borrador:" y el texto vuelve al regresar |
| Formato | Mandá \*negrita\*, \_cursiva\_, \~tachado\~ o un link | Se ve con formato y el link se puede abrir |
| Enviar texto | Escribí en el panel y Enter | Llega al otro celular; los tildes pasan a entregado y leído |
| Enviar archivo | Clip → elegí una foto, video o PDF | Llega al otro celular; lo escrito en la caja va como descripción |
| Enviar nota de voz | Micrófono → hablá → enviar | Llega como nota de voz (no como archivo) y se reproduce en el celular |
| Mensajes desde el celular | Escribí desde el celular vinculado | También quedan guardados en el panel |
| Nuevo chat | Botón + → número | Abre el chat aunque ese número nunca haya escrito |
| Reinicio | `Ctrl + C` y `npm start` | Se reconecta solo y los chats siguen ahí |
| Corte de internet | Desconectá el wifi un minuto | Muestra "Conectando…" y se recupera solo al volver |
| Desvincular desde el celular | Dispositivos vinculados → cerrar sesión | El panel vuelve a mostrar el QR; los chats guardados quedan |
| Espacio | Conexión → Espacio usado | Muestra cuánto ocupan fotos, videos, audios, documentos y mensajes |

## Dónde se guardan los datos

Todo queda en `Whatsapp/servidor/data/`, que está en `.gitignore`:

```
sesion/                 credenciales de WhatsApp (dan acceso a la cuenta: no compartir)
estado.json             chats, nombres de contactos y preferencias
mensajes/<chat>.jsonl   un cambio por línea; nada se borra ni se reescribe
media/<chat>/           fotos, videos, audios y documentos
```

Para empezar de cero: frená el servicio y borrá la carpeta `data/`.

## Límites conocidos

- **Solo chats individuales.** Grupos, estados y canales se ignoran.
- **Historial inicial corto.** Al vincular, WhatsApp manda solo los mensajes recientes; lo anterior no se recupera.
- **Lo borrado antes de conectar no se recupera.** El anti-borrado funciona con los mensajes que llegaron con el servicio andando.
- **Archivos de más de 50 MB** no se descargan.
- **Algunos contactos llegan sin número** (WhatsApp los identifica con un "LID"). En cuanto WhatsApp informa el número, el chat se une solo con el del teléfono.
- **Una sola instancia por sesión.** Si abrís dos `npm start` con la misma carpeta `data/`, WhatsApp las desconecta.
- El servicio escucha solo en `localhost`: no se puede abrir desde otro dispositivo de la red.

## Después: integración al CRM

- `servidor/src/almacen.js` es el único archivo que toca el disco. Para pasar a base de datos + Cloudflare R2 se reemplaza ese módulo.
- `web/` es provisoria: en el CRM se reescribe en React con los componentes existentes, usando la misma API.
- Para producción falta: autenticación de la API con los usuarios del CRM, correr el servicio en un servidor siempre prendido y definir cómo lo accede el panel publicado.
