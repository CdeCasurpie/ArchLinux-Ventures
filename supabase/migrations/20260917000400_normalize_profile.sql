create or replace function public.sync_profesional(
 base_updated_at timestamptz, nombre text, cargo_nuevo text, colegiatura text
) returns public.profesional language plpgsql security invoker set search_path='' as $$
declare current_row public.profesional;
begin
 select * into current_row from public.profesional where id=auth.uid() for update;
 if not found then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if length(trim(nombre))<2 or length(nombre)>160 then raise exception 'INVALID_NAME'; end if;
 cargo_nuevo := nullif(trim(cargo_nuevo),'');
 colegiatura := nullif(trim(colegiatura),'');
 if current_row.nombre_completo=trim(nombre) and current_row.cargo is not distinct from cargo_nuevo and current_row.nro_colegiatura is not distinct from colegiatura then return current_row; end if;
 if current_row.updated_at is distinct from base_updated_at then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 update public.profesional set nombre_completo=trim(nombre),cargo=cargo_nuevo,nro_colegiatura=colegiatura where id=auth.uid() returning * into current_row;
 return current_row;
end $$;
revoke execute on function public.sync_profesional(timestamptz,text,text,text) from public,anon;
grant execute on function public.sync_profesional(timestamptz,text,text,text) to authenticated;
