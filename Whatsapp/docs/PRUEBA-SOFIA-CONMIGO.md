# Probar a Sofía con tu propio número (escribiéndote a vos mismo)

Esta guía arma una prueba real: tu número de WhatsApp pasa a ser la línea de Sofía y le escribís desde el chat
**"Mensaje para vos"** (el chat con tu propio número). Sofía le contesta a ese chat con la IA de verdad (Gemini).

> **Ojo:** al vincular tu número, Sofía recibe TODO lo que te escriba cualquiera. Por eso el paso 4 la limita a **un solo
> contacto: vos**. No la prendas sin ese paso.

## Qué toca (y qué no)
- **Local, no toca producción:** BOT IA, el servidor de licencias (base en memoria) y el servidor de WhatsApp de la PC.
- **Sí toca el CRM real** (el del `.env`): el catálogo y los datos del negocio se **leen**, y las charlas de la prueba
  **escriben**: tu número queda cargado como cliente, con seguimientos y tareas "Responder a …". Se borran a mano desde el CRM
  (cliente de tu número y sus tareas) cuando termines.
- Tu WhatsApp queda con un **dispositivo vinculado** más: se saca desde el celular (Ajustes → Dispositivos vinculados).

## 1. Levantar los servidores
```
powershell -ExecutionPolicy Bypass -File Whatsapp\servidor\scripts\probar-sofia-local.ps1
```
Abre 3 ventanas (BOT IA, licencias y servidor de WhatsApp) y muestra la dirección y el secreto del CRM del bot.
La primera vez crea `Whatsapp/servidor/.env` (con el secreto del bot).

## 2. La app del bot
```
cd BOT-WhatsApp\bot-wsp
npm install              # una sola vez (baja Electron)
$env:WSPBOT_PROBAR_CONMIGO = '1'
npm start
```
`WSPBOT_PROBAR_CONMIGO=1` es lo que deja que Sofía conteste a los mensajes que te escribís a vos mismo (sin eso los ignora).
La cuenta se crea en la web de licencias: http://localhost:5173 (si hace falta un admin: `npm run crear-admin` en
`BOT-Pagos\bot-pagos`, ver el LEEME de los `.env`).

## 3. Vincular tu número
Pestaña **Asistente IA → Número → Vincular otro número** (propio). Aparece un QR: en el celular, WhatsApp →
Ajustes → **Dispositivos vinculados → Vincular un dispositivo**, y escaneás. La pestaña pasa a "Conectado".

## 4. Configurar (antes de prender)
- **Negocio:** Neifert Automotores · **Firma:** `Sofía · asistente virtual` · tono a gusto.
- **Responder a → Solo a los marcados → agregá `+5493564690844`** (tu número). *Este paso es el que te protege.*
- **Horario de atención:** apagado para probar ahora (Sofía contesta solo fuera del horario).
- **CRM:** dirección `http://localhost:3100/api/bot` y el secreto que mostró el script → **Probar conexión** tiene que decir OK.
- Cargá antes, en la web (Admin → Contenido → Redes y contacto → *Información para el asistente*), la financiación y la
  toma de usados: sin eso Sofía dice que no tiene el dato.
- Recién ahora: **prender el asistente**.

## 5. Qué probar (desde "Mensaje para vos")
| Escribí | Tiene que pasar |
|---|---|
| `Hola` | Te saluda, firmado "Sofía · asistente virtual". |
| `¿Qué pickups usadas tienen?` | Consulta el catálogo con filtro (pickup + usado) y lista las de verdad. |
| `¿Tienen algún 0 km?` | Solo 0 km. |
| `Busco algo por menos de 15 mil dólares` | Solo autos de ese precio. |
| `¿Hasta qué hora atienden y dónde están?` | Horarios y dirección de la web. |
| `¿Financian?` / `¿Toman mi usado?` | Lo que cargaste en el Admin. |
| `Quiero hablar con una persona` | Mensaje de derivación; en el CRM, tarea "Responder a …" y la charla termina en violeta. |

## 6. Cierre al empezar el horario de atención
Con una charla abierta (acabás de hablar con Sofía), en la pestaña **activá el Horario de atención con todos los días y
desde = hasta** (todo el día). En menos de un minuto la charla se cierra: te llega el mensaje de derivación, el CRM
recibe la tarea y el seguimiento, y Sofía ya no contesta. Desactivalo para seguir probando.

## 7. Ver el estado
Panel del WhatsApp en http://localhost:3100 (entrá con tu usuario del CRM) → **Conexión → Sofía (asistente con IA)**:
conexión, **número de Sofía**, uso del cupo y el recuento de clientes, mensajes y caracteres. El bot informa cada minuto.

## Si algo falla
| Pasa | Causa probable |
|---|---|
| Sofía no contesta a tus mensajes | Falta `WSPBOT_PROBAR_CONMIGO=1`, el asistente está apagado, tu número no está en "Solo a los marcados", o estás dentro del horario de atención activado. |
| "Sofía no puede atenderte en este momento…" | La IA falló: la clave de Gemini está en la cuenta gratuita (15 pedidos por minuto), esperá un minuto. |
| El panel dice "Sin señal del bot" | La app del bot cerrada, o sin CRM configurado en la pestaña. |
| "Probar conexión" falla | El servidor de WhatsApp (puerto 3100) no está andando o el secreto no coincide. |

Para terminar: cerrá la app del bot y las 3 ventanas, y quitá el dispositivo vinculado desde el celular.
