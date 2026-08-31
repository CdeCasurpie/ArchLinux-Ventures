# Redacción Mecánica de Actas (Inspectores y Delegados)

## Definición del Problema
Una vez que el profesional encontró la falla en la obra o en el plano y justificó la norma vulnerada, debe redactar el acta. El problema es que esta redacción es 100% manual. Los inspectores terminan tipeando y acomodando fotos en formatos rígidos de Word/Excel cientos de veces, usando descripciones idénticas ("Escalera sin pasamanos según norma X").

## Impacto
* **Pérdida de Tiempo en Trabajo de Escritorio:** Isabel confirmó que acomodar fotos en Excel y redactar lo que ya había anotado a mano le toma de **4 a 5 horas**. En las municipalidades incluso le pasan sus borradores a "señoritas" para que lo tipeen a mano, lo que demuestra una ineficiencia ridícula en la cadena.
* Falta de autocompletado y carencia absoluta de plantillas dinámicas adaptativas.
* **Score:** 35/40 (El segundo problema mejor puntuado).

## Oportunidad Tech (CS Fit)
* **LLMs + Computer Vision:** App móvil que tome una foto en campo e inyecte automáticamente la imagen en un reporte (PDF/Word). Al dictar un audio rápido ("la escalera no cumple el ancho"), el modelo transcribe, cruza con la norma RNE (RAG), y redacta el acta técnica perfecta, eliminando las 4 horas de escritorio en casa.

## Proporción del Tiempo y Hallazgos Clave (Validación Formal)
La distribución del tiempo se divide en un 60% de tiempo perdido y un 40% de tiempo restante para trabajo de valor. Este tiempo perdido comprende tareas mecánicas como el tipeado en Excel, la transferencia de fotos a la computadora y la categorización. Estas tareas mecánicas restringen su capacidad para asumir más proyectos y captar nuevos clientes.

**10 Hallazgos Clave Estructurados:**
1. El informe requiere la firma del encargado de obra, pero esta rúbrica puede recabarse con posterioridad a la visita presencial.
2. La conexión a internet no debe ser un requisito de diseño, ya que ciertos entornos de obra carecen de conectividad.
3. A los usuarios les resulta más sencillo redactar a mano que utilizar una computadora.
4. Existen profesionales de otras disciplinas, adicionales a los arquitectos, que ejecutan informes de estructura similar.
5. Es fundamental preservar la flexibilidad que les permite finalizar el trabajo en casa, en concordancia con sus esquemas habituales.
6. **Decaimiento de la memoria (fricción cognitiva):** Se capturan hasta 100 fotografías por obra y se traza un preinforme manual. Si la compilación del reporte no ocurre el mismo día, la pérdida del contexto fotográfico los obliga a ejecutar el trabajo de escritorio bajo condiciones de fatiga.
7. **Desproporción del esfuerzo:** La inspección física (trabajo de valor real) demanda entre 30 minutos y 2 horas, mientras que la carga administrativa asociada (transferencia, categorización fotográfica y citación normativa) exige entre 4 y 5 horas.
8. En el sector público (municipalidades), la metodología vigente exige redactar actas a mano para su posterior digitalización.
9. **Uso de herramientas inadecuadas por supervivencia:** Se emplea Excel para la maquetación de reportes en lugar de Word debido a la facilidad para insertar y alinear múltiples fotografías simultáneamente, evidenciando la carencia de un software ajustado a su flujo operativo.
10. El proceso actual de categorización fotográfica exhibe una complejidad asintótica de $O(n^2)$, lo cual resulta algorítmicamente ineficiente.
