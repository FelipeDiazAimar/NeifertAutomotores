# Arquitectura y Funcionamiento de Baileys (WhatsApp Web Protocol)

> **Documento de referencia técnica y arquitectura**  
> Proyecto: **Neifert Automotores** — Módulo de WhatsApp CRM  
> Ubicación: `Whatsapp/docs/Baileys.md`  
> Fecha: Septiembre 2026 · actualizado en octubre 2026 (secciones 4 a 8: estado real)

---

## 1. Baileys no es una API REST: Es una Conexión WebSocket

Existe una confusión común al pensar en Baileys como una "API REST externa" (similar a Stripe, Twilio o MercadoPago) donde cada mensaje dispararía un request HTTP aislado. **No funciona así.**

WhatsApp no provee una API HTTP pública para cuentas estándar de WhatsApp Web. Baileys es una implementación completa en Node.js del **protocolo interno de WhatsApp Web (Companion Device)** mediante WebSockets y criptografía de extremo a extremo.

```
┌─────────────────────────┐               WebSocket Permanente               ┌────────────────────────┐
│  Servidor Node.js       │ ◄──────────────────────────────────────────────► │ Servidores de WhatsApp │
│  (Baileys v7)           │       wss://web.whatsapp.com/ws/chat             │ (Meta / WhatsApp Web)  │
│  Dispositivo Vinculado  │         Keep-Alive cada 30 segundos              │                        │
└─────────────────────────┘                                                  └────────────────────────┘
```

### 1.1. Cómo funciona la conexión bajo el capó
- **Una única conexión persistente:** Al iniciar (`whatsapp.js: iniciar()`), Baileys abre un único socket a `wss://web.whatsapp.com/ws/chat`. La conexión se mantiene viva 24/7 mediante frames de *keep-alive* (ping/pong) cada 30 segundos.
- **Handshake Noise Protocol:** La autenticación y el canal seguro inicial se negocian utilizando el protocolo criptográfico *Noise* con las llaves guardadas en `data/sesion/` (`useMultiFileAuthState`).
- **Recepción de mensajes (Push en tiempo real):**  
  No hay polling ni peticiones periódicas. Cuando alguien envía un mensaje al número de WhatsApp, el servidor de WhatsApp empuja un frame binario directamente por el WebSocket abierto. Baileys lo descifra localmente y emite el evento interno `messages.upsert`.
- **Envío de mensajes (`sendMessage`):**  
  Para enviar un mensaje:
  1. Baileys cifra el contenido usando el **Signal Protocol** (Double Ratchet Algorithm).
  2. Debido a la arquitectura multi-dispositivo de WhatsApp, **cifra una copia independiente para cada uno de los dispositivos vinculados del destinatario** y para los propios dispositivos de la cuenta.
  3. Escribe un frame binario en el WebSocket y queda a la espera del `ACK` (acuse de recibo del servidor).

### 1.2. Por qué existe una latencia de ~1 segundo al enviar (y la solución)
El retardo de aproximadamente 1 segundo que se observa al despachar un mensaje **no es lentitud del servidor ni de la red local**:
- Es el tiempo matemático requerido para:
  1. Cifrar con Signal Protocol para N llaves públicas de dispositivos.
  2. El viaje de ida hacia los servidores de WhatsApp vía WebSocket.
  3. El procesamiento y confirmación (ACK) de WhatsApp.

> **Regla de UX — La Burbuja Optimista:**  
> Este segundo no se puede reducir mediante optimizaciones de código porque depende de la criptografía y del protocolo de WhatsApp.  
> Por este motivo, la interfaz no debe esperar a que el servidor responda para mostrar el mensaje. La solución estándar es **mostrar la burbuja en la UI de inmediato en estado "pendiente"** (ícono de reloj) y actualizarla a "enviado" (un tilde gris) cuando el WebSocket confirme el ACK.

---

## 2. Supabase: Cuello de Botella Real vs. Límites Teóricos

A menudo se asume que los límites de mensajes por segundo de una base de datos o servicio en la nube (como Supabase) serán un problema para el chat. Los números reales demuestran lo contrario:

### 2.1. Límites de Supabase Realtime
| Plan | Conexiones concurrentes | Mensajes por segundo | Channel joins por segundo |
|---|---|---|---|
| **Free** | 200 | 100 / seg | 100 / seg |
| **Pro** | 500 | 500 / seg | 500 / seg |
| **Team** | 10.000 | 2.500 / seg | 2.500 / seg |

### 2.2. Métricas y volumen real de Neifert Automotores
- **Volumen anual analizado:** ~22.064 mensajes en el último año.
- **Promedio diario:** ~60 mensajes por día.
- **Tasa de tráfico real:** **~0,0007 mensajes por segundo**.
- **Margen frente al plan Free:** El plan gratuito tolera 100 msgs/segundo; Neifert opera a 0,0007 msgs/segundo (**un margen de 140.000 veces**). Incluso con un crecimiento de 100x del negocio, el límite ni se roza.
- **Tamaño del historial textual:** 22.000 mensajes × ~450 bytes ≈ **10 MB anuales** (el plan Free de Supabase otorga 500 MB de base de datos relacional).

### 2.3. Dónde está el VERDADERO cuello de botella: La sincronización inicial
El riesgo real no está en la operación cotidiana, sino en el evento de **sincronización inicial del historial (`messaging-history.set`)**:
- Al vincular la sesión por primera vez, WhatsApp empuja de golpe decenas de miles de mensajes históricos.
- **El error clásico:** Hacer un `INSERT` HTTP individual a la API PostgREST de Supabase por cada mensaje recibido:  
  $$22.000 \text{ round-trips} \times 50\text{ ms} \approx 18 \text{ minutos de bloqueo}$$
  Esto satura el pool de conexiones de Node.js y agota los límites de peticiones HTTP.
- **La solución correcta:** **Inserción en lotes (Batch Inserts)**.  
  Agrupar los mensajes históricos en bloques de 500 filas por request reduce las 22.000 peticiones a solo ~44 requests HTTP, completando la sincronización en cuestión de segundos.

### 2.4. Manejo de multimedia (Fotos, Videos, Audios, Documentos)
Los archivos binarios **NUNCA** deben guardarse dentro de la base de datos relacional (ni como base64 ni como bytea):
- Se almacenan en buckets de objetos: **Cloudflare R2** (sin costos de egreso) o **Supabase Storage**.
- La base de datos relacional únicamente conserva la metadata:
  ```json
  {
    "id": "3EB0...",
    "chat_id": "5493564...@s.whatsapp.net",
    "tipo": "imagen",
    "archivo": "media/Juan Pérez (+5493564...)/3EB0....jpg",
    "tamano": 1048576,
    "mime": "image/jpeg"
  }
  ```

---

## 3. Varias PC con el Mismo Número: Arquitectura y Restricciones

### 3.1. Restricciones duras del protocolo WhatsApp
1. **Límite de 4 dispositivos vinculados:**  
   WhatsApp solo permite vincular un máximo de 4 dispositivos acompañantes (*companion devices*) por número telefónico. Cada instancia independiente de Baileys consume 1 slot completo de esos 4.
2. **Conflicto de sesión (Error 440 `connectionReplaced`):**  
   Si dos procesos de Node intentan conectarse usando la misma carpeta de credenciales (`data/sesion/`), los servidores de WhatsApp detectan la colisión y desconectan de inmediato a una de las instancias con el error `440 connectionReplaced`.
3. **La regla de los 14 días:**  
   El teléfono celular principal **debe abrir WhatsApp al menos una vez cada 14 días con conexión a internet**. Si transcurren 14 días sin actividad en el teléfono móvil, WhatsApp desvincula automáticamente por seguridad a todos los dispositivos vinculados. Esto es crítico para servidores desatendidos 24/7.

### 3.2. Por qué no se debe instalar Baileys en cada PC
Instalar Baileys de forma independiente en 3 computadoras de los empleados causaría los siguientes problemas:
- Se agotarían 3 de los 4 slots de vinculación disponibles en la cuenta.
- Cada PC tendría su propio historial local desincronizado.
- Si el empleado A lee un mensaje, en las computadoras de B y C seguiría apareciendo como no leído.
- Se multiplicarían por 3 los riesgos de baneo y consumo de recursos.

### 3.3. Arquitectura correcta: Un solo Baileys + Clientes vía SSE

La arquitectura adecuada consiste en **un único servicio central de Node.js con Baileys** y N navegadores de empleados conectados al panel:

```
                    ┌────────────────────────┐
                    │  Celular del Negocio   │
                    │   (Teléfono Maestro)   │
                    └───────────┬────────────┘
                                │ Vinculación QR (1 de 4 slots)
                                ▼
                    ┌────────────────────────┐
                    │ Servidor Node.js       │
                    │ • Baileys (1 conexión) │
                    │ • almacen.js (datos)   │
                    │ • eventos.js (SSE)     │
                    └───────────┬────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │ EventStream (SSE)   │ EventStream (SSE)   │ EventStream (SSE)
          ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Navegador Web    │  │ Navegador Web    │  │ Navegador Web    │
│ Empleado 1       │  │ Empleado 2       │  │ Empleado 3       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Ventajas ya operativas en el servidor actual:**
- El archivo `eventos.js` implementa un canal de **Server-Sent Events (SSE)** con `emitir(evento, datos)` transmitiendo en broadcast a todos los navegadores conectados.
- Cuando el Empleado 1 envía un mensaje o ingresa un mensaje de un cliente, el servidor lo procesa una sola vez y lo despacha instantáneamente por SSE a todos los empleados conectados.

---

## 4. Estado actual del servicio (octubre 2026)

Lo que en la primera versión de este documento eran "requisitos" ya está hecho. El detalle
de cada punto está en [SERVIDOR.md](SERVIDOR.md) y la operación diaria en
[OPERACION.md](OPERACION.md).

| Tema | Cómo quedó |
|---|---|
| Acceso y login | Se entra desde el CRM: el panel está embebido y recibe la sesión por `postMessage` (origen validado). Cookie firmada, HttpOnly, `Partitioned` por https. |
| Permisos | Por rol del CRM: `WHATSAPP_ROLES_LINEA` (QR, vincular, desvincular, preferencias), `WHATSAPP_ROLES` (escribir), `WHATSAPP_ROLES_LECTURA` (solo mirar). |
| Auditoría | Toda acción que cambia algo queda en `wa.auditoria` (quién, qué, cuándo, chat, IP). Nunca el contenido de los mensajes. |
| Autoría interna | Cada mensaje mandado desde el panel guarda `enviadoPor` (usuario del CRM). |
| "Escribiendo…" entre operadores | Por SSE: el panel muestra quién está viendo/escribiendo cada chat. |
| Persistencia | Supabase (`wa.*`) con escritura por tandas + **diario local** (write-ahead) con `fdatasync`: un corte de luz no pierde mensajes. |
| Multimedia | Bucket R2 **privado** (`neifert-whatsapp`), carpeta por contacto, miniaturas, servido solo a usuarios con sesión. |
| Retención | 365 días, purga diaria (mensajes + archivos) y conciliación R2 ↔ base. |
| Envíos sin conexión | Bandeja de salida persistente: lo que se manda con la línea caída sale solo al reconectar. |
| Grupos | Menciones, avisos de altas/bajas, reacciones por persona, "Fulano está escribiendo…". |
| CRM | Cada chat reconoce su cliente por teléfono normalizado; crear cliente, seguimiento y tarea desde el chat. |
| Respaldo | Sesión y `.env` cifrados (AES-256-GCM) en R2; restauración en una PC nueva **sin volver a escanear el QR**. |
| Monitoreo | `/api/salud`, logs diarios con rotación, alertas por email/webhook (línea caída, celular sin señal, sesión cerrada), vigía externo del Programador de tareas. |

## 5. Versión del protocolo y actualizaciones de Baileys

- **Baileys fijo en `7.0.0-rc14`** (`package.json` sin `^`). Una actualización se hace a
  mano, probando primero en una instancia aislada (ver SERVIDOR.md → "Modo local").
- **Versión de WhatsApp Web fija** con `WA_VERSION` (por ejemplo `2.3000.1027934701`).
  Vacía: se usa la que trae Baileys. Si WhatsApp la rechaza por vieja (cierre **405**), el
  servidor consulta la vigente, la usa, la guarda en `meta.versionWa` y **avisa** para que
  se actualice `WA_VERSION` a conciencia.
- Navegador declarado: `Browsers.windows('Chrome')` con `syncFullHistory`. (Con
  `'Desktop'` WhatsApp devolvía 428 y no generaba QR.)
- **Códigos de cierre que se manejan** (`src/whatsapp.js`):

| Código | Qué significa | Qué hace el servidor |
|---|---|---|
| 401 `loggedOut` | Se desvinculó desde el celular | Borra la sesión, muestra QR nuevo y **alerta** (salvo que se haya desvinculado desde el panel). |
| 403 | Cuenta restringida/bloqueada | Espera 30 min antes de reintentar y **alerta**: puede ser el inicio de un baneo. |
| 405 | Versión de protocolo rechazada | Consulta la versión vigente y reintenta (ver arriba). |
| 408 / 428 | Tiempo agotado / conexión cerrada | Reintento con espera creciente. |
| 440 `connectionReplaced` | Otra instancia usa la misma sesión | Reintenta a los 5 y 30 min y **alerta**: hay dos servidores con la misma carpeta `sesion/`. |
| 500 `badSession` | Sesión dañada | Reintento con espera; a la 3ª vez **alerta** (restaurar el respaldo de la sesión). |
| 515 `restartRequired` | Normal tras vincular | Reconecta de inmediato. |

- **Al despertar la PC** (suspensión/hibernación, detectado por un salto de reloj > 90 s)
  se fuerza la reconexión en vez de esperar al keep-alive.

## 6. Riesgo de baneo y Plan B

El plan concreto (qué evitar, señales de alerta, qué hacer si llega un 403 y la migración
a la API oficial con costos de referencia) está en
[OPERACION.md → Riesgo de baneo y Plan B](OPERACION.md#10-riesgo-de-baneo-y-plan-b).

## 7. Despliegue: PC titular en la concesionaria

Decidido: **una PC de la concesionaria encendida 24/7** corre el servicio (Programador de
tareas de Windows, arranca solo con el equipo). No hace falta Vercel ni un VPS: la base y
los archivos ya están en la nube (Supabase + R2) y el acceso desde fuera de la oficina se
publica con **Cloudflare Tunnel** (https, sin abrir puertos del router).

| Riesgo | Mitigación |
|---|---|
| Se corta la luz / se apaga la PC | Arranca solo al volver; lo pendiente se recupera del diario local; los mensajes que llegaron mientras tanto los reenvía WhatsApp al reconectar. UPS recomendada. |
| Se rompe la PC | Restaurar el respaldo cifrado en otra PC (sin QR). Ver OPERACION.md. |
| Regla de los 14 días | El servidor avisa si el celular no da señales en `WA_ALERTA_CELULAR_DIAS` (10 por defecto). |
| Windows Update reinicia | La tarea arranca con el equipo, sin sesión iniciada. |

## 8. Mapeo de componentes del servidor (`Whatsapp/servidor/`)

| Archivo | Responsabilidad |
|---|---|
| `index.js` | API HTTP (Express 5), permisos por ruta, auditoría de acciones, arranque y apagado ordenado, purga diaria. |
| `src/config.js` | Variables de entorno (lee el número de la línea en vivo del `.env`). |
| `src/whatsapp.js` | Conexión Baileys, ciclo de vida y códigos de cierre, mensajes, grupos, bandeja de salida, descargas, conciliación R2. |
| `src/almacen.js` | Estado y mensajes en memoria; persistencia local o en Supabase; páginas, búsqueda, carpetas por contacto, ventana de 365 días. |
| `src/nube.js` | Escritura por tandas a Supabase (`wa.*`) con el diario local como red de seguridad. |
| `src/diario.js` | Diario local (write-ahead): lo anotado antes de la tanda se recupera si el proceso muere. |
| `src/archivos.js` | Archivos en R2 o disco: guardar, servir con Range, listar, mover prefijos con verificación. |
| `src/auth.js` | Login con el CRM, cookie firmada, permisos por rol, protección CSRF. |
| `src/auditoria.js` | Registro de quién hizo qué (`wa.auditoria`, con respaldo en archivo local). |
| `src/crm.js` | Cliente del CRM de cada chat; crear cliente, seguimiento y tarea. |
| `src/telefono.js` | Normalización de teléfonos argentinos (54 / 549 / 0 / 15). |
| `src/tipos.js` | Extensión ↔ MIME y categorías de archivos. |
| `src/audio.js` | ffmpeg: notas de voz OGG/Opus, forma de onda, miniaturas de fotos y videos. |
| `src/fotos.js` | Fotos de perfil (bajada diferida y reparación). |
| `src/respaldo.js` | Respaldo cifrado de la sesión y del `.env` en R2. |
| `src/vigia.js` | Alertas (email por Resend, webhook) y vigilancia de la conexión y del celular. |
| `src/eventos.js` | SSE hacia los navegadores y log diario con rotación. |
| `scripts/` | `respaldar`, `restaurar`, `subir-a-r2`, instalación del servicio de Windows y vigía externo. |
| `test/` | Tests de Vitest (`npm test` desde la raíz del repo). |
