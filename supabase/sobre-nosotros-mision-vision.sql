-- ============================================================================
--  NEIFERT AUTOMOTORES — Sección "Misión y Visión" de /sobre-nosotros
--
--  NO hace falta una tabla nueva: el contenido del sitio vive en
--  public.contenido_sitio (clave -> JSON) y "Sobre Nosotros" ya es la fila
--  clave = 'sobreNosotros'. Este script agrega/actualiza SOLO la clave
--  "misionVision" dentro de ese JSON — NO toca "items" (los bloques con
--  video) ni "heading". Es seguro re-ejecutarlo.
--
--  Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

create table if not exists public.contenido_sitio (
  clave          text primary key,
  valor          jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

insert into public.contenido_sitio (clave, valor)
values (
  'sobreNosotros',
  jsonb_build_object(
    'heading', 'Nuestra historia, en primera persona',
    'items', '[]'::jsonb,
    'misionVision', jsonb_build_array(
      jsonb_build_object(
        'id', 'mision',
        'title', 'MISIÓN',
        'text', E'Brindar una experiencia de compra y postventa transparente, confiable y cercana, ofreciendo vehículos de calidad y soluciones de movilidad adaptadas al estilo de vida, las necesidades y el presupuesto de cada cliente.\n\nEn NEIFERT acompañamos a nuestros amigos clientes en cada decisión, buscando que la elección de su vehículo no sea simplemente una compra, sino una herramienta para alcanzar sus proyectos y objetivos de vida.'
      ),
      jsonb_build_object(
        'id', 'vision',
        'title', 'VISIÓN',
        'text', E'Ser el concesionario referente de la Argentina, reconocido por nuestra reputación, innovación, calidad de servicio y, principalmente, por nuestra capacidad de ayudar a nuestros amigos clientes a concretar sus objetivos.\n\nConstruir relaciones sólidas y duraderas, donde cada cliente encuentre en NEIFERT mucho más que una concesionaria: un aliado de confianza para toda la vida.'
      )
    )
  )
)
on conflict (clave) do update
  -- Merge shallow de jsonb: conserva "items" y "heading" ya guardados y solo
  -- pisa/agrega la clave "misionVision".
  set valor = public.contenido_sitio.valor
              || jsonb_build_object('misionVision', excluded.valor -> 'misionVision'),
      actualizado_en = now();
