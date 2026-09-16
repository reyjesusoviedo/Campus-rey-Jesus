-- PARCHE 2 · Proyectar material en la clase. Ejecutar en el proyecto "campus".
alter table public.sessions
  add column if not exists projected_material_id uuid references public.materials(id) on delete set null;
