-- The intent survives a network failure. Storage is removed via its API (never
-- by deleting storage.objects rows, which would orphan the actual binaries).
create table sync_internal.account_deletions (
 owner uuid primary key references public.profesional(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table sync_internal.account_deletions enable row level security;

-- Cascade account ownership, including protocol journals with document content.
do $$
declare item record; action text;
begin
 for item in select c.conrelid::regclass as relation,c.conname,pg_get_constraintdef(c.oid) as definition
  from pg_constraint c where c.contype='f' and (
   c.confrelid='public.profesional'::regclass or
   (c.conrelid='public.profesional'::regclass and c.confrelid='auth.users'::regclass)
  ) loop
   action:=case when item.relation='public.firmante_visita'::regclass then 'SET NULL' else 'CASCADE' end;
   execute format('alter table %s drop constraint %I',item.relation,item.conname);
   execute format('alter table %s add constraint %I %s ON DELETE %s',item.relation,item.conname,regexp_replace(item.definition,' ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)',''),action);
 end loop;
end $$;
alter table public.profesional drop constraint profesional_firma_archivo_id_fkey,
 add foreign key(firma_archivo_id) references public.archivo(id) on delete set null;
alter table public.expediente drop constraint expediente_checklist_template_id_fkey,
 add foreign key(checklist_template_id) references public.plantilla_checklist(id) on delete set null;
alter table public.visita drop constraint visita_checklist_template_id_fkey,
 add foreign key(checklist_template_id) references public.plantilla_checklist(id) on delete set null;

-- Skip replica generation while the owner is being erased. This also avoids
-- recreating owner_cursor during cascading deletes from auth.users.
create or replace function sync_internal.capture_workspace_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; owner_id uuid; revision_id bigint; entity_name text;
begin
 if TG_OP='DELETE' then value:=to_jsonb(old); else value:=to_jsonb(new); end if;
 entity_name:=case TG_TABLE_NAME when 'plantilla_checklist' then 'plantilla' else TG_TABLE_NAME end;
 if TG_TABLE_NAME in ('expediente','plantilla_checklist') then owner_id:=(value->>'profesional_id')::uuid;
 else select profesional_id into owner_id from public.expediente where id=(value->>'expediente_id')::uuid; end if;
 if owner_id is not null and exists(select 1 from public.profesional where id=owner_id)
  and not exists(select 1 from sync_internal.account_deletions where owner=owner_id) then
  insert into sync_internal.owner_cursor(owner) values(owner_id) on conflict do nothing;
  update sync_internal.owner_cursor set revision=revision+1 where owner=owner_id returning revision into revision_id;
  insert into sync_internal.replica_events values(owner_id,revision_id,entity_name,(value->>'id')::uuid,TG_OP='DELETE',value);
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;

create function sync_internal.guard_account_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is not null then
  -- Serialize object publication with the deletion intent. Deletes remain allowed.
  perform 1 from public.profesional where id=actor for share;
  if not found or exists(select 1 from sync_internal.account_deletions where owner=actor) then
   raise exception 'Account deletion in progress; uploads disabled' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create trigger account_upload_guard before insert or update on storage.objects
 for each row execute function sync_internal.guard_account_upload();

create function public.begin_account_deletion_v1(confirmation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result_value jsonb;
begin
 if actor is null or confirmation is distinct from 'ELIMINAR' then raise exception 'Explicit confirmation required' using errcode='42501'; end if;
 perform 1 from public.profesional where id=actor for update;
 if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
 insert into sync_internal.account_deletions(owner) values(actor) on conflict do nothing;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name)),'[]') into result_value from (
  select bucket_id,name from storage.objects where split_part(name,'/',1)=actor::text or owner_id=actor::text order by bucket_id,name limit 100
 ) files;
 return result_value;
end $$;

create function public.delete_my_account_v1(confirmation text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or confirmation is distinct from 'ELIMINAR' then raise exception 'Explicit confirmation required' using errcode='42501'; end if;
 perform 1 from public.profesional where id=actor for update;
 if not found or not exists(select 1 from sync_internal.account_deletions where owner=actor) then raise exception 'Start account deletion first' using errcode='42501'; end if;
 if exists(select 1 from storage.objects where split_part(name,'/',1)=actor::text or owner_id=actor::text) then raise exception 'Remove account storage before deleting identity' using errcode='22023'; end if;
 -- Remove workspace before archivo, since photos/audio/signatures reference it.
 delete from public.expediente where profesional_id=actor;
 delete from public.plantilla_checklist where profesional_id=actor;
 update public.profesional set firma_archivo_id=null where id=actor;
 delete from public.archivo where profesional_id=actor;
 delete from auth.users where id=actor;
end $$;
revoke all on function public.begin_account_deletion_v1(text),public.delete_my_account_v1(text) from public,anon;
grant execute on function public.begin_account_deletion_v1(text),public.delete_my_account_v1(text) to authenticated;
