-- Finanzas Familiares — esquema de Supabase
-- Ejecuta este archivo completo en: Supabase → tu proyecto → SQL Editor → New query → Run.
-- Es seguro volver a correrlo (usa "if not exists" / "or replace" donde aplica), pero
-- lo normal es correrlo una sola vez, la primera vez que configuras el proyecto.

-- ============================================================
-- 1. TABLAS
-- ============================================================

create table if not exists deudas (
  id uuid primary key,
  empresa text not null,
  detalle text not null,
  icono text default '📌',
  tipo text not null default 'recurrente' check (tipo in ('recurrente', 'cuotas')),
  cuotas_totales int,
  valor_cuota numeric not null default 0,
  cuotas_pagadas_base int default 0,
  fecha_inicio text,
  activa boolean not null default true,
  fecha_archivo timestamptz,
  notas text default '',
  foto_id text,
  entidad text,
  creado_en timestamptz default now()
);

create table if not exists pagos (
  id uuid primary key,
  deuda_id uuid not null references deudas(id) on delete cascade,
  mes text not null,
  gasto numeric not null default 0,
  cuota_pagada_acumulada int,
  pagado boolean not null default false,
  fecha_pago timestamptz,
  unique (deuda_id, mes)
);

create table if not exists ingresos (
  id uuid primary key,
  fuente text not null,
  monto numeric not null default 0,
  mes text not null,
  tipo text not null default 'fijo' check (tipo in ('fijo', 'variable')),
  notas text default ''
);

create table if not exists gastos (
  id uuid primary key,
  tipo text not null default 'consumo' check (tipo in ('consumo', 'rendir')),
  detalle text not null,
  monto numeric not null default 0,
  fecha date not null,
  categoria text default 'Otros',
  notas text default '',
  foto_boleta_id text,
  estado text default 'pendiente' check (estado in ('pendiente', 'rendido', 'reembolsado')),
  fecha_rendido timestamptz,
  fecha_reembolso timestamptz,
  foto_comprobante_id text,
  creado_en timestamptz default now()
);

create table if not exists empresas (
  nombre text primary key
);

-- Tarjetas / entidades financieras con las que se compra (ej. "BCI Visa", "CMR Falabella").
create table if not exists entidades (
  nombre text primary key
);

create table if not exists cierres (
  mes text primary key,
  saldo_final numeric not null default 0,
  fecha_cierre timestamptz,
  ajustado boolean default false,
  fecha_ajuste timestamptz
);

-- Configuración simple clave/valor (tema, mes actual, último respaldo, timeout de
-- bloqueo, etc.) — equivalente a "meta" en la versión local.
create table if not exists meta (
  clave text primary key,
  valor jsonb
);

create index if not exists idx_pagos_mes on pagos (mes);
create index if not exists idx_ingresos_mes on ingresos (mes);
create index if not exists idx_gastos_fecha on gastos (fecha);

-- ============================================================
-- 2. SEGURIDAD (RLS)
-- ============================================================
-- Esta app es para un solo hogar, no multi-empresa: cualquier persona que inicie
-- sesión (tú y quien más le des una cuenta) puede leer y escribir todo. No hay
-- separación de datos por usuario.

alter table deudas enable row level security;
alter table pagos enable row level security;
alter table ingresos enable row level security;
alter table gastos enable row level security;
alter table empresas enable row level security;
alter table entidades enable row level security;
alter table cierres enable row level security;
alter table meta enable row level security;

drop policy if exists "autenticados_todo" on deudas;
create policy "autenticados_todo" on deudas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on pagos;
create policy "autenticados_todo" on pagos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on ingresos;
create policy "autenticados_todo" on ingresos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on gastos;
create policy "autenticados_todo" on gastos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on empresas;
create policy "autenticados_todo" on empresas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on entidades;
create policy "autenticados_todo" on entidades for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on cierres;
create policy "autenticados_todo" on cierres for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "autenticados_todo" on meta;
create policy "autenticados_todo" on meta for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- 3. STORAGE (fotos de boletas, comprobantes, deudas)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "autenticados_leen_fotos" on storage.objects;
create policy "autenticados_leen_fotos" on storage.objects for select
  using (bucket_id = 'fotos' and auth.role() = 'authenticated');

drop policy if exists "autenticados_suben_fotos" on storage.objects;
create policy "autenticados_suben_fotos" on storage.objects for insert
  with check (bucket_id = 'fotos' and auth.role() = 'authenticated');

drop policy if exists "autenticados_actualizan_fotos" on storage.objects;
create policy "autenticados_actualizan_fotos" on storage.objects for update
  using (bucket_id = 'fotos' and auth.role() = 'authenticated');

drop policy if exists "autenticados_borran_fotos" on storage.objects;
create policy "autenticados_borran_fotos" on storage.objects for delete
  using (bucket_id = 'fotos' and auth.role() = 'authenticated');

-- ============================================================
-- Listo. Los pasos que siguen (crear tu proyecto, obtener la URL y la anon key,
-- crear los usuarios) están en README.md, sección "Configurar Supabase".
-- ============================================================
