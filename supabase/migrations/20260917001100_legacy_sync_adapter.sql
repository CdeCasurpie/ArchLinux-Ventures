-- Convert frozen legacy snapshots server-side without recomputing requests on retry.
create function public.sync_legacy_workspace_v1(operation_id uuid,entity text,entity_id uuid,record jsonb,preserve_answers boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing jsonb; prior sync_internal.operations%rowtype;
  request_value jsonb:=jsonb_build_object('type','legacy','entity',entity,'id',entity_id,'record',record,'preserve_answers',preserve_answers);
  permitted text[]; payload jsonb; result_value jsonb; mode text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if entity is null or entity not in ('expediente','visita') or operation_id is null or entity_id is null or record is null or jsonb_typeof(record)<>'object' or record->>'id' is distinct from entity_id::text then raise exception 'Invalid legacy command' using errcode='22023'; end if;
  insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
  perform 1 from sync_internal.owner_cursor where owner=actor for update;
  select * into prior from sync_internal.operations o where o.owner=actor and o.operation_id=sync_legacy_workspace_v1.operation_id;
  if found then
    if prior.request<>request_value then raise exception 'Operation ID reused' using errcode='22023'; end if;
    return prior.result;
  end if;
  if entity='expediente' then
    select to_jsonb(e.*) into existing from public.expediente e where e.id=entity_id;
    if existing is not null and existing->>'profesional_id'<>actor::text then raise exception 'Entity unavailable' using errcode='42501'; end if;
    permitted:=array['nro_expediente','nro_licencia','modalidad','entidad_destinataria','fecha_emision_licencia','vigencia_desde','vigencia_hasta','propietario','ubicacion','distrito','provincia','departamento','tipo_obra','uso_predio','detalle_obra','valor_obra','total_visitas_programadas','responsable_obra_nombre','responsable_obra_colegiatura','poliza_car_json','datos_cabecera_extra','checklist_nombre','checklist_esquema_json','activo'];
  else
    select to_jsonb(v.*) into existing from public.visita v where v.id=entity_id;
    if existing is not null and not public.owns_visita(entity_id) then raise exception 'Entity unavailable' using errcode='42501'; end if;
    permitted:=array['codigo_informe','fecha','estado','checklist_nombre','checklist_esquema_json','documento_json','estado_documento','responsable_obra_nombre','responsable_obra_colegiatura'];
  end if;
  mode:=case when existing is null then 'create' else 'patch' end;
  if existing is null then
    permitted:=permitted||array['id','created_at','updated_at'];
    permitted:=permitted||case when entity='expediente' then array['profesional_id'] else array['expediente_id','nro_visita','checklist_respuestas_json','checklist_completado','pdf_archivo_id'] end;
  end if;
  -- Unknown non-null edits cannot be silently discarded by a compatibility adapter.
  if exists(select 1 from jsonb_each(record) item where not(item.key=any(permitted||array['id','profesional_id','expediente_id','nro_visita','created_at','updated_at','checklist_respuestas_json','checklist_completado','pdf_archivo_id'])) and item.value<>'null'::jsonb and item.value is distinct from existing->item.key) then
    raise exception 'Legacy fields require manual recovery; local command retained' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into payload from jsonb_each(record) where key=any(permitted);
  result_value:=public.sync_workspace_v1(md5(operation_id::text||':workspace')::uuid,entity,entity_id,mode,payload);
  if entity='visita' and existing is not null and not coalesce(preserve_answers,false) then
    perform public.sync_patch_answers_v1(md5(operation_id::text||':answers')::uuid,entity_id,coalesce(record->'checklist_respuestas_json','{}'::jsonb));
  end if;
  insert into sync_internal.operations values(actor,operation_id,request_value,result_value);
  return result_value;
end $$;
revoke all on function public.sync_legacy_workspace_v1(uuid,text,uuid,jsonb,boolean) from public,anon;
grant execute on function public.sync_legacy_workspace_v1(uuid,text,uuid,jsonb,boolean) to authenticated;
