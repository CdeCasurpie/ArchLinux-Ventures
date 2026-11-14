alter table public.profesional add column firma_imagen text
  check (firma_imagen is null or (length(firma_imagen)<=160000 and firma_imagen ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'));

create function public.sync_profile_signature_v1(operation_id uuid,nombre text,cargo text,colegiatura text,firma text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous sync_internal.operations%rowtype; result_value jsonb;
 request_value jsonb:=jsonb_build_object('type','profile-signature','nombre',nombre,'cargo',cargo,'colegiatura',colegiatura,'firma',firma);
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if operation_id is null or nombre is null or length(trim(nombre)) not between 2 and 160
  or coalesce(length(cargo),0)>160 or coalesce(length(colegiatura),0)>40
  or (firma is not null and (length(firma)>160000 or firma !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')) then
  raise exception 'Invalid profile' using errcode='22023'; end if;
 insert into sync_internal.owner_cursor(owner) values(actor) on conflict do nothing;
 perform 1 from sync_internal.owner_cursor c where c.owner=actor for update;
 select * into previous from sync_internal.operations o where o.owner=actor and o.operation_id=sync_profile_signature_v1.operation_id;
 if found then
  if previous.request<>request_value then raise exception 'Operation ID reused with different payload' using errcode='22023'; end if;
  return previous.result;
 end if;
 update public.profesional p set nombre_completo=trim(nombre),cargo=nullif(trim(sync_profile_signature_v1.cargo),''),
  nro_colegiatura=nullif(trim(colegiatura),''),firma_imagen=firma where p.id=actor returning to_jsonb(p.*) into result_value;
 if result_value is null then raise exception 'Profile unavailable' using errcode='42501'; end if;
 insert into sync_internal.operations values(actor,operation_id,request_value,result_value);
 return result_value;
end $$;
revoke all on function public.sync_profile_signature_v1(uuid,text,text,text,text) from public,anon;
grant execute on function public.sync_profile_signature_v1(uuid,text,text,text,text) to authenticated;
