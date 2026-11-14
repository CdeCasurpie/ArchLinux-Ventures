-- Ownership edges cascade; shared templates and professional signatures survive.
alter table public.visita drop constraint visita_expediente_id_fkey,
 add foreign key (expediente_id) references public.expediente(id) on delete cascade;
alter table public.grupo_captura drop constraint grupo_captura_visita_id_fkey,
 add foreign key (visita_id) references public.visita(id) on delete cascade;
alter table public.foto drop constraint foto_visita_id_fkey,
 add foreign key (visita_id) references public.visita(id) on delete cascade;
alter table public.foto drop constraint foto_grupo_captura_id_fkey,
 add foreign key (grupo_captura_id) references public.grupo_captura(id) on delete cascade;
alter table public.firmante_visita drop constraint firmante_visita_visita_id_fkey,
 add foreign key (visita_id) references public.visita(id) on delete cascade;
alter table public.adjunto drop constraint adjunto_expediente_id_fkey,
 add foreign key (expediente_id) references public.expediente(id) on delete cascade;
alter table public.adjunto drop constraint adjunto_visita_id_fkey,
 add foreign key (visita_id) references public.visita(id) on delete cascade;

create function public.sync_delete_workspace_v1(operation_id uuid,entity text,entity_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous sync_internal.operations%rowtype; result_value jsonb;
 request_value jsonb:=jsonb_build_object('type','delete','entity',entity,'id',entity_id);
 visit_ids uuid[]; file_ids uuid[]; paths jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if operation_id is null or entity_id is null or entity is null or entity not in ('expediente','visita') then
  raise exception 'Invalid deletion' using errcode='22023'; end if;
 insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
 perform 1 from sync_internal.owner_cursor c where c.owner=actor for update;
 select * into previous from sync_internal.operations o where o.owner=actor and o.operation_id=sync_delete_workspace_v1.operation_id;
 if found then
  if previous.request<>request_value then raise exception 'Operation ID reused with different payload' using errcode='22023'; end if;
  return previous.result;
 end if;
 if entity='expediente' then
  if exists(select 1 from public.expediente e where e.id=entity_id and e.profesional_id<>actor) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(array_agg(v.id),'{}') into visit_ids from public.visita v join public.expediente e on e.id=v.expediente_id where e.id=entity_id and e.profesional_id=actor;
 else
  if exists(select 1 from public.visita v join public.expediente e on e.id=v.expediente_id where v.id=entity_id and e.profesional_id<>actor) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(array_agg(v.id),'{}') into visit_ids from public.visita v join public.expediente e on e.id=v.expediente_id where v.id=entity_id and e.profesional_id=actor;
 end if;
 select coalesce(array_agg(distinct id) filter(where id is not null),'{}') into file_ids from (
  select f.archivo_id id from public.foto f where f.visita_id=any(visit_ids)
  union select g.audio_archivo_id from public.grupo_captura g where g.visita_id=any(visit_ids)
  union select v.pdf_archivo_id from public.visita v where v.id=any(visit_ids)
  union select v.conclusiones_audio_archivo_id from public.visita v where v.id=any(visit_ids)
  union select f.firma_archivo_id from public.firmante_visita f where f.visita_id=any(visit_ids)
  union select a.archivo_id from public.adjunto a where a.visita_id=any(visit_ids) or (entity='expediente' and a.expediente_id=entity_id)
 ) files;
 if entity='expediente' then delete from public.expediente e where e.id=entity_id and e.profesional_id=actor;
 else delete from public.visita v where v.id=any(visit_ids); end if;
 -- Do not remove a file still referenced by a profile or another document.
 with removed as (
  delete from public.archivo a where a.id=any(file_ids) and a.profesional_id=actor
   and not exists(select 1 from public.profesional p where p.firma_archivo_id=a.id)
   and not exists(select 1 from public.foto f where f.archivo_id=a.id)
   and not exists(select 1 from public.grupo_captura g where g.audio_archivo_id=a.id)
   and not exists(select 1 from public.visita v where v.pdf_archivo_id=a.id or v.conclusiones_audio_archivo_id=a.id)
   and not exists(select 1 from public.firmante_visita f where f.firma_archivo_id=a.id)
   and not exists(select 1 from public.adjunto d where d.archivo_id=a.id)
  returning a.storage_key
 ) select coalesce(jsonb_agg(storage_key) filter(where storage_key is not null),'[]') into paths from removed;
 result_value:=jsonb_build_object('deleted',entity_id,'storage_paths',paths);
 -- Retried requests return the same paths until the client cleans Storage via its API.
 insert into sync_internal.operations values(actor,operation_id,request_value,result_value);
 return result_value;
end $$;
revoke all on function public.sync_delete_workspace_v1(uuid,text,uuid) from public,anon;
grant execute on function public.sync_delete_workspace_v1(uuid,text,uuid) to authenticated;
