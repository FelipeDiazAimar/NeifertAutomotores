-- ============================================================================
--  NEIFERT AUTOMOTORES — Esquema de base de datos (Supabase / PostgreSQL)
--  Ejecutar en: Supabase -> SQL Editor -> New query -> pegar todo -> Run.
--  Es idempotente: se puede correr más de una vez sin romper.
--  Después corré seed.sql para cargar datos de ejemplo.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  TABLAS
-- ----------------------------------------------------------------------------

-- Perfiles de usuarios del panel (1-a-1 con auth.users)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default 'Usuario',
  role       text not null default 'vendedor',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Inventario de vehículos
create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null,
  model         text not null,
  year          int  not null,
  price_usd     numeric not null,
  km            int  not null default 0,
  fuel_type     text not null,
  transmission  text,
  engine        text,
  category      text not null check (category in ('suv','sedan','coupe','sport','electrico','pickup')),
  is_premium    boolean not null default false,
  status        text not null default 'disponible' check (status in ('disponible','reservado','vendido')),
  main_image_url text,
  images        jsonb not null default '[]'::jsonb,
  description   text,
  view_count    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Leads del CRM
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone           text,
  email           text,
  vehicle_interest text,
  source          text not null default 'Web'
                    check (source in ('WhatsApp','Instagram','Web','Showroom','Referido','Facebook')),
  status          text not null default 'nuevo'
                    check (status in ('nuevo','primer_contacto','seguimiento','negociacion','vip','cerrado')),
  notes           text,
  contact_date    date,
  assigned_to     uuid references public.profiles (id) on delete set null,
  avatar_url      text,
  last_contact_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Historias editoriales del Home (videos + testimonios)
create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('video','testimonial')),
  title       text,
  video_url   text,
  poster_url  text,
  duration    text,
  caption     text,
  quote       text,
  author_name text,
  author_role text,
  order_index int not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Tráfico diario para el dashboard (Web vs Salón)
create table if not exists public.daily_traffic (
  day      date primary key,
  web      int not null default 0,
  showroom int not null default 0
);

-- ----------------------------------------------------------------------------
--  ÍNDICES
-- ----------------------------------------------------------------------------
create index if not exists idx_vehicles_category    on public.vehicles (category);
create index if not exists idx_vehicles_status       on public.vehicles (status);
create index if not exists idx_leads_status          on public.leads (status);
create index if not exists idx_leads_last_contact    on public.leads (last_contact_at desc);

-- ----------------------------------------------------------------------------
--  TRIGGERS: updated_at automático + alta de perfil al registrarse
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vehicles_updated on public.vehicles;
create trigger trg_vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'vendedor'
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
create or replace view public.v_leads_by_channel
  with (security_invoker = true) as
select source as channel, count(*)::int as value
from public.leads
group by source
order by value desc;

create or replace view public.v_top_models
  with (security_invoker = true) as
select
  vehicle_interest as name,
  count(*)::int as interest,
  row_number() over (order by count(*) desc)::int as rank
from public.leads
where vehicle_interest is not null
group by vehicle_interest
order by interest desc
limit 5;

create or replace view public.v_weekly_traffic
  with (security_invoker = true) as
select to_char(day, 'Dy') as day, web, showroom
from public.daily_traffic
order by day desc
limit 7;

create or replace view public.v_kpi_summary
  with (security_invoker = true) as
select
  (select count(*) from public.leads where status = 'cerrado')::int as ventas_totales,
  (select count(*) from public.leads where created_at > now() - interval '30 days')::int as nuevos_leads,
  (select coalesce(sum(web), 0) from public.daily_traffic)::int as visitas_web,
  case
    when (select count(*) from public.leads) = 0 then 0
    else round(
      100.0 * (select count(*) from public.leads where status = 'cerrado')
      / (select count(*) from public.leads), 1)
  end as tasa_conversion;

-- ----------------------------------------------------------------------------
--  RLS (Row Level Security)
-- ----------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.vehicles      enable row level security;
alter table public.leads         enable row level security;
alter table public.stories       enable row level security;
alter table public.daily_traffic enable row level security;

-- profiles: cualquier usuario autenticado lee; cada uno edita el suyo
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id);

-- vehicles: lectura pública de disponibles; admin (autenticado) hace todo
drop policy if exists vehicles_public_read on public.vehicles;
create policy vehicles_public_read on public.vehicles
  for select using (status = 'disponible');
drop policy if exists vehicles_admin_all on public.vehicles;
create policy vehicles_admin_all on public.vehicles
  for all to authenticated using (true) with check (true);

-- stories: lectura pública de publicadas; admin hace todo
drop policy if exists stories_public_read on public.stories;
create policy stories_public_read on public.stories
  for select using (published = true);
drop policy if exists stories_admin_all on public.stories;
create policy stories_admin_all on public.stories
  for all to authenticated using (true) with check (true);

-- leads: insert anónimo permitido (captación web); admin lee/edita/borra
drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads
  for insert to anon, authenticated with check (true);
drop policy if exists leads_admin_select on public.leads;
create policy leads_admin_select on public.leads
  for select to authenticated using (true);
drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads
  for update to authenticated using (true);
drop policy if exists leads_admin_delete on public.leads;
create policy leads_admin_delete on public.leads
  for delete to authenticated using (true);

-- daily_traffic: lectura admin
drop policy if exists traffic_admin_read on public.daily_traffic;
create policy traffic_admin_read on public.daily_traffic
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
--  STORAGE (buckets públicos para imágenes/videos)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('vehicles', 'vehicles', true),
  ('stories',  'stories',  true),
  ('avatars',  'avatars',  true)
on conflict (id) do nothing;

drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select using (bucket_id in ('vehicles', 'stories', 'avatars'));
drop policy if exists storage_auth_insert on storage.objects;
create policy storage_auth_insert on storage.objects
  for insert to authenticated with check (bucket_id in ('vehicles', 'stories', 'avatars'));
drop policy if exists storage_auth_update on storage.objects;
create policy storage_auth_update on storage.objects
  for update to authenticated using (bucket_id in ('vehicles', 'stories', 'avatars'));
drop policy if exists storage_auth_delete on storage.objects;
create policy storage_auth_delete on storage.objects
  for delete to authenticated using (bucket_id in ('vehicles', 'stories', 'avatars'));

-- ----------------------------------------------------------------------------
--  REALTIME (CRM + inventario en vivo)
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.vehicles;
exception when duplicate_object then null; end $$;

-- Listo. Ahora ejecutá seed.sql para cargar datos de ejemplo.
