-- PARCHE 8 · Fase 3: pizarra y resumen. Ejecutar en "campus".
alter table public.sessions
  add column if not exists board_active boolean not null default false,
  add column if not exists board_writers uuid[] not null default '{}';

create table if not exists public.board_strokes (
  id         bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  stroke     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists board_strokes_session on public.board_strokes (session_id, id);
alter table public.board_strokes enable row level security;
drop policy if exists strokes_select on public.board_strokes;
create policy strokes_select on public.board_strokes for select using (can_access_session(session_id));
drop policy if exists strokes_insert on public.board_strokes;
create policy strokes_insert on public.board_strokes for insert with check (
  user_id = auth.uid() and (
    is_group_teacher(session_group(session_id)) or is_coordinator()
    or exists (select 1 from sessions s where s.id = session_id and auth.uid() = any(s.board_writers))));
drop policy if exists strokes_delete on public.board_strokes;
create policy strokes_delete on public.board_strokes for delete using (
  is_group_teacher(session_group(session_id)) or is_coordinator());
grant all on public.board_strokes to authenticated;
grant usage, select on sequence public.board_strokes_id_seq to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.board_strokes;
exception when duplicate_object then null; end $$;

-- Resumen de la clase (lo calcula el servidor para el maestro)
create or replace function public.session_summary(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  g := session_group(p_session);
  if not (is_group_teacher(g) or is_coordinator()) then return null; end if;
  return jsonb_build_object(
    'attendees', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'guest', m.role = 'guest') order by p.full_name), '[]'::jsonb)
                    from attendance a join profiles p on p.id = a.user_id
                    left join memberships m on m.user_id = a.user_id and m.group_id = g
                   where a.session_id = p_session),
    'absent', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                 from memberships m join profiles p on p.id = m.user_id
                where m.group_id = g and m.role = 'student'
                  and not exists (select 1 from attendance a where a.session_id = p_session and a.user_id = m.user_id)),
    'turns', (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'kind', a.kind, 'quick', coalesce((a.content->>'quick')::boolean, false),
                     'responses', (select count(*) from responses r where r.activity_id = a.id)) order by a.position, a.created_at), '[]'::jsonb)
                from activities a where a.session_id = p_session and a.status <> 'draft'),
    'silent', (select coalesce(jsonb_agg(p.full_name order by p.full_name), '[]'::jsonb)
                 from attendance at join profiles p on p.id = at.user_id
                where at.session_id = p_session
                  and not exists (select 1 from responses r join activities a on a.id = r.activity_id
                                   where a.session_id = p_session and r.user_id = at.user_id)),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('text', q.text, 'status', q.status, 'answer', q.answer, 'by', p.full_name) order by q.created_at), '[]'::jsonb)
                    from questions q join profiles p on p.id = q.user_id where q.session_id = p_session),
    'reactions', (select jsonb_build_object('ok', count(*) filter (where value = 'ok'), 'meh', count(*) filter (where value = 'meh'), 'lost', count(*) filter (where value = 'lost'))
                    from reactions where session_id = p_session),
    'objectives', (select objectives from sessions where id = p_session)
  );
end $$;
grant execute on function public.session_summary(uuid) to authenticated;
notify pgrst, 'reload schema';
