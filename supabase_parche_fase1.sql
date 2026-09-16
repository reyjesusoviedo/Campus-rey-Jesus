-- PARCHE 6 · Fase 1 (nueva pantalla de clase). Ejecutar en el proyecto "campus".
alter table public.sessions
  add column if not exists started_at timestamptz,
  add column if not exists objectives jsonb not null default '[]'::jsonb,
  add column if not exists teacher_notes text;
notify pgrst, 'reload schema';
