# Privacidad y conservación de mensajes — WhatsApp de Neifert

Este documento define qué guarda el sistema de WhatsApp de la concesionaria, por cuánto
tiempo y qué pasa cuando alguien elimina o edita un mensaje. La parte técnica ya está
implementada y se controla con la configuración del servidor; la **definición** (la
sección 4) la tiene que aprobar y firmar la concesionaria.

---

## 1. Qué se guarda

| Qué | Dónde | Por cuánto |
|---|---|---|
| Mensajes de chats y grupos de la línea (texto, quién lo mandó, estado, respuestas, reacciones) | Supabase (proyecto "Whatsapp Neifert", esquema `wa`) | Últimos 365 días (`WA_VENTANA_DIAS`) |
| Fotos, videos, audios, stickers y documentos | Cloudflare R2, bucket **privado** | Igual que su mensaje |
| Fotos de perfil de los contactos | Cloudflare R2, bucket privado | Mientras exista el chat |
| Qué empleado mandó cada mensaje desde el panel | Junto al mensaje (`enviado_por`) | Igual que su mensaje |
| Registro de auditoría (entradas, envíos, cambios, intentos sin permiso, IP) | Supabase, `wa.auditoria` | Sin vencimiento (definir, ver 4.4) |
| Registro técnico del servidor | Disco de la PC titular (`data/logs`) | 30 días (`WA_LOG_DIAS`) |
| Llave de la sesión de WhatsApp | PC titular + respaldo **cifrado** en R2 | Mientras la línea esté vinculada |

Nada de esto es público: el bucket es privado, la base no es accesible desde el navegador
y el panel exige el usuario del CRM.

## 2. Lo que no se guarda nunca

- **Fotos, videos y audios "para ver una vez".** Quien los manda pidió que no queden: el
  sistema no los descarga ni guarda la llave para bajarlos. En el chat queda solo el
  aviso "Foto para ver una vez. Se abre solo en el celular".
- Mensajes de estados de WhatsApp, canales y Meta AI.
- Nada anterior a la ventana de días (lo más viejo que manda el historial se descarta).

## 3. Mensajes eliminados y editados (anti-borrado)

Cuando alguien (un cliente o la propia concesionaria) elimina un mensaje "para todos", o lo
edita, el sistema puede hacer dos cosas, según la configuración:

| | Encendido (por defecto) | Apagado |
|---|---|---|
| **Eliminado para todos** (`WA_CONSERVAR_ELIMINADOS`) | El mensaje queda en el respaldo, marcado "Se eliminó este mensaje". En el panel aparece tapado y se puede destapar ("Ver qué decía"). Su archivo se conserva. | Se borra el contenido (texto, archivo y datos para descargarlo); queda solo el aviso, como en el celular. |
| **Editado** (`WA_CONSERVAR_EDICIONES`) | Se guarda el texto nuevo y las versiones anteriores ("Ver versión anterior"). | Se guarda solo la última versión. |

El panel muestra la configuración vigente en **Conexión → Privacidad**.

---

## 4. Definición de la concesionaria (para completar y firmar)

> Completar marcando una opción en cada punto. El servidor se configura según lo que
> quede firmado (archivo `Whatsapp/servidor/.env`).

**4.1. Mensajes eliminados por un cliente o por la concesionaria**

- [ ] Se conservan en el respaldo, marcados como eliminados (`WA_CONSERVAR_ELIMINADOS=on`).
      Motivo: ________________________________________________
- [ ] Se borran también del respaldo (`WA_CONSERVAR_ELIMINADOS=off`).

**4.2. Mensajes editados**

- [ ] Se conservan las versiones anteriores (`WA_CONSERVAR_EDICIONES=on`).
- [ ] Solo la última versión (`WA_CONSERVAR_EDICIONES=off`).

**4.3. Plazo de conservación de mensajes y archivos:** ______ días (`WA_VENTANA_DIAS`, hoy 365).

**4.4. Plazo de conservación de la auditoría:** ______ (sin plazo / ___ años).

**4.5. Aviso a los clientes.** Se informa a los clientes que las conversaciones con la
concesionaria se registran y pueden ser vistas por el personal autorizado:

- [ ] En el mensaje de bienvenida / respuesta automática de WhatsApp Business.
- [ ] En la política de privacidad del sitio web (`/privacidad`).
- [ ] Otro: ________________________________________________

Texto sugerido para el aviso:

> "Neifert Automotores registra las conversaciones de este WhatsApp para atenderte mejor
> y dar seguimiento a tu consulta. Las conversaciones las ve solo el personal autorizado
> y se conservan por hasta 12 meses. Podés pedir el acceso o la eliminación de tus datos
> escribiendo a [correo]." (Ley 25.326 de Protección de Datos Personales)

**4.6. Quién puede ver y hacer qué** (roles del CRM; ver OPERACION.md §7):

- Entran y escriben: ______________________ (hoy admin, dueno, vendedor)
- Vinculan/desvinculan la línea y ven la auditoría: ______________________ (hoy admin, dueno)
- Solo lectura: ______________________ (hoy nadie)

&nbsp;

Aprobado por: ______________________________ Cargo: ______________________

Firma: ______________________________ Fecha: ____ / ____ / ________

---

## 5. Cómo verificarlo (punto 7 del checklist)

1. **Eliminar:** desde el celular de un cliente (o el propio), eliminar un mensaje para
   todos. En el panel: encendido → "Se eliminó este mensaje" + "Ver qué decía" muestra el
   original; apagado → solo el aviso, sin contenido.
2. **Editar:** editar un mensaje desde el celular. Encendido → "editado" + "Ver versión
   anterior"; apagado → solo el texto nuevo.
3. **Ver una vez:** mandar una foto "para ver una vez". En el panel queda el aviso y en R2
   no aparece ningún archivo nuevo en la carpeta del chat.
