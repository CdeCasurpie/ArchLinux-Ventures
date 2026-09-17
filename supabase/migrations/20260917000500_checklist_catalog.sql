-- Initial platform catalog. Expediente copies esquema_json and never references these rows.
insert into public.plantilla_checklist(id,profesional_id,codigo,nombre,version,esquema_json)
values
('10000000-0000-4000-8000-000000000001',null,'G050','Verificación técnica · G.050',1,
 '{"version":1,"sections":[{"id":"documentos","title":"Exigencias obligatorias en obra","fields":[{"id":"licencia","label":"Licencia de edificación disponible","description":"Documento vigente en obra","type":"boolean","required":true},{"id":"planos","label":"Planos aprobados y resellados","description":"Arquitectura y especialidades","type":"boolean"},{"id":"cuaderno","label":"Cuaderno de obra actualizado","description":"Asiento correspondiente a la visita","type":"boolean"},{"id":"epi","label":"Personal con EPP completo","description":"Casco, calzado, chaleco y protección","type":"boolean"},{"id":"orden","label":"Orden y limpieza en zona de trabajo","type":"boolean"},{"id":"observacion","label":"Observaciones del checklist","type":"text"}]}]}'::jsonb),
('10000000-0000-4000-8000-000000000002',null,'SUPERVISION','Supervisión general de obra',1,
 '{"version":1,"sections":[{"id":"avance","title":"Avance y calidad","fields":[{"id":"avance","label":"Avance general observado (%)","type":"number"},{"id":"calidad","label":"Trabajos ejecutados según planos","type":"boolean"},{"id":"seguridad","label":"Condiciones de seguridad adecuadas","type":"boolean"},{"id":"observaciones","label":"Observaciones técnicas","type":"text"}]}]}'::jsonb),
('10000000-0000-4000-8000-000000000003',null,'VACIO','Checklist básico',1,
 '{"version":1,"sections":[{"id":"general","title":"Verificación general","fields":[{"id":"observaciones","label":"Observaciones de la visita","type":"text"}]}]}'::jsonb)
on conflict do nothing;
