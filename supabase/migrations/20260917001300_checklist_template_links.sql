-- La migración 001 ya estaba aplicada en remoto cuando se añadieron estos enlaces.
-- Aplicarlos de forma incremental también permite actualizar bases existentes,
-- sin depender de resetear la BD ni de volver a ejecutar la migración de dominio.
alter table public.expediente add column if not exists checklist_template_id uuid;
alter table public.visita add column if not exists checklist_template_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expediente'::regclass
      and conname = 'expediente_checklist_template_id_fkey'
  ) then
    alter table public.expediente
      add constraint expediente_checklist_template_id_fkey
      foreign key (checklist_template_id) references public.plantilla_checklist(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.visita'::regclass
      and conname = 'visita_checklist_template_id_fkey'
  ) then
    alter table public.visita
      add constraint visita_checklist_template_id_fkey
      foreign key (checklist_template_id) references public.plantilla_checklist(id);
  end if;
end $$;
