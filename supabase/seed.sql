-- ============================================================================
--  NEIFERT AUTOMOTORES — Datos de ejemplo
--  Ejecutar DESPUÉS de schema.sql. Espeja los mockups.
--  (Re-ejecutable: limpia las tablas de catálogo/leads antes de insertar.)
-- ============================================================================

truncate table public.leads, public.vehicles, public.stories, public.daily_traffic;

-- ----------------------------------------------------------------------------
--  VEHÍCULOS
-- ----------------------------------------------------------------------------
insert into public.vehicles
  (brand, model, year, price_usd, km, fuel_type, transmission, engine, category, is_premium, main_image_url, description)
values
  ('Audi','RS e-tron GT',2024,185000,0,'Eléctrico','Automática','Dual Motor','electrico',true,
    'https://images.unsplash.com/photo-1610768764270-790fbec18178?auto=format&fit=crop&w=800&q=80',
    'Gran turismo eléctrico de alto rendimiento. 0 km, listo para entrega.'),
  ('Porsche','911 Carrera S',2023,245000,1200,'Nafta','PDK','3.0L Flat-6','sport',true,
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80',
    'Ícono deportivo con caja PDK. Estado impecable.'),
  ('BMW','X5 M Competition',2024,165000,0,'Nafta','M Steptronic','4.4L V8 Biturbo','suv',true,
    'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=800&q=80',
    'SUV de altas prestaciones. Unidad 0 km.'),
  ('Mercedes-Benz','G 63 AMG',2022,310000,5400,'Nafta','AMG Speedshift','4.0L V8 Biturbo','suv',true,
    'https://images.unsplash.com/photo-1520031441872-265e4ff70366?auto=format&fit=crop&w=800&q=80',
    'El SUV de lujo más deseado. Excelente estado.'),
  ('Land Rover','Range Rover Sport',2024,198000,0,'Híbrido','Automática','3.0L i6 MHEV','suv',true,
    'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=800&q=80',
    'Lujo británico híbrido. Unidad nueva.'),
  ('Ferrari','Roma',2023,420000,800,'Nafta','F1 Dual-Clutch','3.9L V8 Turbo','coupe',true,
    'https://images.unsplash.com/photo-1592198084033-aade902d1aae?auto=format&fit=crop&w=800&q=80',
    'La Nuova Dolce Vita. Estado de colección.'),
  ('Maserati','Grecale Trofeo',2024,145000,0,'Nafta','Automática','3.0L V6 Nettuno','suv',true,
    'https://images.unsplash.com/photo-1617469767053-d3b523a0b982?auto=format&fit=crop&w=800&q=80',
    'SUV italiano con motor Nettuno. 0 km.'),
  ('Tesla','Model S Plaid',2023,115000,2100,'Eléctrico','Automática','Tri Motor','electrico',true,
    'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=800&q=80',
    'Berlina eléctrica de máxima performance.'),
  ('BMW','M4 Competition',2024,145000,0,'Nafta','M Steptronic','3.0L Twin-Turbo','coupe',true,
    'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=800&q=80',
    'Coupé deportivo 0 km. Entrega inmediata.'),
  ('Audi','RS6 Avant Performance',2023,178000,3200,'Nafta','Tiptronic','4.0L V8 TFSI','sport',true,
    'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=80',
    'La familiar más rápida. Performance pack.');

-- ----------------------------------------------------------------------------
--  HISTORIAS (Home)
-- ----------------------------------------------------------------------------
insert into public.stories (kind, title, caption, duration, poster_url, quote, author_name, author_role, order_index)
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
--  LEADS (CRM)
-- ----------------------------------------------------------------------------
insert into public.leads (full_name, phone, email, vehicle_interest, source, status, notes, last_contact_at)
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
insert into public.daily_traffic (day, web, showroom) values
  (current_date - 5, 320, 90),
  (current_date - 4, 280, 410),
  (current_date - 3, 300, 250),
  (current_date - 2, 360, 300),
  (current_date - 1, 420, 360),
  (current_date - 0, 250, 180);

-- ----------------------------------------------------------------------------
--  ADMIN: después de registrarte en la app (Sign up), podés renombrar tu perfil:
--    update public.profiles set full_name = 'Marcos Neifert', role = 'Gerente de Ventas'
--    where id = (select id from auth.users order by created_at limit 1);
-- ----------------------------------------------------------------------------
