# Sofía: el asistente con IA conectado al WhatsApp del CRM

Guía para dejar andando a Sofía en la PC servidor de la concesionaria.

## Cómo funciona

- **Dos programas en la misma PC servidor, siempre prendida:**
  - **Neifert WhatsApp** (el servidor): atiende la línea de la concesionaria y le sirve el WhatsApp al CRM.
  - **BOT WhatsApp** (el bot): tiene vinculada **otra línea**, la de Sofía. Fuera del horario de atención contesta con IA.
- **El bot habla con el servidor** por `http://localhost:3100/api/bot`, nunca por internet. Usa un secreto que está en los dos lados.
- **Qué hace Sofía con el CRM:**
  - Usa el catálogo de autos para responder.
  - Carga al cliente y deja un seguimiento cuando empieza una charla.
  - Crea una tarea cuando deriva a una persona.
- **Dónde se ven sus charlas:** en el WhatsApp del CRM, dentro del chat del cliente.
  - Aparecen en un recuadro violeta, con una línea de inicio y otra de fin.
  - En la lista de chats tienen su propia marca "🤖 Sofía", con la cantidad de mensajes sin ver.

---

## Antes de empezar (lo hace Jeremías, una sola vez)

1. **Publicar la versión nueva del servidor** (API del bot, charlas de Sofía, respaldos):
   ```bash
   cd Whatsapp/escritorio
   npm run publicar
   ```
   La PC servidor la baja sola. Para no esperar: ícono → *Buscar actualización ahora*.
2. **Publicar la versión nueva del bot:** `npm run release` desde `BOT WhatsApp/bot-wsp`.
3. **Generar el secreto** que comparten el servidor y el bot:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Guardalo en el gestor de contraseñas, junto con `WA_BACKUP_CLAVE`. Pasáselo a tu compañero solo por ahí, nunca por WhatsApp ni por mail.

---

## Qué consulta Sofía en el CRM

Sofía no recibe el catálogo en cada mensaje: cuando necesita un dato, lo pide al CRM (`/api/bot`) con filtros y
solo le llega eso. Así el pedido a la IA pesa unas 3.000 letras aunque haya cientos de autos.

| Herramienta | Qué trae | Filtros |
|---|---|---|
| `buscar_vehiculos` | Autos usados y 0 km con precio, año, km, tipo, si está reservado y el enlace a la página | `q` (nombre), `marca`, `modelo`, `categoria` (pickup, SUV, sedán…), `condicion` (`usado` o `0km`), `anioDesde`, `anioHasta`, `kmMax`, `precioMax` + `moneda`, `combustible`, `transmision`, `disponibles`, `ordenar` (precio, año, km), `limite` |
| `consultar_negocio` | Dirección y mapa, horarios, teléfono, WhatsApp, email, redes, web y categorías | — |

Los horarios y la dirección salen de lo que se edita en la página (Admin → Contenido → Redes y contacto): una sola
fuente. Si el CRM no responde, Sofía le dice al cliente que **de momento no tiene acceso al catálogo (o a esos
datos) pero que lo puede ayudar con cualquier otra consulta**, y lo queda en la actividad del asistente.

Con un CRM conectado, el texto del negocio (tono, financiación, políticas) tiene un tope de 10.000 letras; sin CRM
sigue en 30.000 porque ahí van el catálogo y los horarios escritos a mano.

## Ver cómo anda Sofía (en el WhatsApp del CRM)

En **Conexión → Sofía (asistente con IA)**:

- **Estado:** conectada, sin señal del bot (la app del bot está apagada o la PC sin internet), sin WhatsApp vinculado o apagada; si está respondiendo o es horario de atención; charlas abiertas ahora; última falla de la IA.
- **Capacidad y uso:** respuestas con IA de este mes frente al cupo de la licencia (con barra: ámbar desde el 80%, roja al llegar al tope) y el tope por minuto.
- **Recuento:** clientes atendidos, conversaciones, mensajes y caracteres de clientes y de Sofía, y derivadas a un asesor, de hoy, del mes y total; más un gráfico de mensajes por día de los últimos 30 días.

El bot informa su estado cada minuto (`POST /api/bot/estado`); el recuento sale de las charlas de Sofía que ya se guardan. Con la PC servidor apagada, el CRM en solo lectura muestra lo último que se supo como "sin señal del bot".

## Paso a paso en la PC servidor

### 1. Servidor (Neifert WhatsApp)

1. Abrí el archivo de configuración que usa la app (el `configuracion.env`) y agregá o completá estas líneas:
   ```
   WA_BOT_SECRETO=<el secreto>
   ```
   Para los respaldos de mensajes tienen que estar completos `WA_BACKUP_CLAVE` y los datos de R2. Ya deberían estar.
2. Ícono de Neifert WhatsApp → **Cambiar configuración…** → elegí ese archivo. El servidor se reinicia solo.
3. Comprobá en el navegador de esa PC: `http://localhost:3100/api/salud` tiene que responder `{"ok":true,...}`.

### 2. Bot (BOT WhatsApp)

1. Instalá el bot:
   https://github.com/JereMicheloud/BOT-Releases/releases/latest/download/BOT-WhatsApp-Setup.exe

   Si Windows muestra un aviso: *Más información → Ejecutar de todas formas*.
2. Entrá con la cuenta. Tiene que tener un plan con **IA**.
3. Pestaña **Asistente IA**:
   1. **Número:** *Vincular otro número* → escaneá el QR con el **celular de Sofía**. Conviene que sea un número propio: WhatsApp deja vincular el bot al mismo número que el servidor (son dos dispositivos distintos), pero hoy en el CRM cada mensaje de Sofía se vería dos veces.
   2. **Negocio:** nombre "Neifert Automotores", rubro "concesionaria", tono, e información útil: horarios, dirección, formas de pago, si toman usados, etc. El catálogo de autos no hace falta cargarlo: lo trae solo del CRM.
   3. **Firma:** `Sofía · asistente virtual`. Cada respuesta sale con esa firma.
   4. **Horario de atención:** activalo con los días y horas en que atienden personas. Sofía contesta solo **fuera** de ese horario. **Al empezar el horario de atención, las charlas que venía atendiendo se cierran y se derivan a una persona**: el cliente recibe el mensaje de derivación, el CRM una tarea "Responder a …" y el cierre en la charla (recuadro violeta), y los números del negocio un aviso. Dentro del horario no contesta nada; la próxima vez que escriban fuera de horario arranca una charla nueva.
   5. **CRM:**
      - URL: `http://localhost:3100/api/bot`
      - Secreto: el mismo `WA_BOT_SECRETO`
      - Tocá **Probar conexión**: tiene que decir OK.
   6. **Responder a:** dejá *Todos*. Si hay números a los que Sofía no tiene que contestar (los empleados, por ejemplo), usá *Todos menos estos*, con un número por línea.
   7. **Pausa si contestás vos:** dejala activada (2 h). Si alguien contesta a mano desde el celular de Sofía, ella no se mete en ese chat durante ese tiempo.
   8. Si todo está bien, activá el asistente.

### 3. Opcional, en el WhatsApp del CRM

- **Conexión → Preferencias → "Cargar en el CRM a quien escribe por primera vez":** crea el cliente solo para cualquier número nuevo que le escriba a la línea de la concesionaria. Viene apagado.
- **Conexión → Respaldo de mensajes:** tocá **Respaldar ahora** una vez para ver que diga "Verificado ✓".

---

## Cómo probar que anda

1. Fuera del horario configurado, escribile desde otro celular al número de Sofía: "Hola, ¿tienen algún Gol?".
2. Tiene que contestar con la firma y con datos reales del catálogo.
3. En el CRM → WhatsApp, el chat de ese número tiene que aparecer arriba, con la marca 🤖 Sofía y la charla en el recuadro.
4. En el CRM → Clientes tiene que estar el cliente, con el seguimiento "▶ Sofía inició la conversación".
5. Pedile algo que no sepa, por ejemplo "quiero hablar con alguien". Tiene que derivar, y en el CRM aparece una tarea "Responder a …".

## Si algo falla

| Qué pasa | Qué revisar |
|---|---|
| "Probar conexión" da error | El servidor no está andando (`http://localhost:3100/api/salud`), o el secreto no es el mismo en los dos lados, o falta reiniciar el servidor después de cambiar el `.env`. |
| Sofía no contesta | Está dentro del horario de atención, el asistente no está activado, la cuenta no tiene plan con IA, o el número de Sofía se desvinculó (volver a escanear el QR). |
| Contesta pero no aparece en el CRM | Revisar la actividad del asistente en el bot: los errores del CRM quedan anotados ahí. Lo que no se pudo mandar se reintenta cada 2 minutos mientras el bot esté abierto. |
| Llegó la alerta "Respaldo de WhatsApp atrasado" | Ícono del servidor → Ver registros, y en el CRM → WhatsApp → Conexión → Respaldo de mensajes. |

## Reglas

- **Sofía con su propio número** (recomendado; ver el paso 1 del bot). Lo que nunca se puede es tener dos servidores de WhatsApp con el mismo número, ni copiar la carpeta de la sesión a otra PC: se desconectan entre sí (error 440).
- El secreto no se comparte por chat. Si se filtra, generá otro y cambialo en los dos lados.
- La PC servidor no se suspende ni se apaga (ver `ESCRITORIO.md`).
