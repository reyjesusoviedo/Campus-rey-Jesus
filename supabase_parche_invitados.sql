-- PARCHE 4 · Invitados a una clase (sin registro) y modo "solo ver".
-- Ejecutar en el proyecto "campus". Después: Authentication → Sign In / Providers
-- → activar "Allow anonymous sign-ins".

-- 1. Columnas nuevas
alter table public.sessions
  add column if not exists guest_code text unique,
  add column if not exists allow_guests boolean not null default false,
  add column if not exists public_view boolean not null default false;

alter table public.memberships
  add column if not exists session_id uuid references public.sessions(id) on delete cascade,
  add column if not exists expires_at timestamptz;
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('teacher','student','guest'));

-- 2. Funciones de acceso (los invitados solo ven su clase)
create or replace function public.is_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where group_id = g and user_id = auth.uid()
                   and (expires_at is null or expires_at > now()));
$$;

create or replace function public.can_access_session(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions se
    where se.id = s and (
      is_group_teacher(se.group_id) or is_coordinator()
      or exists (select 1 from memberships m
                 where m.group_id = se.group_id and m.user_id = auth.uid()
                   and (m.expires_at is null or m.expires_at > now())
                   and (m.session_id is null or m.session_id = s))));
$$;

create or replace function public.can_access_activity(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_access_session((select session_id from activities where id = a));
$$;

create or replace function public.is_guest()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
$$;

-- 3. Políticas: sustituir las de tablas de sesión por la versión con can_access_session
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select using (can_access_session(id));

drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select using (
  is_group_teacher(session_group(session_id)) or is_coordinator()
  or (visible and can_access_session(session_id)));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select using (
  is_group_teacher(session_group(session_id)) or is_coordinator()
  or (status <> 'draft' and can_access_session(session_id)));

drop policy if exists responses_select on public.responses;
create policy responses_select on public.responses for select using (
  user_id = auth.uid()
  or is_group_teacher(activity_group(activity_id)) or is_coordinator()
  or (shared and can_access_activity(activity_id))
  or (team_id is not null and exists (select 1 from team_members tm
        where tm.team_id = responses.team_id and tm.user_id = auth.uid())));
drop policy if exists responses_insert on public.responses;
create policy responses_insert on public.responses for insert with check (
  user_id = auth.uid() and can_access_activity(activity_id)
  and exists (select 1 from activities a where a.id = activity_id
              and (a.status = 'open' or exists (select 1 from sessions s
                   where s.id = a.session_id and s.status = 'closed'))));

drop policy if exists help_insert on public.help_requests;
create policy help_insert on public.help_requests for insert with check (
  user_id = auth.uid() and can_access_session(session_id));

drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select using (
  can_access_session(session_id) or is_coordinator());
drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions for insert with check (
  user_id = auth.uid() and can_access_session(session_id));
drop policy if exists votes_select on public.question_votes;
create policy votes_select on public.question_votes for select using (
  exists (select 1 from questions q where q.id = question_id and can_access_session(q.session_id)));

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert with check (
  user_id = auth.uid() and can_access_session(session_id));

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (
  can_access_session(session_id) or is_coordinator());

drop policy if exists log_insert on public.session_log;
create policy log_insert on public.session_log for insert with check (
  actor_id = auth.uid() and can_access_session(session_id));

-- Los invitados ven los perfiles de su clase (nombres en dudas)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or is_coordinator()
  or exists (select 1 from memberships m1 join memberships m2 on m1.group_id = m2.group_id
             where m1.user_id = auth.uid() and m2.user_id = profiles.id)
  or exists (select 1 from groups g join memberships m on m.group_id = g.id
             where g.teacher_id = auth.uid() and m.user_id = profiles.id)
  or exists (select 1 from groups g where g.teacher_id = profiles.id and is_member(g.id))
);

-- 4. Código de invitado de una clase (maestro)
create or replace function public.set_session_guest_code(p_session uuid, p_enable boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare g uuid; c text;
begin
  select group_id into g from sessions where id = p_session;
  if g is null or not (is_group_teacher(g) or is_coordinator()) then raise exception 'Sin permiso'; end if;
  if not p_enable then
    update sessions set allow_guests = false where id = p_session; return null;
  end if;
  select guest_code into c from sessions where id = p_session;
  if c is null then
    c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    update sessions set guest_code = c, allow_guests = true where id = p_session;
  else
    update sessions set allow_guests = true where id = p_session;
  end if;
  return c;
end $$;

-- 5. Entrar como invitado (usuario anónimo + nombre + código de clase)
create or replace function public.join_session_as_guest(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into s from sessions
   where guest_code = upper(trim(p_code)) and allow_guests and status <> 'closed';
  if not found then raise exception 'Código de clase no válido o clase terminada'; end if;
  update profiles set full_name = left(trim(p_name), 80) where id = auth.uid() and length(trim(p_name)) > 0;
  insert into memberships (group_id, user_id, role, session_id, expires_at)
  values (s.group_id, auth.uid(), 'guest', s.id, greatest(now(), s.starts_at) + interval '8 hours')
  on conflict (group_id, user_id) do update
    set session_id = excluded.session_id, expires_at = excluded.expires_at
    where memberships.role = 'guest';
  return s.id;
end $$;

-- 6. Modo "solo ver" (sin usuario): estado de la clase por código
create or replace function public.public_session_view(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s sessions%rowtype; m materials%rowtype; g groups%rowtype;
begin
  select * into s from sessions where guest_code = upper(trim(p_code)) and public_view;
  if not found then return null; end if;
  select * into g from groups where id = s.group_id;
  if s.projected_material_id is not null then
    select * into m from materials where id = s.projected_material_id and visible;
  end if;
  return jsonb_build_object(
    'title', s.title, 'group', g.name, 'status', s.status, 'state', s.projected_state,
    'material', case when m.id is null then null else jsonb_build_object(
      'id', m.id, 'title', m.title, 'kind', m.kind, 'url', m.url, 'content', m.content,
      'storage_path', m.storage_path) end);
end $$;
grant execute on function public.public_session_view(text) to anon, authenticated;
grant execute on function public.set_session_guest_code(uuid, boolean) to authenticated;
grant execute on function public.join_session_as_guest(text, text) to authenticated;

-- Lectura pública del archivo proyectado cuando la clase está en modo "solo ver"
drop policy if exists materials_public_read on storage.objects;
create policy materials_public_read on storage.objects for select using (
  bucket_id = 'materials' and exists (
    select 1 from public.sessions s join public.materials m on m.id = s.projected_material_id
    where s.public_view and m.visible and m.storage_path = storage.objects.name));

-- 7. Resultados: marcar invitados
create or replace function public.get_activity_results(p_activity uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare act activities%rowtype; g uuid; staff boolean;
begin
  select * into act from activities where id = p_activity;
  if not found then return jsonb_build_object('allowed', false); end if;
  g := session_group(act.session_id);
  staff := is_group_teacher(g) or is_coordinator();
  if not (staff or (act.results_shared and can_access_session(act.session_id))) then
    return jsonb_build_object('allowed', false);
  end if;
  return jsonb_build_object('allowed', true,
    'total', (select count(*) from responses where activity_id = p_activity),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'content', case when staff then r.content else r.content - 'storage_path' end,
        'name', case when staff then p.full_name else null end,
        'user_id', case when staff then r.user_id else null end,
        'guest', exists (select 1 from memberships mm where mm.user_id = r.user_id and mm.group_id = g and mm.role = 'guest'),
        'deferred', r.is_deferred) order by r.submitted_at)
      from responses r join profiles p on p.id = r.user_id where r.activity_id = p_activity), '[]'::jsonb));
end $$;

-- 8. Limpieza de invitados caducados (opcional; ejecutar a mano o programar con pg_cron)
create or replace function public.cleanup_guests()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from memberships where role = 'guest' and expires_at < now() - interval '2 days';
  with gone as (
    delete from auth.users u
     where u.is_anonymous and u.created_at < now() - interval '2 days'
       and not exists (select 1 from memberships m where m.user_id = u.id)
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;
-- Para programarlo cada noche:  create extension if not exists pg_cron;
-- select cron.schedule('limpiar-invitados', '0 4 * * *', 'select public.cleanup_guests()');
