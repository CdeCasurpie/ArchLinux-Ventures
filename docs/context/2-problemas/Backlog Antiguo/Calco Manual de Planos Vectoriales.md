# Calco Manual de Planos Vectoriales (Raster a CAD/BIM)

## 1. Definición del Problema
El proceso tradicional de "levantamiento" arquitectónico requiere digitalizar planos antiguos en papel, imágenes escaneadas o PDFs (impresos sin vectores). Convertir estos píxeles de vuelta a vectores inteligentes (Líneas y Polígonos en CAD, o Muros paramétricos en BIM) sigue requiriendo que un operador humano redibuje las líneas una por una, consumiendo incontables horas sin valor creativo.

## 2. Perfiles Afectados
- [[Estudiante de Arquitectura]]
- [[Arquitecto Proyectista]]

## 3. Cuellos de Botella Algorítmicos (R2V - Raster to Vector)
A pesar de los avances en Computer Vision, la automatización del proceso Raster-to-Vector para planimetría se estrella con los siguientes problemas:

1. **OCR Geométrico y Separación de Capas (Blind Source Separation):** Los OCRs clásicos fallan al extraer cotas, textos o ejes si están atravesados u ocultos bajo una línea de muro. Segmentar la imagen obligaría al sistema a hacer "inpainting" (inventar píxeles donde había un texto).
2. **Transformada de Hough y Ruido:** Las heurísticas clásicas usadas para encontrar líneas rectas (Hough Transform) colapsan con escaneos ruidosos o planos AEC que tienen muchísimos micro-segmentos de muro (ej. escaleras, columnas irregulares), arrojando falsos positivos.
3. **Consistencia Topológica vs. Precisión Geométrica:** El mayor dolor de cabeza computacional. Un polígono mal cerrado por 1 píxel en el raster es inofensivo; en AutoCAD significa que la entidad es inválida, el área (m2) falla y no se pueden aplicar sombreados.

## 4. El Abismo Semántico (Pixels to BIM)
- Pasar de píxeles a líneas (vectores) es solo la mitad del trabajo. Para llevar esto al estándar BIM, el software necesita **clasificación de objetos**. Saber que esas cuatro líneas no son un "rectángulo", sino un objeto dinámico `IfcWall` con propiedades, espesor y anclaje inferior/superior.
- **Modelos Híbridos:** La nueva ola de R2V no usa reconocimiento de bordes puro, sino Modelos Transformers (Pixels-to-Sequence) para forzar la consistencia topológica, y VLMs para razonamiento lógico (ej. "Esta caja pequeña en el baño no es una columna, debe ser el inodoro").
