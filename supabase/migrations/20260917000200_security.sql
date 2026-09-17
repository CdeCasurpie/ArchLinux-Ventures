
-- Explicit grants and row-level ownership for all nine domain tables.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
create or replace function public.owns_expediente(target uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.expediente where id=target and profesional_id=auth.uid())
$$;
create or replace function public.owns_visita(target uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.visita where id=target and public.owns_expediente(expediente_id))
$$;
create or replace function public.owns_archivo(target uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select target is null or exists(select 1 from public.archivo where id=target and profesional_id=auth.uid())
$$;

alter table public.profesional enable row level security;
grant select, update on public.profesional to authenticated;
create policy own_profile on public.profesional for select to authenticated using(id=auth.uid());
create policy update_profile on public.profesional for update to authenticated
using(id=auth.uid()) with check(id=auth.uid() and public.owns_archivo(firma_archivo_id));

alter table public.archivo enable row level security;
grant select,insert,update,delete on public.archivo to authenticated;
create policy own_files on public.archivo for all to authenticated
using(profesional_id=auth.uid()) with check(profesional_id=auth.uid() and (storage_key is null or split_part(storage_key,'/',1)=auth.uid()::text));

alter table public.plantilla_checklist enable row level security;
grant select,insert,update,delete on public.plantilla_checklist to authenticated;
create policy read_templates on public.plantilla_checklist for select to authenticated using(profesional_id is null or profesional_id=auth.uid());
create policy own_templates on public.plantilla_checklist for all to authenticated using(profesional_id=auth.uid()) with check(profesional_id=auth.uid());

alter table public.expediente enable row level security;
grant select,insert,update,delete on public.expediente to authenticated;
create policy own_cases on public.expediente for all to authenticated using(profesional_id=auth.uid()) with check(profesional_id=auth.uid());

alter table public.visita enable row level security;
grant select,insert,update,delete on public.visita to authenticated;
create policy own_visits on public.visita for all to authenticated using(public.owns_expediente(expediente_id))
with check(public.owns_expediente(expediente_id) and public.owns_archivo(conclusiones_audio_archivo_id) and public.owns_archivo(pdf_archivo_id));

alter table public.grupo_captura enable row level security;
grant select,insert,update,delete on public.grupo_captura to authenticated;
create policy own_groups on public.grupo_captura for all to authenticated using(public.owns_visita(visita_id))
with check(public.owns_visita(visita_id) and public.owns_archivo(audio_archivo_id));

alter table public.foto enable row level security;
grant select,insert,update,delete on public.foto to authenticated;
create policy own_photos on public.foto for all to authenticated using(public.owns_visita(visita_id))
with check(public.owns_visita(visita_id) and public.owns_archivo(archivo_id) and
 (grupo_captura_id is null or exists(select 1 from public.grupo_captura g where g.id=grupo_captura_id and g.visita_id=foto.visita_id)));

alter table public.firmante_visita enable row level security;
grant select,insert,update,delete on public.firmante_visita to authenticated;
create policy own_signers on public.firmante_visita for all to authenticated using(public.owns_visita(visita_id))
with check(public.owns_visita(visita_id) and public.owns_archivo(firma_archivo_id) and (profesional_id is null or profesional_id=auth.uid()));

alter table public.adjunto enable row level security;
grant select,insert,update,delete on public.adjunto to authenticated;
create policy own_attachments on public.adjunto for all to authenticated using(public.owns_expediente(expediente_id))
with check(public.owns_expediente(expediente_id) and public.owns_archivo(archivo_id) and
 (visita_id is null or exists(select 1 from public.visita v where v.id=visita_id and v.expediente_id=adjunto.expediente_id)));

create index on public.expediente(profesional_id);
create index on public.archivo(profesional_id);
create index on public.visita(expediente_id);
create index on public.grupo_captura(visita_id);
create index on public.foto(visita_id);
create index on public.firmante_visita(visita_id);
create index on public.adjunto(expediente_id);
alter table public.expediente add check(vigencia_hasta is null or vigencia_desde is null or vigencia_hasta>=vigencia_desde);
alter table public.visita add check(avance_general is null or avance_general between 0 and 100);
alter table public.visita add check(nro_visita>0);
alter table public.archivo add check(tamanio_bytes is null or tamanio_bytes>=0);
create unique index platform_template_version on public.plantilla_checklist(codigo,version) where profesional_id is null;

-- Trusted Auth trigger: users cannot choose someone else's profile id.
create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profesional(id,email,nombre_completo)
 values(new.id,new.email,coalesce(nullif(trim(new.raw_user_meta_data->>'nombre_completo'),''),'Profesional'));
 return new;
end $$;
create trigger create_profesional after insert on auth.users for each row execute function public.on_auth_user_created();
insert into public.profesional(id,email,nombre_completo)
select id,email,coalesce(nullif(trim(raw_user_meta_data->>'nombre_completo'),''),'Profesional') from auth.users where email is not null on conflict(id) do nothing;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path='' as $$ begin new.updated_at=clock_timestamp(); return new; end $$;
create trigger touch_profile before update on public.profesional for each row execute function public.touch_updated_at();
create trigger touch_case before update on public.expediente for each row execute function public.touch_updated_at();
create trigger touch_visit before update on public.visita for each row execute function public.touch_updated_at();
create trigger touch_group before update on public.grupo_captura for each row execute function public.touch_updated_at();

-- First vertical sync: compare-and-set + replay recognition, no extra domain tables.
-- Raw updated_at strings must be round-tripped, preserving PostgreSQL microseconds.
create or replace function public.sync_profesional(
 base_updated_at timestamptz, nombre text, cargo_nuevo text, colegiatura text
) returns public.profesional language plpgsql security invoker set search_path='' as $$
declare current_row public.profesional;
begin
 select * into current_row from public.profesional where id=auth.uid() for update;
 if not found then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if length(trim(nombre))<2 or length(nombre)>160 then raise exception 'INVALID_NAME'; end if;
 if current_row.nombre_completo=trim(nombre) and current_row.cargo is not distinct from cargo_nuevo and current_row.nro_colegiatura is not distinct from colegiatura then return current_row; end if;
 if current_row.updated_at is distinct from base_updated_at then raise exception 'SYNC_CONFLICT' using errcode='40001'; end if;
 update public.profesional set nombre_completo=trim(nombre),cargo=cargo_nuevo,nro_colegiatura=colegiatura where id=auth.uid() returning * into current_row;
 return current_row;
end $$;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.owns_expediente(uuid),public.owns_visita(uuid),public.owns_archivo(uuid),public.sync_profesional(timestamptz,text,text,text) to authenticated;

-- Private bucket metadata. Objects are uploaded/deleted through Storage API.
insert into storage.buckets(id,name,public,file_size_limit) values('visita-media','visita-media',false,52428800) on conflict(id) do nothing;
create policy media_select on storage.objects for select to authenticated
using(bucket_id='visita-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_insert on storage.objects for insert to authenticated
with check(bucket_id='visita-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_update on storage.objects for update to authenticated
using(bucket_id='visita-media' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='visita-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
using(bucket_id='visita-media' and (storage.foldername(name))[1]=auth.uid()::text);
