# Falta de Control de Versiones en Modelos BIM ("Git para BIM")

## 1. Definición del Problema
El concepto de "Git para BIM" busca aplicar los flujos de trabajo de desarrollo de software (control de versiones distribuido, ramificación, fusión asíncrona) a la industria AEC. Actualmente, el estándar se basa en Entornos Comunes de Datos (CDE) que gestionan archivos pesados (.rvt, .dwg) de manera centralizada y secuencial, limitando la agilidad y trazabilidad.

## 2. Perfiles Afectados
- [[Arquitecto Proyectista]]
- Coordinador BIM

## 3. Cuellos de Botella Algorítmicos (Diff Semántico)
A diferencia del código fuente (texto plano basado en líneas), los modelos BIM y mallas 3D son estructuras relacionales, lo que hace que comparar dos versiones (hacer un "diff") sea un reto técnico masivo:

1. **Dependencias y Efecto Dominó:** En un modelo paramétrico, cambiar la altura de un nivel regenera toda la geometría. Un "diff" puramente geométrico mostraría un 100% de cambios, aunque semánticamente solo se modificó una variable.
2. **Brecha Semántica de GUIDs:** Al comparar modelos, los IDs de los objetos (GUIDs) suelen corromperse o cambiar al exportar entre programas. Identificar si un muro es "nuevo" o "el mismo pero movido" requiere algoritmos complejos de coincidencia de grafos topológicos.
3. **Mallas 3D sin Semántica:** Las mallas estándar (OBJ, STL) son "mudas". Hacer un diff requiere primero aplicar IA para segmentar y clasificar ("enriquecimiento semántico") antes de poder comparar si una "puerta" cambió.
4. **Formatos Binarios Propietarios:** Revit utiliza archivos binarios monolíticos cerrados (`.rvt`). Git fue diseñado para leer texto; si dos personas editan el mismo archivo `.rvt`, el resultado es un conflicto binario irresoluble sin perder trabajo (merge conflict irrecuperable).

## 4. Casos de Estudio y Tecnologías (Founder Market Fit)
Para construir un "Git para BIM", un Computer Scientist aborda arquitecturas orientadas a datos:
- **Speckle (Base de Datos de Objetos):** Descompone modelos BIM en objetos granulares enviados a una DB central por API, permitiendo versionamiento a nivel de objeto y ramificación.
- **Bonsai y OpenBIM (IFC):** Uso de IFC nativo para implementar flujos de Git reales (ramas, pull requests) mediante herramientas de diferenciación de IFC.
- **Diff Topológico con Grafos:** Traducción de modelos IFC a bases de datos de grafos (Neo4j) para hacer diffs semánticos (ej. "El Muro A perdió su conexión estructural con la Losa B").
