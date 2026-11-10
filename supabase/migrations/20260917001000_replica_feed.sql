-- Capture all workspace writes, including older clients, for an incremental replica.
create table sync_internal.replica_events (
  owner uuid not null references public.profesional(id),
  revision bigint not null,
  entity text not null,
  entity_id uuid not null,
  deleted boolean not null,
  record jsonb not null,
  primary key(owner,revision)
);
alter table sync_internal.replica_events enable row level security;
create function sync_internal.capture_workspace_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; owner_id uuid; revision_id bigint;
begin
  if TG_OP='DELETE' then value:=to_jsonb(old); else value:=to_jsonb(new); end if;
  if TG_TABLE_NAME='expediente' then owner_id:=(value->>'profesional_id')::uuid;
  else select profesional_id into owner_id from public.expediente where id=(value->>'expediente_id')::uuid; end if;
  if owner_id is not null then
    insert into sync_internal.owner_cursor(owner) values(owner_id) on conflict do nothing;
    update sync_internal.owner_cursor set revision=revision+1 where owner=owner_id returning revision into revision_id;
    insert into sync_internal.replica_events values(owner_id,revision_id,TG_TABLE_NAME,(value->>'id')::uuid,TG_OP='DELETE',value);
  end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger replica_case after insert or update or delete on public.expediente for each row execute function sync_internal.capture_workspace_change();
create trigger replica_visit after insert or update or delete on public.visita for each row execute function sync_internal.capture_workspace_change();
create function public.sync_replica_head_v1() returns bigint language sql stable security definer set search_path='' as $$
  select coalesce((select revision from sync_internal.owner_cursor where owner=auth.uid()),0)
$$;
create function public.sync_replica_pull_v1(after_revision bigint,page_size integer default 200) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result_value jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if after_revision is null or after_revision<0 or page_size is null or page_size<1 or page_size>500 then raise exception 'Invalid cursor' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.revision),'[]'::jsonb) into result_value
    from (select revision,entity,entity_id,deleted,record from sync_internal.replica_events
      where owner=auth.uid() and revision>after_revision order by revision limit page_size) page;
  return result_value;
end $$;
revoke all on function public.sync_replica_head_v1() from public,anon;
revoke all on function public.sync_replica_pull_v1(bigint,integer) from public,anon;
grant execute on function public.sync_replica_head_v1() to authenticated;
grant execute on function public.sync_replica_pull_v1(bigint,integer) to authenticated;
