-- Faithful translation of approved nine-table DBML. No new domain entities.
create type public.estado_visita as enum ('BORRADOR', 'EN_CAMPO', 'EN_REVISION', 'FINALIZADA', 'ARCHIVADA');
create type public.estado_grupo_captura as enum ('ABIERTO', 'GRABANDO', 'PENDIENTE_CONFIRMACION', 'CONFIRMADO');
create type public.estado_documento as enum ('BORRADOR', 'GENERADO');
create type public.tipo_archivo as enum ('IMAGEN', 'AUDIO', 'DOCUMENTO', 'PDF');
create type public.estado_sincronizacion as enum ('LOCAL', 'PENDIENTE', 'SINCRONIZADO', 'ERROR');
create type public.tipo_adjunto as enum ('CUADERNO_OBRA', 'POLIZA', 'PLANO', 'ACTA', 'OTRO');

create table public.profesional (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  email text not null unique,
  nro_colegiatura text,
  cargo text,
  firma_archivo_id uuid,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archivo (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null,
  tipo tipo_archivo not null,
  local_uri text,
  storage_key text unique,
  nombre_original text,
  mime_type text not null,
  tamanio_bytes bigint,
  checksum_sha256 text,
  estado_sincronizacion estado_sincronizacion not null default 'LOCAL',
  created_at timestamptz not null default now(),
  sincronizado_at timestamptz
);

create table public.plantilla_checklist (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid,
  codigo text not null,
  nombre text not null,
  version integer not null,
  esquema_json jsonb not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profesional_id, codigo, version)
);

create table public.expediente (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null,
  nro_expediente text not null,
  nro_licencia text,
  modalidad text,
  entidad_destinataria text,
  fecha_emision_licencia date,
  vigencia_desde date,
  vigencia_hasta date,
  propietario text,
  ubicacion text not null,
  distrito text,
  provincia text,
  departamento text,
  tipo_obra text,
  uso_predio text,
  detalle_obra text,
  valor_obra decimal,
  total_visitas_programadas integer,
  responsable_obra_nombre text,
  responsable_obra_colegiatura text,
  poliza_car_json jsonb,
  datos_cabecera_extra jsonb,
  checklist_nombre text not null,
  checklist_esquema_json jsonb not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profesional_id, nro_expediente)
);

create table public.visita (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null,
  nro_visita integer not null,
  codigo_informe text,
  fecha date not null,
  hora_inicio timestamptz,
  hora_fin timestamptz,
  estado estado_visita not null default 'BORRADOR',
  checklist_nombre text not null,
  checklist_esquema_json jsonb not null,
  checklist_respuestas_json jsonb not null,
  checklist_completado boolean not null default false,
  avance_general decimal,
  nivel_riesgo text,
  calificacion text,
  responsable_obra_nombre text,
  responsable_obra_colegiatura text,
  fecha_entrega_residente date,
  asiento_cuaderno_obra text,
  proxima_visita_fecha date,
  conclusiones_texto text,
  conclusiones_transcripcion text,
  conclusiones_audio_archivo_id uuid,
  documento_json jsonb not null,
  estado_documento estado_documento not null default 'BORRADOR',
  pdf_archivo_id uuid,
  generado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expediente_id, nro_visita)
);

create table public.grupo_captura (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null,
  orden integer not null,
  estado estado_grupo_captura not null default 'ABIERTO',
  audio_archivo_id uuid,
  transcripcion_parcial text,
  transcripcion_original text,
  comentario_editado text,
  audio_duracion_ms integer,
  iniciado_at timestamptz not null,
  confirmado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visita_id, orden)
);

create table public.foto (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null,
  grupo_captura_id uuid,
  archivo_id uuid not null unique,
  orden_captura integer not null,
  orden_en_grupo integer,
  hash_perceptual text,
  seleccionada_para_informe boolean not null default true,
  capturada_at timestamptz not null,
  latitud decimal,
  longitud decimal,
  created_at timestamptz not null default now(),
  unique (visita_id, orden_captura),
  unique (grupo_captura_id, orden_en_grupo)
);

create table public.firmante_visita (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null,
  profesional_id uuid,
  firma_archivo_id uuid,
  rol text not null,
  nombre_impreso text not null,
  cargo_impreso text,
  colegiatura_impresa text,
  orden integer not null,
  repetir_en_pie_pagina boolean not null default true,
  created_at timestamptz not null default now(),
  unique (visita_id, orden)
);

create table public.adjunto (
  id uuid primary key default gen_random_uuid(),
  expediente_id uuid not null,
  visita_id uuid,
  archivo_id uuid not null,
  tipo tipo_adjunto not null,
  titulo text not null,
  descripcion text,
  orden integer not null,
  incluir_en_informe boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profesional add foreign key (firma_archivo_id) references public.archivo (id);
alter table public.archivo add foreign key (profesional_id) references public.profesional (id);
alter table public.plantilla_checklist add foreign key (profesional_id) references public.profesional (id);
alter table public.expediente add foreign key (profesional_id) references public.profesional (id);
alter table public.visita add foreign key (expediente_id) references public.expediente (id);
alter table public.visita add foreign key (conclusiones_audio_archivo_id) references public.archivo (id);
alter table public.visita add foreign key (pdf_archivo_id) references public.archivo (id);
alter table public.grupo_captura add foreign key (visita_id) references public.visita (id);
alter table public.grupo_captura add foreign key (audio_archivo_id) references public.archivo (id);
alter table public.foto add foreign key (visita_id) references public.visita (id);
alter table public.foto add foreign key (grupo_captura_id) references public.grupo_captura (id);
alter table public.foto add foreign key (archivo_id) references public.archivo (id);
alter table public.firmante_visita add foreign key (visita_id) references public.visita (id);
alter table public.firmante_visita add foreign key (profesional_id) references public.profesional (id);
alter table public.firmante_visita add foreign key (firma_archivo_id) references public.archivo (id);
alter table public.adjunto add foreign key (expediente_id) references public.expediente (id);
alter table public.adjunto add foreign key (visita_id) references public.visita (id);
alter table public.adjunto add foreign key (archivo_id) references public.archivo (id);
alter table public.profesional add foreign key (id) references auth.users(id);
