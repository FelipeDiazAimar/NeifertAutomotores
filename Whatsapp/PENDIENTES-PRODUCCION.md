# WhatsApp de Neifert — qué falta para ponerlo en producción

**Estado al 05/10/2026.** El WhatsApp está terminado y probado. Lo que falta es configuración
y unos pocos pasos que dependen de cuentas (Vercel, DNS, Cloudflare) y de la PC que va a
ser el servidor.

## Cómo funciona (en 30 segundos)

- **Una PC de la concesionaria** tiene instalada la app `Neifert WhatsApp`. Esa PC es el
  servidor: mantiene la conexión con WhatsApp las 24 h. Se instala con un `.exe`, sin Git
  ni Node.
- **Los empleados** usan el WhatsApp **desde el CRM** (menú WhatsApp), en el navegador.
  No instalan nada.
- El CRM (Vercel) llega a esa PC por **`https://wa.neifertautomotores.com`**, con un
  **Cloudflare Tunnel** (sin abrir puertos del router).
- Mensajes en **Supabase** ("Whatsapp Neifert"), archivos en **Cloudflare R2**
  (bucket privado `neifert-whatsapp`). **Todo separado por número de línea**: se puede
  probar con un celular propio sin mezclar ni borrar nada de la concesionaria.

---

## 1. Lo que tiene que hacer quien maneja Vercel y el dominio

Son tres cosas. Ninguna toca el código.

### 1.1 Mergear la rama `whatsapp` a `main`

La rama agrega al CRM la página **WhatsApp** (menú lateral + ruta `/crm/whatsapp`).
Fuera de `Whatsapp/` solo toca: `AppSidebar.jsx`, `AppMobileSidebar.jsx`, `AppRouter.jsx`,
`src/crm/pages/WhatsappPage.jsx` (nueva), `eslint.config.js`, `vitest.config.js`,
`.env.example`, `.gitignore` y archivos `.sql` de `supabase/` (que son del proyecto
**Whatsapp Neifert**, no del CRM: ya están aplicados).

- Si se mergea antes de que el servidor esté listo, la página WhatsApp muestra
  "Falta configurar la dirección del servidor". No rompe nada más.
- `npm test`: 504 tests pasan. `npm run build`: OK. `npm run lint`: sin errores
  (quedan 21 advertencias, que no lo hacen fallar).
- La rama además corrige cosas que venían de `main`: los 21 errores de lint (`global` →
  `globalThis` en tests, `sw.js`, y `ImageCropper`, `VehicleCard` y
  `VehiculoFotoCarousel`, que actualizaban su estado dentro de un efecto) y el test de
  tareas que fallaba de 21 a 24 h por la zona horaria.

### 1.2 Variable de entorno en Vercel (proyecto del CRM)

```
VITE_WHATSAPP_PANEL_URL=https://wa.neifertautomotores.com
```

Settings → Environment Variables → Production → **Redeploy**. Sin esto el CRM no sabe
dónde está el WhatsApp.

### 1.3 Pasar el DNS de `neifertautomotores.com` a Cloudflare

Hoy los nameservers son de Vercel (`ns1/ns2.vercel-dns.com`). Para crear
`wa.neifertautomotores.com` con Cloudflare Tunnel, el dominio tiene que estar en la cuenta
de Cloudflare del WhatsApp. **La web sigue en Vercel igual**: solo cambia quién responde el
DNS.

1. Jeremías agrega el dominio en su Cloudflare (Add a domain → Free) y comparte los dos
   nameservers que le da Cloudflare (`xxxx.ns.cloudflare.com`).
2. **Antes de cambiar nada**, revisar en Cloudflare → DNS que se copiaron TODOS los
   registros actuales. Los que no pueden faltar:
   - los de **Vercel** (el `A`/`CNAME` del dominio y de `www`);
   - los de **Resend** (los mails del CRM): `resend._domainkey` (TXT) y `send`
     (MX a `feedback-smtp.us-east-1.amazonses.com` + su TXT de SPF);
   - cualquier otro `TXT` de verificación que haya.
3. Cambiar los nameservers donde está registrado el dominio (si se compró en Vercel:
   Vercel → Domains → el dominio → Nameservers). Tarda de minutos a unas horas.
4. Comprobar que la web y el CRM siguen andando, y que en Vercel → Domains el dominio
   sigue en verde.

> **Alternativa sin tocar el dominio:** un dominio aparte solo para el WhatsApp (~USD 10/año,
> por ejemplo `neifert-wa.com`) comprado directo en Cloudflare. En ese caso la variable del
> punto 1.2 apunta a `https://wa.<ese dominio>`.

### 1.4 (Opcional) La clave de Resend para las alertas

Para que el servidor mande mails si la línea se cae: la `RESEND_API_KEY` del CRM (está en
las variables de Vercel). Sin ella las alertas quedan solo en el registro y en avisos de
Windows en la PC servidor.

---

## 2. Lo que hace Jeremías (dueño de Supabase y Cloudflare del WhatsApp)

1. **Token de R2** (si todavía no está): Cloudflare → R2 → Manage API tokens → permiso
   *Object Read & Write* solo sobre `neifert-whatsapp`.
2. **Cloudflare Tunnel** (cuando el dominio esté en Cloudflare): Zero Trust → Networks →
   Tunnels → Create → Cloudflared → `neifert-whatsapp` → copiar solo el token →
   Public Hostname `wa.neifertautomotores.com` → `HTTP` `localhost:3100`.
3. **Clave de respaldo**: generar `WA_BACKUP_CLAVE` y guardarla en un gestor de contraseñas.
4. **Archivo de configuración**: copiar `Whatsapp/escritorio/configuracion.env.example`
   como `configuracion.env` y completarlo (cada línea dice de dónde sale cada valor).
   Pasarlo solo por gestor de contraseñas.
5. **Commit y push** de la rama `whatsapp` (lo de hoy está sin commitear) y PR a `main`.

---

## 3. La PC servidor (en la concesionaria)

1. Instalar `Neifert WhatsApp Setup 1.0.0.exe` (está en `Whatsapp/escritorio/dist/`).
   Windows avisa que no está firmado: *Más información → Ejecutar de todas formas*.
2. Elegir el `configuracion.env` → *Guardar y arrancar el servidor*.
3. Escribir el **número de la concesionaria**: característica sin 0 + número sin 15
   (10 dígitos, ej. `3492 123456`) → **Iniciar servidor** → escanear el QR con ese celular
   (y dejar WhatsApp abierto unos minutos para que mande el historial).
4. Para que vuelva sola después de un corte de luz:
   - Windows con **inicio de sesión automático** (`netplwiz`);
   - **no suspender** nunca enchufada (Configuración → Energía);
   - BIOS: *Restore on AC power loss → Power On* (si la placa lo tiene);
   - Windows Update con **horas activas** en el horario de atención.
5. Comprobar desde otra PC: `https://wa.neifertautomotores.com/api/salud` →
   `{"ok":true,...}` y que el WhatsApp ande desde el CRM.

**Reglas que no hay que romper:**
- **Nunca el mismo número en dos PC a la vez** (se desconectan entre sí).
- La PC de desarrollo prueba con **otro número** y sin `WA_BACKUP_CLAVE` ni `WA_TUNEL_TOKEN`.
- El celular de la concesionaria tiene que **abrir WhatsApp al menos cada 14 días**.

---

## 4. Antes de dar por terminado

- [ ] El dueño firma `Whatsapp/docs/PRIVACIDAD.md` (si se conservan los mensajes
      "eliminados para todos" y las ediciones) y se ajustan `WA_CONSERVAR_*`.
- [ ] Recorrer el checklist de aceptación (21 puntos) de `Whatsapp/docs/OPERACION.md` §11
      con la línea real: tildes de entregado/leído, grupo con mención, nota de voz, cortar
      internet 60 s, reiniciar la PC, etc.
- [ ] Publicar una versión y ver que la PC servidor se actualiza sola
      (`cd Whatsapp/escritorio && npm run publicar` → ícono → *Buscar actualización ahora*).
- [ ] Vercel: el plan **Hobby es solo para uso no comercial**; para la concesionaria
      corresponde el plan Pro (independiente del WhatsApp).

---

## 5. Revisión (05/10/2026)

| Qué | Estado |
|---|---|
| Servidor de WhatsApp | ✅ Funcionando con la línea de prueba (conectado, 287 chats, 23.337 mensajes) |
| Datos por número | ✅ Supabase (columna `linea`, migración v4 aplicada) y R2 (`lineas/<número>/`, 1.049 archivos movidos) |
| App de escritorio | ✅ Instalador armado; probado de punta a punta (15/15): número validado y guardado, QR, cambiar número, inicio con la PC |
| Actualizaciones sin reinstalar | ✅ `npm run publicar` → la PC servidor la baja sola; vuelve a la anterior si falla. Versión publicada: 20261005-0241 |
| Tope de espacio R2 | ✅ 9 GB (hoy 0,22 GB usados); al 85 % borra los archivos más viejos |
| Integración con el CRM | ✅ Cliente por teléfono, crear cliente, seguimiento y tarea desde el chat |
| Tests / lint / build | ✅ 504 tests (62 del servidor de WhatsApp); lint sin errores; build OK |
| Registros en la app | ✅ Ventana "Registros" con cada error explicado (qué pasó y qué hacer) |
| Número equivocado | ✅ Se rechaza en segundos con aviso claro y QR nuevo (antes quedaba "cargando" hasta un minuto) |
| Relojito al enviar | ✅ El tilde ya no se pierde si llega antes que el mensaje; al salir el envío pasa a ✓ |
| Instalador | ⚠️ Sin firma digital (aviso de SmartScreen la primera vez) |
| App instalada en la PC de Jeremías | ⚠️ Reinstalar con el `.exe` nuevo de `Whatsapp/escritorio/dist/` |

**Documentación completa:** `Whatsapp/docs/ESCRITORIO.md` (la app y el túnel),
`OPERACION.md` (operación, respaldo, alertas, costos, plan ante bloqueo, checklist),
`SERVIDOR.md` (cómo funciona por dentro), `PRIVACIDAD.md` (para firmar).
