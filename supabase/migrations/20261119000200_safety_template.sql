-- Replace the simplest platform template. Existing case/visit snapshots retain
-- their original fields and answers; new uses and duplicates receive this schema.
update public.plantilla_checklist set version=2, esquema_json=jsonb_build_object(
 'version',2,'sections',jsonb_build_array(jsonb_build_object(
  'id','seguridad_obra','title','Seguridad y salud en obra','fields',(
   select jsonb_agg(jsonb_build_object('id',item.id,'label',item.label,'description',item.description,'type','select','options',jsonb_build_array('Cumple','No cumple','No aplica')) order by item.orden)
   from (values
    (1,'cerco','Cerco perimetral de obra','Verificar su instalación y estado.'),
    (2,'mallas','Mallas de seguridad','Sujetas con bastidores verticales y horizontales, colocadas sobre el cerco perimetral de obra, frontal y hacia colindantes.'),
    (3,'areas_trabajo','Organización de las áreas de trabajo','Caseta, servicios de bienestar, almacenamiento de insumos, almacenes, área de operaciones de obra, área de prefabricación y/o habilitación de materiales, acopio temporal de residuos y área de guardianía.'),
    (4,'electricas','Instalaciones eléctricas provisionales','Norma G.050.'),
    (5,'accesos_obra','Accesos y vías de circulación dentro de la obra','Vías de circulación peatonal, vías de circulación de maquinaria, señalización de seguridad y prevención de riesgos.'),
    (6,'accesos_publica','Accesos y vías de circulación en la vía pública','Vías de circulación peatonal, vías de circulación vehicular, señalización de seguridad y prevención de riesgos.'),
    (7,'supervisor','Supervisor de prevención de riesgos en obra','Para obras con menos de 20 trabajadores.'),
    (8,'comite','Comité Técnico de Seguridad y Salud en el Trabajo (CTSST)','Para obras con más de 20 trabajadores: jefe de obra, jefe de Prevención de Riesgos de la obra y 02 representantes de los trabajadores.'),
    (9,'plan_sst','Plan de Seguridad y Salud en el Trabajo','Verificar su disponibilidad e implementación.'),
    (10,'capacitacion','Programa de capacitación y sensibilización','Charla de inducción para el personal que ingresa a la obra, charlas semanales y de inicio de jornada.'),
    (11,'epp_basico','Equipo de Protección Individual: básico','Indumentaria de trabajo, casco de seguridad, calzado de seguridad, protectores visuales y guantes de seguridad.'),
    (12,'epp_especial','Equipo de Protección Individual: especial','Protección respiratoria, protectores de oídos, arnés de seguridad, trabajos en caliente y otros.'),
    (13,'protecciones','Protecciones colectivas','Internas y externas.'),
    (14,'orden_obra','Orden y limpieza dentro de la obra','Verificar áreas de trabajo y circulación.'),
    (15,'orden_publica','Orden y limpieza en vía pública','Verificar el entorno de la obra.'),
    (16,'residuos','Gestión y manejo de residuos de construcción y demolición','DS 003-2013-VIVIENDA modificado con DS 019-2016-VIVIENDA, según la referencia de la ficha.'),
    (17,'andamios','Uso de andamios, escaleras y otros','Registro de inspección de andamios y tarjetas para control de andamios.'),
    (18,'emergencia','Equipo de emergencia','Extintores, botiquín, camilla rígida, cuello rígido, luz de emergencia, linterna y otros.'),
    (19,'cargas','Manejo y movimiento de cargas','Protocolo de mantenimiento y uso de equipos. Permiso de izaje.')
   ) as item(orden,id,label,description)
  ) || jsonb_build_array(jsonb_build_object('id','observaciones','label','Observaciones de la visita','type','textarea'))
  ))
 ) where profesional_id is null and codigo='VACIO';
