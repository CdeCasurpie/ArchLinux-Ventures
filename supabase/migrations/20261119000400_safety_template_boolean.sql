-- The platform safety checklist uses the standard boolean control for every
-- item. Existing expediente/visita snapshots remain independent of the catalog.
update public.plantilla_checklist template
set nombre='Seguridad y salud en obra',version=3,
 esquema_json=jsonb_set(template.esquema_json,'{sections}',(
  select jsonb_agg(jsonb_set(section.value,'{fields}',(
   select jsonb_agg((field.value-'options')||jsonb_build_object('type','boolean') order by field.ordinality)
   from jsonb_array_elements(section.value->'fields') with ordinality as field(value,ordinality)
  )) order by section.ordinality)
  from jsonb_array_elements(template.esquema_json->'sections') with ordinality as section(value,ordinality)
 ))
where template.profesional_id is null and template.codigo='VACIO';
