-- Composite integrity keys must cascade too; otherwise they block the simple FKs.
alter table public.foto drop constraint foto_grupo_captura_id_visita_id_fkey,
 add foreign key (grupo_captura_id,visita_id) references public.grupo_captura(id,visita_id) on delete cascade;
alter table public.adjunto drop constraint adjunto_visita_id_expediente_id_fkey,
 add foreign key (visita_id,expediente_id) references public.visita(id,expediente_id) on delete cascade;

update public.plantilla_checklist set nombre='Plantilla básica' where profesional_id is null and codigo='VACIO' and nombre='Checklist básico';
update public.plantilla_checklist set esquema_json=replace(esquema_json::text,'Observaciones del checklist','Observaciones de la plantilla')::jsonb where profesional_id is null and codigo='G050';
