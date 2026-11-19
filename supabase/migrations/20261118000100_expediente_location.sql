alter table public.expediente
 add column urbanizacion text,
 add column manzana text,
 add column lote text,
 add column zonificacion text;

-- Keep the deployed mutation protocol (including template links) and extend
-- its explicit field allowlist. Replica records already serialize the full row.
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.sync_workspace_v1(uuid,text,uuid,text,jsonb)'::regprocedure);
 if position('''departamento'',''tipo_obra''' in definition) = 0 then
  raise exception 'Workspace location allowlist not found';
 end if;
 execute replace(definition, '''departamento'',''tipo_obra''',
  '''departamento'',''urbanizacion'',''manzana'',''lote'',''zonificacion'',''tipo_obra''');
end $$;
