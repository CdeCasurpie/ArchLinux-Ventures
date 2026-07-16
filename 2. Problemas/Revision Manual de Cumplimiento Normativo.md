# Revisión Automatizada de Cumplimiento Normativo (Automated Compliance Checking - ACC)

## 1. Definición del Problema
El proceso de verificación de que un diseño arquitectónico cumple con los códigos de construcción (ej. Reglamento Nacional de Edificaciones) es completamente manual, lento y susceptible a errores humanos. Requiere que un evaluador lea normativas de texto denso (PDFs legales) y compruebe planos y especificaciones cruzando información empíricamente.

## 2. Perfiles Afectados
- [[Delegado CAP]]
- Revisor Municipal

## 3. Cuellos de Botella Algorítmicos (NLP y Ontologías)
Cerrar la brecha entre el "texto legal" y el "modelo geométrico" es un problema de Ciencias de la Computación extremadamente riguroso:

1. **El Rol del Procesamiento de Lenguaje Natural (NLP):** Los códigos de construcción usan lenguaje legal, ambiguo y con múltiples excepciones. El NLP y los LLMs (Large Language Models) son necesarios para extraer requerimientos normativos y variables ("ancho mínimo", "resistencia al fuego").
2. **Mapeo Ontológico (Web Semántica):** Traducir lenguaje humano a la base de datos de un IFC requiere ontologías estructuradas (como ifcOWL, RDF) que permitan razonamiento lógico.
3. **Traducción a Reglas Lógicas:** El código extraído por NLP debe convertirse en formalismos computables (reglas SWRL, consultas SPARQL, formato BCF) para ser evaluado contra un modelo BIM.
4. **Desalineación Semántica y Razonamiento Espacial:** Un gran porcentaje de las normas exige relaciones espaciales complejas (ej. "Rutas de evacuación mínimas de 1.20m cruzando no más de 2 puertas"). Calcular este "razonamiento multi-hop" topológico genera un alto costo computacional.

## 4. Tecnologías Involucradas (Founder Market Fit)
Para resolver este dolor millonario de los proyectos inmovilizados, un Computer Scientist usaría:
- **Agentes LLMs y NLP:** Para el preprocesamiento sintáctico del código legal.
- **Árboles de Decisión y Lógica Booleana:** Para evaluar reglas anidadas y excepciones.
- **Teoría de Grafos y Geometría Computacional:** Para realizar chequeos espaciales (pathfinding para evacuación).
