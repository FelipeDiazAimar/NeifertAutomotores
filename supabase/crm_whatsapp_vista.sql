-- CRM — Vista "whatsapp"
-- Habilita el WhatsApp de la concesionaria en el menú del CRM para admin y dueño.
-- Para dárselo a otro rol o a un usuario puntual, marcalo desde Roles o Usuarios.
-- Idempotente: se puede correr más de una vez.

update crm.roles
   set vistas_default = vistas_default || array['whatsapp'],
       actualizado_en = now()
 where rol in ('admin', 'dueno')
   and not ('whatsapp' = any(vistas_default));
