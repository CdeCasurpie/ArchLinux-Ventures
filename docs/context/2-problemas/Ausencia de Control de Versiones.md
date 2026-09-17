# Ausencia de Control de Versiones

## Definición del Problema
En el ecosistema AEC, la sobreescritura destructiva de archivos CAD/BIM o la pérdida de iteraciones previas es común por negligencia. Muchas veces los asistentes o el mismo arquitecto "chancan" el archivo equivocado al darle a "Guardar" o pierden meses de trabajo al borrar carpetas sin tener backups distribuidos.

## Impacto
* **Pérdida Crítica de Datos:** Como vimos en la entrevista de César (el caso de su asistente Claudia), perder un levantamiento o sobreescribir el archivo "Final_Final_v3.dwg" puede costar semanas de retrabajo total.
* **Score:** 32/40.

## Oportunidad Tech (CS Fit)
* Traer el concepto de **Git y branching** al mundo de los vectores CAD y mallas BIM.
* Crear un "Time Machine" arquitectónico donde guardar no signifique duplicar un archivo de 2GB (generando un infierno de almacenamiento), sino guardar los *deltas* o *diffs* geométricos, permitiendo regresar a un *checkpoint* sin miedo.
