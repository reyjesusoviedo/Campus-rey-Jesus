-- PARCHE 5 · Código permanente de invitados por grupo. Ejecutar en "campus".
alter table public.groups
  add column if not exists guest_code text unique,
  add column if not exists allow_guests boolean not null default false;

-- Generar / activar / desactivar el código de invitados del grupo
create or replace function public.set_group_guest_code(p_group uuid, p_enable boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not (is_group_teacher(p_group) or is_coordinator()) then raise exception 'Sin permiso'; end if;
  if not p_enable then update groups set allow_guests = false where id = p_group; return null; end if;
  select guest_code into c from groups where id = p_group;
  if c is null then
    c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    update groups set guest_code = c, allow_guests = true where id = p_group;
  else
    update groups set allow_guests = true where id = p_group;
  end if;
  return c;
end $$;

-- Entrar como invitado con código de clase O de grupo. Devuelve la clase a abrir.
create or replace function public.join_as_guest(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s sessions%rowtype; g groups%rowtype; target uuid; code text := upper(trim(p_code));
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if length(trim(p_name)) > 0 then update profiles set full_name = left(trim(p_name), 80) where id = auth.uid(); end if;

  -- 1) código de una clase concreta
  select * into s from sessions where guest_code = code and allow_guests and status <> 'closed';
  if found then
    insert into memberships (group_id, user_id, role, session_id, expires_at)
    values (s.group_id, auth.uid(), 'guest', s.id, greatest(now(), s.starts_at) + interval '8 hours')
    on conflict (group_id, user_id) do update
      set session_id = case when memberships.session_id is null then null else excluded.session_id end,
          expires_at = greatest(memberships.expires_at, excluded.expires_at)
      where memberships.role = 'guest';
    return s.id;
  end if;

  -- 2) código permanente del grupo
  select * into g from groups where guest_code = code and allow_guests;
  if not found then raise exception 'Código no válido o caducado'; end if;
  insert into memberships (group_id, user_id, role, session_id, expires_at)
  values (g.id, auth.uid(), 'guest', null, now() + interval '90 days')
  on conflict (group_id, user_id) do update
    set session_id = null, expires_at = now() + interval '90 days'
    where memberships.role = 'guest';
  -- clase en directo o la próxima programada; si no hay, la última
  select id into target from sessions where group_id = g.id and status = 'live' order by starts_at desc limit 1;
  if target is null then select id into target from sessions where group_id = g.id and status = 'scheduled' and starts_at > now() - interval '3 hours' order by starts_at limit 1; end if;
  if target is null then select id into target from sessions where group_id = g.id order by starts_at desc limit 1; end if;
  return target;  -- puede ser null si el grupo aún no tiene clases: se abre el panel
end $$;
grant execute on function public.set_group_guest_code(uuid, boolean) to authenticated;
grant execute on function public.join_as_guest(text, text) to authenticated;

-- Renovar la caducidad del invitado habitual cada vez que entra a una clase
create or replace function public.touch_guest_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update memberships set expires_at = now() + interval '90 days'
   where user_id = new.user_id and role = 'guest' and session_id is null
     and group_id = (select group_id from sessions where id = new.session_id);
  return new;
end $$;
drop trigger if exists attendance_touch_guest on public.attendance;
create trigger attendance_touch_guest after insert on public.attendance
  for each row execute function public.touch_guest_access();
