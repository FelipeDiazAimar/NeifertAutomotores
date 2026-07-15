-- ============================================================================
--  NEIFERT AUTOMOTORES — Esquema de base de datos (Supabase / PostgreSQL)
--  Ejecutar en: Supabase -> SQL Editor -> New query -> pegar todo -> Run.
--  Es idempotente: se puede correr más de una vez sin romper.
--  Tablas y columnas en español. Los valores de estado/tipo (ej: 'disponible',
--  'video', 'WhatsApp') se dejan tal cual, son los que ya usa el sitio.
--  No se cargan datos de ejemplo acá — perfiles y vehículos vienen del CRM
--  viejo (login y sincronización); prospectos/historias/tráfico se cargan
--  con seed.sql si querés ver el panel con contenido de muestra.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  TABLAS
-- ----------------------------------------------------------------------------

-- Perfiles de usuarios del panel (1-a-1 con auth.users). Se crean solos al
-- iniciar sesión (puente con el CRM viejo) o al registrarse.
create table if not exists public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null default 'Usuario',
  rol            text not null default 'vendedor',
  foto_url       text,
  creado_en      timestamptz not null default now()
);

-- Inventario de vehículos. Se completa sincronizando con el CRM viejo
-- (marca/modelo/precio/estado/etc.); fotos y descripción de marketing son
-- siempre a cargo del admin de este sitio.
create table if not exists public.vehiculos (
  id              uuid primary key default gen_random_uuid(),
  marca           text not null,
  modelo          text not null,
  version         text,          -- versión/trim (ej: "SRX 2.8T 4X4 AT")
  color           text,
  anio            int  not null,
  -- Precio mostrado en su moneda original (el CRM viejo carga ARS o USD).
  -- precio_usd es el equivalente normalizado interno, solo para ordenar/filtrar.
  moneda          text not null default 'USD' check (moneda in ('USD','ARS')),
  precio          numeric,        -- monto en `moneda` tal cual se carga/muestra
  precio_usd      numeric not null default 0, -- equivalente USD interno
  km              int  not null default 0,
  combustible     text not null,
  transmision     text,
  motor           text,
  categoria       text not null,  -- categorías dinámicas (editables desde /admin/contenido)
  es_premium      boolean not null default false,
  estado          text not null default 'disponible' check (estado in ('disponible','reservado','vendido')),
  imagen_principal text,
  imagenes        jsonb not null default '[]'::jsonb,
  descripcion     text,
  vistas          int  not null default 0,
  -- Ingesta desde el CRM viejo (sincronización de solo estos campos)
  id_externo       text,          -- id del vehículo en el CRM viejo
  origen_externo   text,          -- 'crm_viejo'
  snapshot_externo jsonb,         -- últimos valores del CRM usados (merge de 3 vías)
  sincronizado_en  timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Prospectos (leads) del mini-CRM: propios (web/IG/FB/catálogo) + los que se
-- ingieran del CRM viejo (WhatsApp de la empresa, gente que va al salón).
create table if not exists public.prospectos (
  id               uuid primary key default gen_random_uuid(),
  nombre_completo  text not null,
  telefono         text,
  email            text,
  vehiculo_interes text,
  origen           text not null default 'Web'
                     check (origen in ('WhatsApp','Instagram','Web','Showroom','Referido','Facebook')),
  estado           text not null default 'nuevo'
                     check (estado in ('nuevo','primer_contacto','seguimiento','negociacion','vip','cerrado')),
  notas            text,
  fecha_contacto   date,
  asignado_a       uuid references public.perfiles (id) on delete set null,
  foto_url         text,
  -- Ingesta desde el CRM externo (enlatado) + atribución web
  id_externo       text,          -- id del prospecto en el CRM externo (dedup/sync)
  origen_externo   text,          -- sistema de origen: 'crm_enlatado' | 'web' | null
  vehiculos_vistos jsonb not null default '[]'::jsonb, -- autos que vio en la web (atribución)
  sincronizado_en  timestamptz,   -- última sincronización con el CRM externo
  ultimo_contacto_en timestamptz not null default now(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- Historias editoriales del Home (videos + fotos + testimonios)
create table if not exists public.historias (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('video','photo','testimonial')),
  titulo      text,
  url_video   text,
  imagen_poster text,
  duracion    text,
  leyenda     text,
  cita        text,
  autor_nombre text,
  autor_rol   text,
  orden       int not null default 0,
  publicado   boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- Tráfico diario para el dashboard (Web vs Salón)
create table if not exists public.trafico_diario (
  dia   date primary key,
  web   int not null default 0,
  salon int not null default 0
);

-- Contenido editable del sitio (hero, CTA, historias, galería IG, footer, redes).
-- Clave→JSON: cada sección del editor de /admin/contenido es una fila.
create table if not exists public.contenido_sitio (
  clave        text primary key,
  valor        jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  ÍNDICES
-- ----------------------------------------------------------------------------
create index if not exists idx_vehiculos_categoria     on public.vehiculos (categoria);
create index if not exists idx_vehiculos_estado         on public.vehiculos (estado);
create index if not exists idx_prospectos_estado        on public.prospectos (estado);
create index if not exists idx_prospectos_ultimo_contacto on public.prospectos (ultimo_contacto_en desc);
-- Dedup de prospectos ingeridos del CRM externo (upsert por id_externo)
create unique index if not exists idx_prospectos_id_externo
  on public.prospectos (id_externo) where id_externo is not null;
-- Dedup de vehículos ingeridos del CRM viejo (upsert por id_externo)
create unique index if not exists idx_vehiculos_id_externo
  on public.vehiculos (id_externo) where id_externo is not null;

-- ----------------------------------------------------------------------------
--  TRIGGERS: actualizado_en automático + alta de perfil al iniciar sesión
-- ----------------------------------------------------------------------------
create or replace function public.set_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_vehiculos_actualizado on public.vehiculos;
create trigger trg_vehiculos_actualizado before update on public.vehiculos
  for each row execute function public.set_actualizado_en();

drop trigger if exists trg_prospectos_actualizado on public.prospectos;
create trigger trg_prospectos_actualizado before update on public.prospectos
  for each row execute function public.set_actualizado_en();

drop trigger if exists trg_contenido_sitio_actualizado on public.contenido_sitio;
create trigger trg_contenido_sitio_actualizado before update on public.contenido_sitio
  for each row execute function public.set_actualizado_en();

-- Alta automática de perfil: al registrarse por Supabase Auth o al validar
-- por primera vez contra el CRM viejo (puente de login).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'rol', 'vendedor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
--  VISTAS para el dashboard (security_invoker => respetan RLS del consumidor)
-- ----------------------------------------------------------------------------
create or replace view public.v_prospectos_por_canal
  with (security_invoker = true) as
select origen as canal, count(*)::int as valor
from public.prospectos
group by origen
order by valor desc;

create or replace view public.v_modelos_top
  with (security_invoker = true) as
select
  vehiculo_interes as nombre,
  count(*)::int as interes,
  row_number() over (order by count(*) desc)::int as posicion
from public.prospectos
where vehiculo_interes is not null
group by vehiculo_interes
order by interes desc
limit 5;

create or replace view public.v_trafico_semanal
  with (security_invoker = true) as
select to_char(dia, 'Dy') as dia, web, salon
from public.trafico_diario
order by dia desc
limit 7;

create or replace view public.v_resumen_kpi
  with (security_invoker = true) as
select
  (select count(*) from public.prospectos where estado = 'cerrado')::int as ventas_totales,
  (select count(*) from public.prospectos where creado_en > now() - interval '30 days')::int as nuevos_prospectos,
  (select coalesce(sum(web), 0) from public.trafico_diario)::int as visitas_web,
  case
    when (select count(*) from public.prospectos) = 0 then 0
    else round(
      100.0 * (select count(*) from public.prospectos where estado = 'cerrado')
      / (select count(*) from public.prospectos), 1)
  end as tasa_conversion;

-- ----------------------------------------------------------------------------
--  RLS (Row Level Security)
-- ----------------------------------------------------------------------------
alter table public.perfiles        enable row level security;
alter table public.vehiculos       enable row level security;
alter table public.prospectos      enable row level security;
alter table public.historias       enable row level security;
alter table public.trafico_diario  enable row level security;
alter table public.contenido_sitio enable row level security;

-- perfiles: cualquier usuario autenticado lee; cada uno edita el suyo
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated using (true);
drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles
  for update to authenticated using (auth.uid() = id);

-- vehiculos: lectura pública (el catálogo filtra 'disponible' en la query; el
-- detalle necesita leer reservados/vendidos para la vista "ya no disponible");
-- admin (autenticado) hace todo
drop policy if exists vehiculos_lectura_publica on public.vehiculos;
create policy vehiculos_lectura_publica on public.vehiculos
  for select using (true);
drop policy if exists vehiculos_admin_todo on public.vehiculos;
create policy vehiculos_admin_todo on public.vehiculos
  for all to authenticated using (true) with check (true);

-- historias: lectura pública de publicadas; admin hace todo
drop policy if exists historias_lectura_publica on public.historias;
create policy historias_lectura_publica on public.historias
  for select using (publicado = true);
drop policy if exists historias_admin_todo on public.historias;
create policy historias_admin_todo on public.historias
  for all to authenticated using (true) with check (true);

-- prospectos: insert anónimo permitido (captación web); admin lee/edita/borra
drop policy if exists prospectos_insert_publico on public.prospectos;
create policy prospectos_insert_publico on public.prospectos
  for insert to anon, authenticated with check (true);
drop policy if exists prospectos_admin_select on public.prospectos;
create policy prospectos_admin_select on public.prospectos
  for select to authenticated using (true);
drop policy if exists prospectos_admin_update on public.prospectos;
create policy prospectos_admin_update on public.prospectos
  for update to authenticated using (true);
drop policy if exists prospectos_admin_delete on public.prospectos;
create policy prospectos_admin_delete on public.prospectos
  for delete to authenticated using (true);

-- trafico_diario: lectura admin
drop policy if exists trafico_admin_lectura on public.trafico_diario;
create policy trafico_admin_lectura on public.trafico_diario
  for select to authenticated using (true);

-- contenido_sitio: lectura pública (el sitio la consume); escritura solo admin
drop policy if exists contenido_lectura_publica on public.contenido_sitio;
create policy contenido_lectura_publica on public.contenido_sitio
  for select using (true);
drop policy if exists contenido_admin_escritura on public.contenido_sitio;
create policy contenido_admin_escritura on public.contenido_sitio
  for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
--  STORAGE (buckets públicos para imágenes/videos)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('vehiculos', 'vehiculos', true),
  ('historias', 'historias', true),
  ('avatares',  'avatares',  true)
on conflict (id) do nothing;

drop policy if exists storage_lectura_publica on storage.objects;
create policy storage_lectura_publica on storage.objects
  for select using (bucket_id in ('vehiculos', 'historias', 'avatares'));
drop policy if exists storage_auth_insert on storage.objects;
create policy storage_auth_insert on storage.objects
  for insert to authenticated with check (bucket_id in ('vehiculos', 'historias', 'avatares'));
drop policy if exists storage_auth_update on storage.objects;
create policy storage_auth_update on storage.objects
  for update to authenticated using (bucket_id in ('vehiculos', 'historias', 'avatares'));
drop policy if exists storage_auth_delete on storage.objects;
create policy storage_auth_delete on storage.objects
  for delete to authenticated using (bucket_id in ('vehiculos', 'historias', 'avatares'));

-- ----------------------------------------------------------------------------
--  REALTIME (CRM + inventario en vivo)
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.prospectos;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.vehiculos;
exception when duplicate_object then null; end $$;

-- Listo. Perfiles y vehículos se completan solos (login y sincronización con
-- el CRM viejo). Si querés contenido de muestra en prospectos/historias/
-- tráfico para ver el panel poblado, corré seed.sql.
