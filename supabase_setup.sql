-- ============================================================================
-- Uparsistem · Seminario "Tu imagen, tu oportunidad"
-- Script SQL para Supabase (Proyecto: Seminario 2026)
-- Copia y pega este contenido en: Supabase -> SQL Editor -> New query -> Run
-- ============================================================================

-- 1. Crear la tabla "inscripciones"
create table if not exists public.inscripciones (
  id bigint generated always as identity primary key,
  nombres text not null,
  apellidos text not null,
  tipo_documento text not null check (tipo_documento in ('CC', 'TI', 'CE', 'Pasaporte')),
  numero_documento text not null unique check (numero_documento ~ '^[0-9]+$'),
  correo text not null,
  celular text not null check (celular ~ '^[0-9]{10}$'),
  ciudad text not null,
  situacion_actual text not null check (situacion_actual in ('Estudiante', 'Egresado', 'Empleado', 'Buscando empleo')),
  programa_institucion text,
  como_se_entero text check (como_se_entero is null or como_se_entero in ('Redes sociales', 'WhatsApp', 'Correo', 'Un amigo', 'Otro')),
  acepta_datos boolean not null default true check (acepta_datos = true),
  fecha_registro timestamptz not null default now()
);

-- 2. Permisos base de esquema y tabla (necesarios para que la API pública funcione con RLS)
grant usage on schema public to anon, authenticated;
revoke all on table public.inscripciones from anon, authenticated;
grant insert on table public.inscripciones to anon, authenticated;
grant select on table public.inscripciones to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 3. Activar la seguridad por filas (RLS - Row Level Security)
alter table public.inscripciones enable row level security;

-- Limpiar políticas previas si vuelves a ejecutar este script
drop policy if exists "Publico solo puede insertar inscripciones" on public.inscripciones;
drop policy if exists "Solo usuarios autenticados pueden leer inscripciones" on public.inscripciones;

-- 4. Regla 1: El público (visitantes de la landing) solo puede insertar registros
create policy "Publico solo puede insertar inscripciones"
on public.inscripciones
for insert
to anon, authenticated
with check (acepta_datos = true);

-- 5. Regla 2: Solo los usuarios con sesión iniciada pueden leer los registros (Dashboard)
create policy "Solo usuarios autenticados pueden leer inscripciones"
on public.inscripciones
for select
to authenticated
using (true);
