# Ausencia de Planos As-Built Automatizados

## 1. Definición del Problema
La desconexión histórica entre el entorno construido real y su representación digital. En la industria AEC, mantener planos actualizados de los activos existentes ("As-Built") es un proceso tedioso, lento y manual. Como rara vez existen planos fieles a la realidad, los profesionales deben realizar levantamientos in situ midiendo empíricamente, lo que retrasa peritajes y proyectos de remodelación.

## 2. Perfiles Afectados
- [[Perito Tecnico]]
- Arquitecto de Remodelaciones

## 3. Cuellos de Botella Algorítmicos (Scan-to-BIM)
Aunque la fase de **captura de datos** se ha acelerado gracias al hardware, el paso de esa representación en bruto a un **modelo BIM semántico** sigue siendo altamente manual por las siguientes razones computacionales:

1. **Falta de Inteligencia Semántica Inherente:** Una nube de puntos solo contiene coordenadas espaciales (X, Y, Z). Los algoritmos de extracción automatizada a menudo confunden geometrías similares (ej. una tubería vs. una columna redonda) porque carecen de contexto semántico.
2. **Oclusiones y Ruido Sensorial:** Muebles, personas transitando y superficies reflectantes (cristales) causan vacíos espaciales o rebotes láser. Los algoritmos automatizados fallan al intentar deducir qué hay detrás de una oclusión.
3. **El Conflicto Paramétrico vs Realidad:** El mundo real está lleno de imperfecciones (muros desplomados, falsas escuadras). Un algoritmo de auto-trazado intentará modelar cada micro-desviación generando mallas pesadas, mientras que los softwares BIM (Revit/ArchiCAD) exigen familias paramétricas estrictas ortogonales.

## 4. Tecnologías Involucradas (Founder Market Fit)
Para que un Computer Scientist resuelva este cuello de botella, debe aplicar:
- **SLAM (Simultaneous Localization and Mapping):** Algoritmos que permiten a un operador mapear el entorno y rastrear su ubicación simultáneamente.
- **Algoritmos ICP (Iterative Closest Point):** Método matemático esencial para alinear y unir múltiples nubes de puntos parciales corrigiendo la deriva (*drift*).
- **NeRFs (Neural Radiance Fields) / Gaussian Splatting:** Modelos de IA de vanguardia que infieren volumetrías continuas a partir de fotos 2D, ayudando a rellenar vacíos y resolver oclusiones donde el LiDAR falla.
