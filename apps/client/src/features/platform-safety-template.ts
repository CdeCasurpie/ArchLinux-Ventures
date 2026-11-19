import type {ChecklistTemplate} from '@archforms/domain';

/** Offline catalog fallback; kept in sync with the migrated platform template. */
export const platformSafetyTemplate:ChecklistTemplate={
 id:'local-vacio',codigo:'VACIO',nombre:'Seguridad y salud en obra',version:3,profesional_id:null,
 esquema:{version:2,sections:[{id:'seguridad_obra',title:'Seguridad y salud en obra',fields:[
  ['cerco','Cerco perimetral de obra','Verificar su instalación y estado.'],
  ['mallas','Mallas de seguridad','Sujetas con bastidores verticales y horizontales, colocadas sobre el cerco perimetral de obra, frontal y hacia colindantes.'],
  ['areas_trabajo','Organización de las áreas de trabajo','Caseta, servicios de bienestar, almacenamiento de insumos, almacenes, área de operaciones de obra, área de prefabricación y/o habilitación de materiales, acopio temporal de residuos y área de guardianía.'],
  ['electricas','Instalaciones eléctricas provisionales','Norma G.050.'],
  ['accesos_obra','Accesos y vías de circulación dentro de la obra','Vías de circulación peatonal, vías de circulación de maquinaria, señalización de seguridad y prevención de riesgos.'],
  ['accesos_publica','Accesos y vías de circulación en la vía pública','Vías de circulación peatonal, vías de circulación vehicular, señalización de seguridad y prevención de riesgos.'],
  ['supervisor','Supervisor de prevención de riesgos en obra','Para obras con menos de 20 trabajadores.'],
  ['comite','Comité Técnico de Seguridad y Salud en el Trabajo (CTSST)','Para obras con más de 20 trabajadores: jefe de obra, jefe de Prevención de Riesgos de la obra y 02 representantes de los trabajadores.'],
  ['plan_sst','Plan de Seguridad y Salud en el Trabajo','Verificar su disponibilidad e implementación.'],
  ['capacitacion','Programa de capacitación y sensibilización','Charla de inducción para el personal que ingresa a la obra, charlas semanales y de inicio de jornada.'],
  ['epp_basico','Equipo de Protección Individual: básico','Indumentaria de trabajo, casco de seguridad, calzado de seguridad, protectores visuales y guantes de seguridad.'],
  ['epp_especial','Equipo de Protección Individual: especial','Protección respiratoria, protectores de oídos, arnés de seguridad, trabajos en caliente y otros.'],
  ['protecciones','Protecciones colectivas','Internas y externas.'],
  ['orden_obra','Orden y limpieza dentro de la obra','Verificar áreas de trabajo y circulación.'],
  ['orden_publica','Orden y limpieza en vía pública','Verificar el entorno de la obra.'],
  ['residuos','Gestión y manejo de residuos de construcción y demolición','DS 003-2013-VIVIENDA modificado con DS 019-2016-VIVIENDA, según la referencia de la ficha.'],
  ['andamios','Uso de andamios, escaleras y otros','Registro de inspección de andamios y tarjetas para control de andamios.'],
  ['emergencia','Equipo de emergencia','Extintores, botiquín, camilla rígida, cuello rígido, luz de emergencia, linterna y otros.'],
  ['cargas','Manejo y movimiento de cargas','Protocolo de mantenimiento y uso de equipos. Permiso de izaje.'],
  ['observaciones','Observaciones de la visita'],
 ].map(([id,label,description])=>({id,label,...(description?{description}:{}),type:'boolean' as const}))}]},
};
