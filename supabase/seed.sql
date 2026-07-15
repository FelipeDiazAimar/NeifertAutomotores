-- ============================================================================
--  NEIFERT AUTOMOTORES — Datos de ejemplo
--  Ejecutar DESPUÉS de schema.sql.
--  (Re-ejecutable: limpia las tablas antes de insertar.)
--
--  A propósito NO se cargan `vehiculos` ni `perfiles` acá: los vehículos
--  llegan sincronizados desde el CRM viejo (/admin/catalogo -> Sincronizar
--  con CRM) y los perfiles se crean solos al iniciar sesión (puente de login
--  con el CRM viejo). Esto es solo contenido de muestra para ver el panel
--  poblado (prospectos, historias del home, tráfico).
-- ============================================================================

truncate table public.prospectos, public.historias, public.trafico_diario;

-- ----------------------------------------------------------------------------
--  HISTORIAS (Home)
-- ----------------------------------------------------------------------------
insert into public.historias (tipo, titulo, leyenda, duracion, imagen_poster, cita, autor_nombre, autor_rol, orden)
values
  ('video','El Arte de la Conducción','Entrega a Mariana de su Porsche','0:45',
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=900&q=80',
    null,null,null,1),
  ('testimonial',null,null,null,null,
    'El trato fue impecable y encontré exactamente el coche que soñaba.','Mariana López','Compradora',2),
  ('video','Ingeniería de Precisión','Entrega a Javier de su Audi','1:20',
    'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=900&q=80',
    null,null,null,3),
  ('testimonial',null,null,null,null,
    'Servicio profesional y entrega puntual; superaron mis expectativas.','Javier Morales','Empresario',4),
  ('testimonial',null,null,null,null,
    'Calidad y atención al detalle en cada paso del proceso.','Ana Ruiz','Arquitecta',5),
  ('video','Experiencia Electrificada','Entrega a Diego de su Audi e-tron','2:15',
    'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=900&q=80',
    null,null,null,6),
  ('testimonial',null,null,null,null,
    'Recomiendo Neifert por su asesoramiento personalizado.','Diego Fernández','Ingeniero',7);

-- ----------------------------------------------------------------------------
--  PROSPECTOS (mini-CRM)
-- ----------------------------------------------------------------------------
insert into public.prospectos (nombre_completo, telefono, email, vehiculo_interes, origen, estado, notas, ultimo_contacto_en)
values
  ('Roberto Sánchez','+54 9 11 2345 6789','roberto.sanchez@email.com','BMW M3 Competition','Instagram','nuevo','Consultó por financiación.', now() - interval '1 hour'),
  ('María Eugenia Ferreyra','+54 9 11 3456 7890','m.ferreyra@email.com','Porsche Macan S','Web','seguimiento','Pidió test drive para el sábado.', now() - interval '2 hours'),
  ('Lucas Giardinelli','+54 9 11 4567 8901','lucas.g@email.com','Audi Q5 Quattro','Showroom','seguimiento','Interesado en permuta.', now() - interval '1 day'),
  ('Sofía Martínez','+54 9 11 5678 9012','sofia.m@email.com','Mercedes-Benz C300','Referido','cerrado','Operación cerrada. Entrega coordinada.', now() - interval '1 day'),
  ('Alejandro Rossi','+54 9 11 6789 0123','a.rossi@email.com','Audi RS6 Avant Performance','WhatsApp','nuevo','Pendiente de cita.', now() - interval '10 minutes'),
  ('Martina Valenzuela','+54 9 11 7890 1234','martina.v@email.com','Porsche 911 GT3 RS','Instagram','vip','Cliente VIP. Calificada.', now() - interval '45 minutes'),
  ('Roberto Gómez','+54 9 11 8901 2345','r.gomez@email.com','Mercedes-Benz G63 AMG','Showroom','negociacion','En negociación de precio.', now() - interval '2 hours'),
  ('Sofía Méndez','+54 9 11 9012 3456','sofia.mendez@email.com','Ferrari 296 GTB','Web','primer_contacto','Primer contacto vía formulario web.', now() - interval '3 hours');

-- ----------------------------------------------------------------------------
--  TRÁFICO DIARIO (últimos 6 días)
-- ----------------------------------------------------------------------------
insert into public.trafico_diario (dia, web, salon) values
  (current_date - 5, 320, 90),
  (current_date - 4, 280, 410),
  (current_date - 3, 300, 250),
  (current_date - 2, 360, 300),
  (current_date - 1, 420, 360),
  (current_date - 0, 250, 180);
