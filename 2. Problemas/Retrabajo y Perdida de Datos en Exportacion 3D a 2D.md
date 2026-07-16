# Retrabajo y Pérdida de Datos en Exportación 3D a 2D

## 1. Definición del Problema
La industria exige planos de construcción legales en 2D (DWG/PDF), pero el diseño moderno se hace en 3D (SketchUp, Rhino). La exportación de estos modelos 3D "aplasta" (flattens) la geometría, resultando en un desastre vectorial: líneas superpuestas, rotas y sin atributos, obligando al dibujante a rehacer manualmente el plano cada vez que hay un cambio en el diseño original.

## 2. Perfiles Afectados
- [[Arquitecto Proyectista]]
- [[Estudiante de Arquitectura]]

## 3. Cuellos de Botella Geométricos y Topológicos
El "aplanado" matemático de un entorno 3D a 2D genera fallas geométricas insalvables con comandos simples:

1. **Mallas vs Primitivas CAD:** SketchUp y software de modelado libre usan mallas poligonales. Al aplanar una curva, en lugar de exportar un "Arco" (entidad analítica de CAD), se exportan cientos de pequeños segmentos de línea que saturan la memoria y son ineditables.
2. **Vectores Superpuestos (Overlapping):** Geometría que comparte coordenadas X,Y pero diferente Z colapsa en el mismo punto, apilando cientos de líneas idénticas que arruinan la impresión y aumentan el tamaño del archivo exponencialmente.
3. **Fragmentación (Nodos Abiertos):** Las intersecciones de mallas complejas rara vez cierran perfectamente en 2D, dejando tolerancias de milímetros que impiden comandos críticos en CAD como crear sombreados (Hatches).
4. **Ambigüedad de Líneas Ocultas (Hidden Lines):** Los algoritmos de proyección fallan al calcular eficientemente qué aristas están detrás de una superficie (oclusión).

## 4. Por qué es difícil de automatizar (Founder Market Fit)
Resolver esto requiere conocimiento de:
- **Intento de Diseño (Design Intent):** Un plano 2D no es un simple corte, es una abstracción "editorial" para constructores. Enseñar a un algoritmo qué líneas simplificar y cuáles omitir es un problema de IA avanzado.
- **Geometría Computacional Avanzada:** Optimización topológica (eliminar nodos colineales repetidos) y traducción de formatos de datos propietarios complejos que requieren de "normalización" de datos colosal.
