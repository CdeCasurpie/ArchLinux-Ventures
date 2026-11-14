-- Protocol v1, initially scoped to answer patches. Existing write paths are not
-- migrated by this migration; this feed is not yet a complete replica feed.
create schema if not exists sync_internal;
revoke all on schema sync_internal from public, anon, authenticated;

create table sync_internal.owner_cursor (
  owner uuid primary key references public.profesional(id),
  revision bigint not null default 0
);
create table sync_internal.operations (
  owner uuid not null references public.profesional(id),
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  primary key(owner, operation_id)
);
create table sync_internal.changes (
  owner uuid not null references public.profesional(id),
  revision bigint not null,
  visita_id uuid not null,
  answers jsonb not null,
  primary key(owner, revision)
);
-- Defense in depth: no direct client access, even if schema grants change.
alter table sync_internal.owner_cursor enable row level security;
alter table sync_internal.operations enable row level security;
alter table sync_internal.changes enable row level security;

create function public.sync_patch_answers_v1(operation_id uuid, visita_id uuid, patch jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  request_value jsonb := jsonb_build_object('visita_id',visita_id,'patch',patch);
  previous sync_internal.operations%rowtype;
  target public.visita%rowtype;
  field jsonb;
  field_id text;
  answer jsonb;
  revision_value bigint;
  result_value jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if operation_id is null or visita_id is null or patch is null
     or jsonb_typeof(patch)<>'object' or octet_length(patch::text)>262144 then
    raise exception 'Invalid answer patch' using errcode='22023';
  end if;
  insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
  -- Serializes revision allocation through COMMIT, not merely sequence allocation.
  perform 1 from sync_internal.owner_cursor c where c.owner=actor for update;
  select * into previous from sync_internal.operations o
    where o.owner=actor and o.operation_id=sync_patch_answers_v1.operation_id;
  if found then
    if previous.request<>request_value then
      raise exception 'Operation ID reused with different payload' using errcode='22023';
    end if;
    return previous.result;
  end if;
  select v.* into target from public.visita v join public.expediente e on e.id=v.expediente_id
    where v.id=visita_id and e.profesional_id=actor for update of v;
  if not found then raise exception 'Visit unavailable' using errcode='42501'; end if;
  for field_id,answer in select * from jsonb_each(patch) loop
    select f.value into field from jsonb_array_elements(target.checklist_esquema_json->'sections') s,
      jsonb_array_elements(s.value->'fields') f where f.value->>'id'=field_id;
    if field is null then raise exception 'Unknown answer field' using errcode='22023'; end if;
    if answer<>'null'::jsonb then
      if field->>'type'='boolean' and answer not in ('"si"'::jsonb,'"no"'::jsonb,'"na"'::jsonb) then
        raise exception 'Invalid boolean answer' using errcode='22023';
      elsif field->>'type' in ('text','textarea','date') and jsonb_typeof(answer)<>'string' then
        raise exception 'Invalid text answer' using errcode='22023';
      elsif field->>'type' in ('number','percent') then
        if jsonb_typeof(answer) not in ('string','number') then
          raise exception 'Invalid numeric answer' using errcode='22023';
        end if;
        if answer<>'""'::jsonb then
          if field->>'type'='percent' and not ((answer#>>'{}')::numeric between 0 and 100) then
            raise exception 'Percent answer out of range' using errcode='22023';
          end if;
          if not ((answer#>>'{}')::numeric between
              coalesce((field->>'min')::numeric,-'Infinity'::numeric) and
              coalesce((field->>'max')::numeric,'Infinity'::numeric)) then
            raise exception 'Numeric answer out of range' using errcode='22023';
          end if;
        end if;
      elsif field->>'type'='select' then
        if jsonb_typeof(answer)<>'string' or not exists (
          select 1 from jsonb_array_elements_text(coalesce(field->'options','[]'::jsonb)) o
          where o=answer#>>'{}') then
          raise exception 'Invalid select answer' using errcode='22023';
        end if;
      end if;
      if field->>'type'='date' and answer<>'""'::jsonb then perform (answer#>>'{}')::date; end if;
      if field->>'type' not in ('boolean','text','textarea','date','number','percent','select') then
        raise exception 'Unsupported field type' using errcode='22023';
      end if;
    end if;
  end loop;
  target.checklist_respuestas_json := coalesce(target.checklist_respuestas_json,'{}'::jsonb)||patch;
  update public.visita v set checklist_respuestas_json=target.checklist_respuestas_json,
    checklist_completado=not exists (
      select 1 from jsonb_array_elements(target.checklist_esquema_json->'sections') s,
        jsonb_array_elements(s.value->'fields') f
      where coalesce((f.value->>'required')::boolean,false)
        and ( not (target.checklist_respuestas_json ? (f.value->>'id'))
          or target.checklist_respuestas_json->(f.value->>'id') in ('null'::jsonb,'""'::jsonb))
    ) where v.id=visita_id;
  -- El avance de obra se espeja en su columna de primera clase del modelo
  -- aprobado (avance_general, CHECK 0–100). Única fuente de verdad para el
  -- usuario: el campo del checklist; la columna es un reflejo de consulta.
  if patch ? 'avance_obra' then
    update public.visita v set avance_general=(
      case when coalesce(patch->>'avance_obra','')='' then null
      else (patch->>'avance_obra')::numeric end
    ) where v.id=visita_id;
  end if;
  update sync_internal.owner_cursor c set revision=c.revision+1 where c.owner=actor returning revision into revision_value;
  result_value:=jsonb_build_object('revision',revision_value,'visita_id',visita_id,'answers',target.checklist_respuestas_json);
  insert into sync_internal.changes values(actor,revision_value,visita_id,target.checklist_respuestas_json);
  insert into sync_internal.operations values(actor,operation_id,request_value,result_value);
  return result_value;
end $$;

create function public.sync_pull_answers_v1(after_revision bigint default 0, page_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result_value jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if after_revision is null or after_revision<0 or page_size is null or page_size<1 or page_size>500 then
    raise exception 'Invalid pagination' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.revision),'[]'::jsonb) into result_value
    from (select c.revision,c.visita_id,c.answers from sync_internal.changes c
      where c.owner=auth.uid() and c.revision>after_revision order by c.revision limit page_size) page;
  return result_value;
end $$;
revoke all on function public.sync_patch_answers_v1(uuid,uuid,jsonb) from public,anon;
revoke all on function public.sync_pull_answers_v1(bigint,integer) from public,anon;
grant execute on function public.sync_patch_answers_v1(uuid,uuid,jsonb) to authenticated;
grant execute on function public.sync_pull_answers_v1(bigint,integer) to authenticated;
