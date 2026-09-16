-- PARCHE 1 · Ejecutar en el proyecto "campus" después del esquema principal.
-- Sustituye la vista activity_results por una función que respeta permisos:
--  · el maestro ve todas las respuestas con nombre
--  · el alumno ve los resultados del grupo (sin nombres) solo si el maestro los ha compartido

drop view if exists public.activity_results;

create or replace function public.get_activity_results(p_activity uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  act activities%rowtype;
  g uuid;
  staff boolean;
begin
  select * into act from activities where id = p_activity;
  if not found then return jsonb_build_object('allowed', false); end if;
  g := session_group(act.session_id);
  staff := is_group_teacher(g) or is_coordinator();
  if not (staff or (act.results_shared and is_member(g))) then
    return jsonb_build_object('allowed', false);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'total', (select count(*) from responses where activity_id = p_activity),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'content', case when staff then r.content
                        else r.content - 'storage_path' end,
        'name', case when staff then p.full_name else null end,
        'user_id', case when staff then r.user_id else null end,
        'deferred', r.is_deferred
      ) order by r.submitted_at)
      from responses r join profiles p on p.id = r.user_id
      where r.activity_id = p_activity), '[]'::jsonb)
  );
end $$;

grant execute on function public.get_activity_results(uuid) to authenticated;
