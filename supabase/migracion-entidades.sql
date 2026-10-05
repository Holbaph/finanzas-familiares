-- Migración: tarjeta / entidad financiera por deuda.
-- Para un proyecto de Supabase que YA tiene el esquema original: pega este archivo en
-- Supabase → SQL Editor → New query → Run. Es seguro correrlo más de una vez.

alter table deudas add column if not exists entidad text;

create table if not exists entidades (
  nombre text primary key
);

alter table entidades enable row level security;

drop policy if exists "autenticados_todo" on entidades;
create policy "autenticados_todo" on entidades for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
