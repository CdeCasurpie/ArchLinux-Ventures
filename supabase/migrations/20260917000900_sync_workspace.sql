-- Explicit workspace mutation endpoint. No arbitrary tables/columns from clients.
create table sync_internal.entity_changes (
  owner uuid not null references public.profesional(id),
  revision bigint not null,
  entity text not null,
  entity_id uuid not null,
  record jsonb not null,
  primary key(owner,revision)
);
alter table sync_internal.entity_changes enable row level security;

create function public.sync_workspace_v1(operation_id uuid, entity text, entity_id uuid, mutation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  request_value jsonb:=jsonb_build_object('type','workspace','entity',entity,'id',entity_id,'mutation',mutation,'payload',payload);
  previous sync_internal.operations%rowtype;
  allowed text[];
  existing jsonb;
  values_json jsonb;
  assignments text;
  current_record jsonb;
  result_value jsonb;
  next_revision bigint;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if operation_id is null or entity_id is null or entity is null or entity not in ('expediente','visita')
    or mutation is null or mutation not in ('create','patch') or payload is null
    or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2097152 then
    raise exception 'Invalid workspace mutation' using errcode='22023';
  end if;
  insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
  perform 1 from sync_internal.owner_cursor c where c.owner=actor for update;
  select * into previous from sync_internal.operations o where o.owner=actor and o.operation_id=sync_workspace_v1.operation_id;
  if found then
    if previous.request<>request_value then raise exception 'Operation ID reused with different payload' using errcode='22023'; end if;
    return previous.result;
  end if;
  if entity='expediente' then
    allowed:=array['nro_expediente','nro_licencia','modalidad','entidad_destinataria','fecha_emision_licencia','vigencia_desde','vigencia_hasta','propietario','ubicacion','distrito','provincia','departamento','tipo_obra','uso_predio','detalle_obra','valor_obra','total_visitas_programadas','responsable_obra_nombre','responsable_obra_colegiatura','poliza_car_json','datos_cabecera_extra','checklist_nombre','checklist_esquema_json','activo'];
    select to_jsonb(e.*) into existing from public.expediente e where e.id=entity_id and e.profesional_id=actor;
  else
    allowed:=array['codigo_informe','fecha','estado','checklist_nombre','checklist_esquema_json','documento_json','estado_documento','responsable_obra_nombre','responsable_obra_colegiatura'];
    select to_jsonb(v.*) into existing from public.visita v join public.expediente e on e.id=v.expediente_id where v.id=entity_id and e.profesional_id=actor;
  end if;
  if mutation='create' then
    allowed:=allowed||array['id','created_at','updated_at'];
    if entity='expediente' then allowed:=allowed||array['profesional_id'];
    else allowed:=allowed||array['expediente_id','nro_visita','checklist_respuestas_json','checklist_completado','pdf_archivo_id']; end if;
  end if;
  if exists(select 1 from jsonb_object_keys(payload) k where not (k=any(allowed))) then
    raise exception 'Unsupported workspace field' using errcode='22023';
  end if;
  if mutation='patch' and existing is null then raise exception 'Entity unavailable' using errcode='42501'; end if;
  if mutation='create' and existing is null then
    if payload->>'id' is distinct from entity_id::text then raise exception 'ID mismatch' using errcode='22023'; end if;
    if entity='expediente' then
      if payload->>'profesional_id' is distinct from actor::text then raise exception 'Owner mismatch' using errcode='42501'; end if;
      values_json:=jsonb_build_object('activo',true)||payload;
    else
      if not exists(select 1 from public.expediente e where e.id=(payload->>'expediente_id')::uuid and e.profesional_id=actor) then raise exception 'Parent unavailable' using errcode='42501'; end if;
      values_json:=jsonb_build_object('estado','BORRADOR','estado_documento','BORRADOR','checklist_completado',false,'checklist_respuestas_json','{}'::jsonb,'documento_json','{}'::jsonb)||payload;
      -- Preserve requested numbering when available; never drop a colliding visit.
      if exists(select 1 from public.visita v where v.expediente_id=(payload->>'expediente_id')::uuid and v.nro_visita=(payload->>'nro_visita')::integer) then
        values_json:=values_json||jsonb_build_object('nro_visita',(select coalesce(max(v.nro_visita),0)+1 from public.visita v where v.expediente_id=(payload->>'expediente_id')::uuid));
      end if;
      if values_json->>'pdf_archivo_id' is not null then raise exception 'PDF uploads are not supported' using errcode='22023'; end if;
    end if;
    values_json:=values_json||jsonb_build_object('created_at',clock_timestamp(),'updated_at',clock_timestamp());
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) returning to_jsonb(%I.*)',entity,entity,entity) into current_record using values_json;
  elsif mutation='patch' then
    select string_agg(format('%I = source.%I',k,k),',') into assignments from jsonb_object_keys(payload) k;
    if assignments is not null then
      execute format('update public.%I as target set %s from jsonb_populate_record(null::public.%I,$1) source where target.id=$2 returning to_jsonb(target.*)',entity,assignments,entity) into current_record using payload,entity_id;
    else current_record:=existing; end if;
  else current_record:=existing;
  end if;
  update sync_internal.owner_cursor c set revision=c.revision+1 where c.owner=actor returning revision into next_revision;
  result_value:=jsonb_build_object('revision',next_revision,'entity',entity,'record',current_record);
  insert into sync_internal.entity_changes values(actor,next_revision,entity,entity_id,current_record);
  insert into sync_internal.operations values(actor,operation_id,request_value,result_value);
  return result_value;
end $$;
revoke all on function public.sync_workspace_v1(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function public.sync_workspace_v1(uuid,text,uuid,text,jsonb) to authenticated;
