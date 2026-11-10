-- One acceptance for all metadata of a frozen capture snapshot.
create function public.sync_capture_v1(operation_id uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous sync_internal.operations%rowtype;
  visit_id uuid:=(payload->>'visita_id')::uuid; group_id uuid:=(payload->>'id')::uuid;
  item jsonb; file_id uuid; file_type public.tipo_archivo; path text; position_value integer; result_value jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if operation_id is null or payload is null or jsonb_typeof(payload)<>'object' or payload->>'profesional_id' is distinct from actor::text or not public.owns_visita(visit_id) or group_id is null or octet_length(payload::text)>2097152 then raise exception 'Invalid capture' using errcode='42501'; end if;
  insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
  perform 1 from sync_internal.owner_cursor where owner=actor for update;
  select * into previous from sync_internal.operations o where o.owner=actor and o.operation_id=sync_capture_v1.operation_id;
  if found then
    if previous.request<>payload then raise exception 'Operation ID reused' using errcode='22023'; end if;
    return previous.result;
  end if;
  if exists(select 1 from public.grupo_captura where id=group_id and visita_id<>visit_id) then raise exception 'Capture ID unavailable' using errcode='42501'; end if;
  if jsonb_typeof(payload->'audio') is distinct from 'object' or jsonb_typeof(payload->'fotos') is distinct from 'array' then raise exception 'Capture requires audio and photos' using errcode='22023'; end if;
  for item in select payload->'audio' union all select value from jsonb_array_elements(payload->'fotos') loop
    file_id:=coalesce(item->>'archivo_id',item->>'id')::uuid;
    file_type:=case when item ? 'archivo_id' then 'IMAGEN'::public.tipo_archivo else 'AUDIO'::public.tipo_archivo end;
    path:=item->>'remote_path';
    if file_id is null or path is distinct from actor::text||'/'||visit_id::text||'/'||file_id::text or item->>'size_bytes' is null or (item->>'size_bytes')::bigint not between 0 and 10000000 or item->>'checksum' is null or (item->>'checksum')!~'^[0-9a-f]{64}$' then raise exception 'Invalid capture file' using errcode='22023'; end if;
    if exists(select 1 from public.archivo where id=file_id and profesional_id<>actor) then raise exception 'File ID unavailable' using errcode='42501'; end if;
    if exists(select 1 from public.archivo where id=file_id and storage_key is not null and storage_key<>path) then raise exception 'File cannot be rebound' using errcode='22023'; end if;
    if not exists(select 1 from storage.objects where bucket_id='visita-media' and name=path) then raise exception 'Capture file not uploaded' using errcode='22023'; end if;
    insert into public.archivo(id,profesional_id,tipo,storage_key,mime_type,tamanio_bytes,checksum_sha256,estado_sincronizacion,sincronizado_at)
      values(file_id,actor,file_type,path,item->>'mime_type',(item->>'size_bytes')::bigint,item->>'checksum','SINCRONIZADO',clock_timestamp())
      on conflict(id) do update set storage_key=excluded.storage_key,mime_type=excluded.mime_type,tamanio_bytes=excluded.tamanio_bytes,checksum_sha256=excluded.checksum_sha256,estado_sincronizacion='SINCRONIZADO';
  end loop;
  select orden into position_value from public.grupo_captura where id=group_id;
  if position_value is null then select coalesce(max(orden),0)+1 into position_value from public.grupo_captura where visita_id=visit_id; end if;
  insert into public.grupo_captura(id,visita_id,orden,estado,audio_archivo_id,transcripcion_original,audio_duracion_ms,iniciado_at,confirmado_at)
    values(group_id,visit_id,position_value,'CONFIRMADO',(payload->'audio'->>'id')::uuid,payload->>'transcripcion',(payload->'audio'->>'duration_ms')::integer,(payload->>'iniciado_at')::timestamptz,(payload->>'confirmado_at')::timestamptz)
    on conflict(id) do update set audio_archivo_id=excluded.audio_archivo_id,transcripcion_original=excluded.transcripcion_original,audio_duracion_ms=excluded.audio_duracion_ms,confirmado_at=excluded.confirmado_at;
  for item in select value from jsonb_array_elements(payload->'fotos') loop
    if exists(select 1 from public.foto where id=(item->>'id')::uuid and (visita_id<>visit_id or grupo_captura_id is distinct from group_id)) then raise exception 'Photo ID unavailable' using errcode='42501'; end if;
    select orden_captura into position_value from public.foto where id=(item->>'id')::uuid;
    if position_value is null then select coalesce(max(orden_captura),0)+1 into position_value from public.foto where visita_id=visit_id; end if;
    insert into public.foto(id,visita_id,grupo_captura_id,archivo_id,orden_captura,orden_en_grupo,capturada_at,seleccionada_para_informe)
      values((item->>'id')::uuid,visit_id,group_id,(item->>'archivo_id')::uuid,position_value,(item->>'orden_en_grupo')::integer,(item->>'capturada_at')::timestamptz,true)
      on conflict(id) do update set archivo_id=excluded.archivo_id,orden_en_grupo=excluded.orden_en_grupo;
  end loop;
  update public.visita set updated_at=clock_timestamp() where id=visit_id;
  result_value:=jsonb_build_object('id',group_id,'accepted',true);
  insert into sync_internal.operations values(actor,operation_id,payload,result_value);
  return result_value;
end $$;
revoke all on function public.sync_capture_v1(uuid,jsonb) from public,anon;
grant execute on function public.sync_capture_v1(uuid,jsonb) to authenticated;
