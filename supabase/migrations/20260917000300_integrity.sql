-- Structural invariants also apply if linked rows are moved later.
alter table public.grupo_captura add unique(id,visita_id);
alter table public.foto add foreign key(grupo_captura_id,visita_id) references public.grupo_captura(id,visita_id);
alter table public.visita add unique(id,expediente_id);
alter table public.adjunto add foreign key(visita_id,expediente_id) references public.visita(id,expediente_id);
revoke update on public.profesional from authenticated;
grant update(nombre_completo,cargo,nro_colegiatura,firma_archivo_id) on public.profesional to authenticated;
