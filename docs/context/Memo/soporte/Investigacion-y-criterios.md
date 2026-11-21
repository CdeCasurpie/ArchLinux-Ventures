> **Nota (20/11/2026):** las cifras financieras de este archivo corresponden a una versión anterior del modelo. Las vigentes están en `resultados_modelo.md`, `valuacion_resultados.md` y `mercado_resultados.md`. Este archivo sigue siendo la fuente de los padrones IMO [M1–M8].

# Investigación y criterios editoriales — ArchForms

**Corte de consulta: 20 de noviembre de 2026.** Este archivo respalda el memo; no añade secciones a la plantilla académica. Los conteos son elaboración propia a partir de fuentes institucionales, no estadísticas publicadas por los colegios. Una publicación institucional acredita la existencia del padrón; no prueba actividad comercial, disposición de pago ni habilitación individual al día de hoy.

## 1. Estructura y jerarquía de evidencia

La plantilla DOCX contiene exactamente: Tesis del negocio, Problema, ICP, MVP / Solución, Tamaño de Mercado, Modelo de Negocio, Tracción, Framework de Experimentos, Competencia y Equipo. El memo conserva ese orden. El flujo de caja solicitado se incorpora como subsección del Modelo de Negocio. La guía se usa para los criterios analíticos de esas diez secciones.

Orden utilizado: documentos primarios y padrones oficiales → entrevistas y código del repositorio → interpretación explícita → hipótesis de experimentación. Un test automatizado o una función implementada prueban avance técnico, no adopción ni ahorro efectivo.

## 2. Padrones CAP y CIP: fuentes y depuración

### Fuentes que permiten contar registros

| ID | Publicación oficial y enlace | Periodo / alcance publicado | Filas / personas identificadas | Tratamiento |
|---|---|---|---|---|
| M1 | [CAP Lima: índice de inspectores](https://limacap.org/inspectores-municipales-de-obra/) y [PDF 2025–2027](https://limacap.org/wp-content/uploads/2025/02/Nomina_IMO_2025_2027-publicacion-web_25.02.2025.pdf) | 03/02/2025–30/01/2027; Regional Lima | 53 filas, 36 CAP distintos | Edificaciones y habilitaciones urbanas repiten personas. |
| M2 | [CAP Lima, PDF 2026–2028](https://limacap.org/wp-content/uploads/2026/03/Nomina-IMO-2026-2028.pdf) | 01/02/2026–31/01/2028; Regional Lima | 74 filas, 54 CAP distintos | 6 + 5 + 10 + 33 personas en edificaciones; 20 entradas adicionales en habilitaciones ya presentes. |
| M3 | [CIP Lima: índice](https://cam.ciplima.org.pe/registro-unico-de-inspectores-municipales/) y [PDF agosto 2026–julio 2027](https://cam.ciplima.org.pe/wp-content/uploads/2026/10/REGISTRO-DE-INSPECTORES-MUNICIPALES-PERIODO-AGOSTO-2026-JULIO-2027.pdf) | Agosto 2026–julio 2027; índice actualizado el 26/10/2026 | 145 registros de especialidad; 130 CIP distintos | 121 civil-edificación; 15 civil-HU ya incluidos; 2 sanitaria, 2 eléctrica, 3 mecánica eléctrica y 2 electrónica. No sumar 145 usuarios. |
| M4 | [CAP Piura, padrón de noviembre de 2026](https://cappiura.org.pe/2026/11/11/publicacion-oficial-cuadro-de-delegados-cap-2026-2027-y-registro-de-inspectores-municipales-de-obra-acreditados/) | Publicado 11/11/2026; Regional Piura | 32 CAP distintos | 7 categoría 2, 18 categoría 3, 7 categoría 4. No sumar los delegados municipales de la primera parte del artículo. No atribuirles provincia por sus otras designaciones. |
| M5 | [CIP Piura: índice](https://cippiura.org/vista/asuntos_mun/) y [PDF 2025–2027](https://cippiura.org/public/pdf/reg_inspectores_munic.pdf) | 04/07/2025–03/07/2027 | 29 personas | Unión con M6, no reemplazo automático por ser más nuevo. |
| M6 | [CIP Piura, PDF 2026–2028](https://cippiura.org/public/pdf/reg_inspectores_munic2026-2028.pdf) | 13/07/2026–12/07/2028 | 10 personas | Una persona repite con categoría distinta: CAM2040551 / CAM2040552; identificar por CIP 204055. Unión M5 + M6 = 38 personas. |
| M7 | [CAP Arequipa, tabla web](https://www.capregionalaqp.org.pe/pages/inspector.html) | 2024–2026, sin día exacto de vencimiento visible | 37 filas, 36 CAP distintos | CAP 11198 figura dos veces con variantes de nombre y categoría. No sumar tabla histórica 2022–2024. Vigencia al corte requiere confirmación. |
| M8 | [CIP Arequipa, PDF](https://ciparequipa.org.pe/assets/images/comisiones/inspecmuni/Inspectoresmunicipalesdeobras2024-2026.pdf) | 2024–2026, sin día exacto de vencimiento visible | 24 personas | Categorías: 3 + 2 + 4 + 15. La numeración se reinicia / presenta saltos: contar filas de personas, no el último ordinal. Vigencia al corte requiere confirmación. |

**Unión CAP Lima:** 36 + 54 − 4 = **86** colegiaturas. Las repetidas entre periodos son 6157, 10999, 6889 y 11721. Los dos periodos publicados se superponen al corte; que exista uno más reciente no permite eliminar a todo el anterior.

**Resumen:** Lima: CAP 86, CIP 130; Piura: CAP 32, CIP 38. Subtotal de los cuatro padrones depurados: **286 identificaciones colegio–colegiatura**, con cobertura regional, no provincial. Arequipa añade 60 identificaciones de un periodo cuya vigencia exacta no está confirmada. Estos 60 se mantienen aparte. No se ha comprobado nacionalmente movilidad entre consejos ni doble titulación CAP/CIP: el subtotal no se presenta como censo nacional de personas únicas.

La fuente CIP usa registros como `I-1176903` e `I-1176904` para una misma colegiatura con distinta categoría. El último dígito del registro es categoría en estos documentos. Esto se verificó contra las columnas CIP, no se presume válido para cualquier padrón futuro.

### Alcance territorial: por qué no hay una cifra por provincia

Los registros revisados identifican al colegio regional/departamental y al profesional; no incluyen sistemáticamente provincia de residencia, de habilitación territorial ni de ejercicio efectivo. La propia CAM Lima describe cobertura de Lima Metropolitana y Lima Provincias. No corresponde imputar todas sus personas a la provincia de Lima, ni distribuirlas proporcionalmente a la población, ni replicar el mismo padrón en cada provincia.

| Territorio solicitado | CAP IMO por provincia | CIP IMO por provincia | Qué sí se conoce |
|---|---|---|---|
| Lima; Barranca; Cajatambo; Canta; Cañete; Huaral; Huarochirí; Huaura; Oyón; Yauyos | No desagregado | No desagregado | Universo regional publicado: 86 CAP y 130 CIP, sin asignación provincial. |
| Piura; Ayabaca; Huancabamba; Morropón; Paita; Sechura; Sullana; Talara | No desagregado | No desagregado | Universo regional publicado: 32 CAP y 38 CIP. Las designaciones por municipio del artículo CAP son de delegados, no una distribución de IMO. |
| Arequipa; Camaná; Caravelí; Castilla; Caylloma; Condesuyos; Islay; La Unión | No desagregado | No desagregado | 36 CAP y 24 CIP en listas 2024–2026; vigencia exacta pendiente. |
| Provincias de los demás departamentos y Callao | Sin conteo provincial validado en esta investigación | Sin conteo provincial validado en esta investigación | No equivale a cero acreditados. |

### Búsquedas adicionales y límites

- **CAP nacional:** se localizaron [reglamentos de acreditación](https://www.cap.org.pe/cap/reglamentos/Reglamento_acreditacion_inspec_munici_de_obra20201030.pdf) y una [base de arquitectos habilitados al 11/08/2025](https://cap.org.pe/cap/Primer-reporte-%20BD_HABILITADOS-comprimido.pdf). La descarga de esta última devolvió HTTP 403. Además, es de habilitados generales, no de IMO: aun accesible no resolvería el denominador del ICP.
- **CAP Cusco:** el buscador identifica la sección «Cuadro de IMOS» en [comunicados](https://capcusco.org/publicaciones/9-comunicados), pero el acceso devolvió error / verificación antirobot; no se pudo contar un padrón verificable.
- **CAP San Martín:** [la página oficial de inspectores](https://capsanmartin.org.pe/inspectores-municipales-de-obra/) anuncia la nómina, pero el texto accesible no expuso los nombres o un PDF contable. Las noticias de concursos y entrega de credenciales no se convierten en un padrón completo.
- **CIP Callao:** se hallaron [bases del concurso para enero–diciembre 2026](https://cdcallao.cip.org.pe/wp-content/uploads/2025/09/Bases_Inspectores_Municipales_2025_F.pdf), no una nómina final. Los requisitos o las plazas de una convocatoria no son profesionales acreditados.
- **CIP La Libertad:** se localizó [convocatoria 2026](http://www.cip-trujillo.org/inicio/muestra_noticia/4768), no se obtuvo un padrón final para contar.
- **Lambayeque:** se localizaron convocatorias CAP/CIP en resultados sociales y copias de terceros. No se usaron como censo oficial vigente.
- **Tacna, Junín/Huancayo, Ica y La Libertad CAP:** búsquedas específicas no proporcionaron una nómina oficial vigente y contable. No se extrapolan cifras de otros consejos.
- **Amazonas, Áncash, Apurímac, Ayacucho, Cajamarca, Huancavelica, Huánuco, Loreto, Madre de Dios, Moquegua, Pasco, Puno, Tumbes y Ucayali:** sin padrón IMO contable incorporado. La investigación no constituye un censo exhaustivo de todas sus páginas municipales o redes.

**Pendiente concreto:** solicitar al CAP nacional y CIP nacional el consolidado por colegiatura, colegio emisor, especialidad, categoría, fecha de inicio/fin y UBIGEO del ámbito registrado. Pedir a los consejos sin consolidado su padrón final, incluyendo altas, bajas y revalidaciones. Separar ámbito autorizado de residencia y de municipio donde trabaja: son variables distintas. Un cruce por nombre es secundario a la colegiatura y requiere resolver dobles titulaciones. Para supervisores privados, hace falta además un denominador independiente de actividad y frecuencia de informes; no existe una equivalencia «todos los ingenieros = supervisores».

### TAM / SAM / SOM y límites monetarios

- **Unidad:** una licencia individual pagante; no una obra, un informe ni una designación municipal. No duplicar a quien también es supervisor privado.
- **ARPA propuesto:** S/ 720/año cobrado con doce mensualidades, sin descuento. Si S/ 60 incluye IGV, ingreso anual sin IGV = S/ 610,16949. La [tasa general SUNAT es 18%](https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/impuesto-general-las-ventas).
- **TAM Perú:** `personas únicas activas que producen informes compatibles × ARPA`. Número de personas todavía no establecido: mantener explícita esta limitación, sin sustituirlo por 1 000.
- **SAM inicial acotado:** padrón CAP Lima de 86 candidatos, sujeto a verificar actividad, formato compatible y canal de compra individual. Techo bruto S/ 61 920/año; neto S/ 52 474,58. No son 86 compradores comprobados.
- **Expansión ingenieros Lima:** 216 identificaciones CAP+CIP; techo bruto S/ 155 520 y neto S/ 131 796,61. Requiere validación con ingenieros y resolver eventual doble titulación.
- **Referencia regional parcial:** 286 identificaciones Lima+Piura × S/ 720 = S/ 205 920 cobrados/año, o S/ 174 508,47 sin IGV. No se rotula TAM ni piso de ingresos.
- **SOM experimental a 36 meses:** 10 demostraciones cualificadas/mes × 50% que finaliza un informe real × 20% de esos activados que paga = 1 alta mensual. Con churn supuesto del 3%: `1 × (1 − 0,97^36) / 0,03 = 22,20` suscriptores esperados. Aproximadamente 22 licencias, S/ 15 840/año a precio final o S/ 13 423,73 sin IGV. Es una meta de ejecución condicionada, no demanda observada. Requiere 36 altas brutas, por debajo de 86 candidatos; la conversión acumulada exigida sigue siendo elevada y debe contrastarse.
- **Latinoamérica:** no se publica un TAM agregado inventado. Como contexto primario, [Data México, ocupación 2263](https://economia.gob.mx/datamexico/es/profile/occupation/arquitectos-planificadores-urbanos-y-del-transporte), reporta aproximadamente **151 mil ocupados, 2026-T1**, incluyendo arquitectos y planificadores urbanos/del transporte, no solo supervisores. No multiplicar todos por el precio ni atribuirles acreditación IMO peruana. También se identifica [DENUE 2025: 8 363 unidades económicas de servicios de arquitectura, ingeniería y relacionados](https://economia.gob.mx/datamexico/en/profile/industry/architectural-engineering-and-related-services): son empresas de una categoría amplia, no personas. No combinar ambas unidades en un TAM.

## 3. Competencia: fuente primaria y cautelas

| ID | Fuente consultada | Hallazgo utilizable |
|---|---|---|
| C1 | [Report and Run](https://reportandrun.com/) | 8 reportes/mes gratis; Upgraded USD 9,99 **al año**; Team USD 10/usuario/año. PDF y DOCX, anotación, branding. No comparar precio anual con mensual. |
| C2 | [Report and Run Cloud](https://reportandrun.com/cloud/) y [precio Cloud](https://reportandrun.com/cloud/pricing.html) | Continuidad móvil–escritorio y colaboración. La página presenta USD 9,99 mensuales, pero el selector no expone en texto la combinación de usuarios/imágenes; no se presenta como precio por usuario ilimitado confirmado. |
| C3 | [Deltek ArchiSnapper](https://www.deltek.com/products/delivery-assurance/archisnapper/) | Captura móvil, anotación de planos, checklists, PDF corporativo, colaboración, web, Android/iOS e integraciones. La antigua URL de precios redirige a Deltek y no muestra una tarifa actual verificable. No usar USD 24/34 de cachés o directorios como precio vigente confirmado. |
| C4 | [Archireport](https://archireport.com/es) | Notas/fotos, informes automáticos, seguimiento y colaboración; disponible en español. No presumir ausencia de idioma español en la categoría. |
| C5 | [Fieldwire, precios](https://www.fieldwire.com/pricing/) | Basic gratis con hasta 5 usuarios, 3 proyectos y 100 planos; Pro USD 39/usuario/mes con facturación anual, incluye reportes; Business USD 64, añade formularios personalizados. Compite parcialmente por captura/reportes y, más ampliamente, por gestión integral. |
| C6 | [OBRATEC, informes de obra](https://obratec.app/software-informes-obra) | Dictado Whisper, descripción de fotos por IA, edición, informes y PWA. Publica Básico EUR 9/mes, Profesional EUR 39 y Enterprise EUR 399; son declaraciones del proveedor, no un benchmark de ahorro validado independientemente. Offline para captura; transcripción/redacción IA y publicación requieren conexión según su propia documentación. |
| C7 | «Obsidia» del borrador | Se buscaron nombre exacto, variantes ObsIA/Obsydia/Obsidi y términos arquitectura, construcción, inspecciones, informes y reportes. No se identificó inequívocamente la aplicación indicada. Aparecen homónimos de ciberseguridad y conocimiento empresarial ajenos al caso. Mantener como competidor mencionado por el equipo pendiente de URL; no equipararlo a OBRATEC ni a Obsidian. |

No se probó personalmente el producto de cada competidor. La tabla del memo compara capacidades anunciadas y evidencia interna, sin atribuirles mala usabilidad ni pérdida de control profesional por usar IA. Tampoco se afirma que carezcan de adaptabilidad al Perú: no se verificó una cobertura equivalente de formatos peruanos en las fuentes revisadas.

## 4. Tracción: investigación aplicada

Referencias:

- **T1 — [Y Combinator, Anu Hariharan / Adora Cheung, métricas por modelo](https://www.ycombinator.com/blog/startup-school-week-3-recap-anu-hariharan-and-adora-cheung)**, 18/09/2019. Para SaaS: MRR, churn y CAC cuando exista adquisición pagada; diferenciar intención, contratos y revenue. Recomienda definir «activo», mostrar cifras absolutas y no gráficos acumulados como prueba de crecimiento.
- **T2 — [Stripe, SaaS cohort analysis](https://stripe.com/resources/more/saas-cohort-analysis)**, actualizado 01/01/2026. Cohortes consistentes por inicio, separando canal, tipo de cliente y periodo de observación; no confundir correlación con causalidad ni cohortes diminutas con señal estable.
- **T3 — [Stripe, MRR](https://stripe.com/resources/more/what-is-monthly-recurring-revenue)**. La normalización mensual permite comparar recurrencia; cobros únicos y servicios no recurrentes deben registrarse aparte.

Aplicación a ArchForms:

1. Las siete entrevistas documentadas son discovery; no siete usuarios activos ni siete pagantes.
2. La frase «3 míos» del borrador no identifica personas, periodo, actividad ni pago. No hay base para publicar tres clientes. El roadmap habla de preparar un piloto con dos arquitectos: es un objetivo, no prueba de participación completada.
3. Un informe real exportado es mejor señal de activación que abrir la app; debe tener destinatario y verificarse que sea utilizable. Reexportar el mismo informe no suma una nueva unidad de valor.
4. Repetición en la siguiente oportunidad de informe y retención mensual deben convivir: puede haber meses sin obra. No excluir silenciosamente usuarios sin oportunidad del denominador de retención general; presentar ambos denominadores.
5. Ahorro medido = tiempo total manual frente a tiempo total con app (campo adicional, gabinete, correcciones y soporte). Medir solo gabinete puede ocultar trabajo desplazado al campo.
6. Registrar onboarding asistido y relación familiar/canal de origen. La repetición independiente fuera de la red cercana es evidencia comercial más fuerte.
7. MRR no verificable se comunica como «no documentado», no como cero observado. Cuando se confirme ausencia de suscripciones, entonces sí publicar S/ 0. Ingresos hipotéticos de 3 × S/ 60 no son MRR.
8. Cohortes a 6/12 meses todavía no disponibles no deben rellenarse con proyecciones. Con 2–3 participantes mostrar casos, conteos y tiempos individuales; porcentajes con su n/N y sin pretensión estadística.

Campos mínimos para una futura base de tracción: ID seudónimo de profesional, rol, región/provincia autodeclarada, canal, relación con founders, fecha de invitación, primera visita real, primer PDF utilizable, segunda oportunidad/segundo informe, fecha de cobro, precio/IGV/descuento, renovación, baja, tiempos manual/app y minutos de soporte. Separar el identificador de visita del evento de exportación; deduplicar reintentos offline al sincronizar. Esto es una especificación de medición propuesta, no telemetría ya desplegada.

## 5. Correcciones al borrador y qué requiere justificación

| Afirmación original o implícita | Tratamiento |
|---|---|
| «Ahorra como mínimo dos horas» | Hipótesis. Israel reporta ~1h de gabinete; el mínimo no puede generalizarse. |
| «Cobran S/ 500 en promedio» | Caso ilustrativo del equipo, no promedio poblacional sin muestra y evidencia de honorarios. |
| «S/ 80/h es muy poco para ellos» | Juicio subjetivo eliminado. Se muestra el cálculo sin etiquetar remuneraciones. |
| «Expandir a más problemas reduce riesgo» | Corregido: diversifica oportunidades, pero antes de PMF dispersa recursos y aumenta riesgo de ejecución. |
| «USD 450 mil pre-money por precio de competidores × múltiplo» | Sin fundamento: precio no equivale a ingresos de la compañía ni valoración. Valoración pendiente. No se propone una cifra nueva sin base. |
| «Seed porque hay MVP» | Recomendación editorial: pre-seed / validación comercial, según evidencia disponible; las etiquetas no tienen un umbral universal. |
| «Nota convertible por no conocer todos los futuros productos» | Insuficiente. El instrumento posterga fijar precio del capital; requiere pactar cap/descuento, interés, vencimiento y conversión. Tener futuros productos no lo vuelve automáticamente óptimo. |
| «Los privados hacen legalmente lo mismo» | El flujo de documentación se solapa. La [Ley 29090 publicada por Ate](https://muniate.gob.pe/wp-content/uploads/2026/02/LEY-N%C2%B0-29090.pdf), art. 10, apartado de verificación técnica, permite al supervisor privado asumir funciones si cumple requisitos de la ley y reglamento. No toda supervisión privada es verificación municipal. |
| «1 000 Perú / 100 mil Latam» | Eliminados como hechos; reemplazados por padrones parciales, fórmula y límites. |
| «Winner takes all por personalidad cerrada» | Sin evidencia de efectos de red ni monopolio. La resistencia al cambio dificulta tanto captar como perder clientes. |
| «Clase media alta, mayoría de 50 años» | Sin distribución muestral ni evidencia de capacidad de pago. ICP definido por frecuencia de informes, dolor y autonomía de compra. |
| «Reportes ilimitados» | Hipótesis comercial viable solo con límites explícitos de almacenamiento/retención/uso de servicios y costos medidos. |
| «Exceso de IA de Obsidia borra conocimiento» | Sin identidad y prueba del competidor, eliminado. El control editorial se presenta como decisión propia. |
| «RAG normativo» como diferenciador actual | El roadmap lo excluye del MVP. No se vende como función actual. El código sí contiene integración de transcripción local; eficacia en obra por medir. |

**Justificar con fuentes externas:** denominadores de mercado, acreditación y vigencia, alcance legal, precios/funciones rivales, tasa tributaria y cualquier afirmación cuantitativa sectorial.

**Justificar con evidencia propia:** entrevistas, ahorro efectivo, aceptación del informe, usuarios/clientes, cobros, retención, CAC, soporte y experiencia del equipo. Una cita de YC no demuestra que ArchForms tenga tracción.

**Explicitar como decisión o supuesto, sin sobreexplicar:** precio propuesto, secuencia geográfica, roles de founders, umbrales experimentales y escenarios de costos. Basta indicar responsable/plazo/criterio cuando afecta una decisión. No necesitan una fuente externa que «demuestre» la preferencia del equipo.

**Eliminar sin reemplazar por otra cifra:** porcentajes macro y cuantificaciones internas antiguas (por ejemplo 120 mil AEC, 30–42% en obra o cientos de miles de inspectores Latam) que figuran en postulaciones previas sin fuente primaria comprobada para ese universo. No heredar una cifra por estar escrita en el repositorio.

## 6. Modelo financiero y archivos

`supuestos_financieros.json` contiene todas las hipótesis editables. Ejecutar `python3 docs/context/Memo/soporte/modelo_financiero.py` desde la raíz (Python 3 y Pillow para PNG). Produce `flujo_mensual_36m.csv`, `resumen_anual.csv`, `resultados_modelo.md`, `caja_escenarios.png` e `ingresos_egresos_base.png`.

Modelo operativo de prefactibilidad, no estado financiero histórico ni flujo libre para valorar por DCF:

- Inicio: **cero clientes pagantes como convención de simulación**, no afirmación sobre el negocio real; S/ 10 000 supuestamente recibidos al mes 0.
- Altas/bajas al inicio del mes, facturación y cobro del mes completo; clientes esperados fraccionarios para aplicar churn. Sin morosidad ni descuento anual.
- Precio final supuesto incluye 18% de IGV. Se reserva íntegramente el débito fiscal del mes, sin crédito fiscal: estimación conservadora simplificada del disponible. No es una liquidación tributaria formal.
- Costos de servicio S/ 8 por cliente/mes y comisión 3% del cobro final son hipótesis, no cotizaciones de Supabase ni pasarela. Costos fijos incluyen infraestructura base y administración presupuestadas; los variables cubren carga incremental, almacenamiento y soporte operativo. No duplicar servicios al reemplazar por facturas.
- Adquisición: altas brutas × CAC de caja supuesto; el equipo debe medir después un CAC completo que añada horas comerciales. No se usa un porcentaje gratuito de crecimiento desconectado de gasto.
- Retiros totales de founders: S/ 0, S/ 2 000 y S/ 4 000 mensuales en los tres años. No se llaman salarios de mercado ni costo laboral integral. Si hay planilla, añadir beneficios/aportes. Año 1 además registra S/ 24 000 de trabajo no pagado como costo económico separado de caja.
- Excluye impuesto a la renta, pagos a cuenta, efectos de financiación convertible, capex y costos extraordinarios de constitución: dependen de régimen, contratación y términos aún no definidos. Los saldos son **antes de renta y de esos conceptos**, no dinero íntegramente distribuible. Una app financiada con trabajo gratis no es económicamente rentable solo por tener caja positiva.
- Después de agotar caja se mantiene la trayectoria matemática para cuantificar financiación faltante; no implica continuidad financiada. No hay aportes futuros ocultos.
- El escenario expansivo alcanza ~356 suscriptores, por encima de las 286 identificaciones parciales documentadas. Necesita expansión a privados/otros consejos: no está sustentado como cuota capturable hoy. El base de ~159 también necesita salir del CAP Lima de 86 candidatos. La simulación no sustituye al SOM experimental acotado.

Pruebas automáticas internas del script comprueban conciliación cobro–IGV–ingreso y clientes no negativos. El CSV mantiene cuatro decimales y las tablas redondean: pequeñas diferencias de suma visibles pueden ser redondeo.
