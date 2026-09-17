# Entrevista de Validación - César Andres Perales Aliaga
**Rol principal:** Arquitecto Proyectista (también realiza labores de inspección y revisión).

## 1. El Flujo de Diseño y el Dolor del Dibujo Mecánico (CAD)
- **Ideación vs. Ejecución:** Él visualiza el proyecto en 3D en su mente y hace bosquejos rápidos a mano alzada. Le toma aprox. 8 horas idear una propuesta seria. Sin embargo, detesta pasar ese bosquejo a CAD de forma detallada porque lo considera un trabajo "mecánico" y "aburrido".
- **Delegación a Asistentes:** Delega el dibujo en AutoCAD a asistentes. Prefiere contratar estudiantes de arquitectura de últimos ciclos en lugar de simples dibujantes técnicos. La razón: un simple dibujante no entiende de proporciones ni función; si hay que mover un muro, el dibujante rompe el diseño, mientras que el estudiante sabe cómo adaptarlo.
- **Calidad del Dibujo:** Se queja de que los jóvenes "dibujan sucio" (líneas superpuestas, mala valoración). A menudo prefiere no revisar minuciosamente porque le quita tiempo, asumiendo esa pérdida de calidad para evitar el trabajo tedioso.

## 2. El Cuello de Botella: Pivoteo con el Cliente
- **El mito del "cambio pequeño":** Los clientes suelen pedir cambios aparentemente simples ("haz este cuarto más grande"). César explica que en arquitectura no existe un cambio pequeño una vez que el plano tiene medidas exactas. Mover un muro implica desfasar el baño, reproporcionar la cocina y cuadrar la estructura con los pisos inferiores/superiores.
- **Costo en tiempo:** Una reunión de revisión dura unas 2 horas, pero implementar esos cambios (recalcular y redibujar) le toma **un día entero (8 horas)** adicional.

## 3. El Expediente Municipal (La Carga Administrativa)
- Una vez que el cliente aprueba el diseño final, preparar el Expediente Municipal le toma **una semana entera de trabajo (40 horas netas)**.
- **El 90%-95% de ese tiempo:** Generar los planos detallados, cortes, elevaciones y detalles arquitectónicos. Es la parte más pesada y aburrida.
- **El 5% restante (FUE y Memorias):** Llenar el Formato Único de Edificación (FUE) y redactar memorias descriptivas le toma 1 a 2 horas. Sin embargo, admite que **siempre hay errores humanos** (ej. copiar mal el metraje cuadrado de un ambiente a la tabla de Excel). Revisar el formato contra los planos es tedioso y a menudo evita hacerlo, lo que causa retrasos si la municipalidad los observa.

## 4. Formalidad vs. Informalidad
- Explicó detalladamente el parámetro normativo del **30% de Área Libre** (exigido para iluminación y ventilación). En un terreno de 80m2, formalmente solo puedes techar 56m2.
- Muchos clientes optan por la informalidad para no perder esos 24m2 (que equivalen a 2 habitaciones), a pesar de que el arquitecto pierde toda la fase de servicios de licenciamiento municipal y el cliente pierde la capacidad de registrar legalmente su propiedad.

## 5. Control de Versiones (Validación de Git para Arquitectura)
- Se tocó el problema de la pérdida de datos. Su asistente (Claudia) accidentalmente chancó/borró un archivo crucial de levantamiento.
- Aunque César cataloga esto como "negligencia total" e "irresponsabilidad" del asistente, admite que sucede y que cuesta muchísimo tiempo recuperar el trabajo perdido.
- Cuando los entrevistadores le explicaron cómo funciona un sistema de control de versiones con ramas y "checkpoints" (Git), se mostró receptivo ante la idea de poder regresar en el tiempo sin duplicar archivos pesados infinitamente.

## Conclusión y FMF
Esta entrevista valida fuertemente dos de nuestros problemas:
1. **[[Retrabajo y Perdida de Datos en Exportacion 3D a 2D]] / Dibujo CAD:** El arquitecto proyectista odia el trabajo mecánico de generar cortes y elevaciones detalladas. Su principal dolor es la generación del expediente técnico (40 horas).
2. **[[Falta de Control de Versiones en Modelos BIM]] / CAD:** Validamos en tiempo real que los errores de sobreescritura (chancar archivos) destruyen el progreso, y que el método actual ("Guardar como v1, v2, v3") es insostenible y propenso a errores humanos catastróficos.
