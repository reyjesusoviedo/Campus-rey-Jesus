-- PARCHE 7 · Fase 2: vídeo incrustado, semáforo y respuestas a dudas. Ejecutar en "campus".

-- Proveedor de vídeo por grupo: 'jitsi' (incrustado) o 'external' (Meet/Zoom aparte)
alter table public.groups add column if not exists video_provider text not null default 'jitsi'
  check (video_provider in ('jitsi','external'));

-- Respuesta del maestro a una duda
alter table public.questions add column if not exists answer text, add column if not exists answered_at timestamptz;

-- Semáforo: cómo va cada alumno
create table if not exists public.reactions (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  value      text not null check (value in ('ok','meh','lost')),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.reactions enable row level security;
drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select using (
  user_id = auth.uid() or is_group_teacher(session_group(session_id)) or is_coordinator());
drop policy if exists reactions_own on public.reactions;
create policy reactions_own on public.reactions for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_access_session(session_id));
grant all on public.reactions to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.reactions;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
