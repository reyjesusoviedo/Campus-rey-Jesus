-- PARCHE 3 · "Seguir al maestro". Ejecutar en el proyecto "campus".
alter table public.sessions
  add column if not exists projected_state jsonb not null default '{}'::jsonb;
