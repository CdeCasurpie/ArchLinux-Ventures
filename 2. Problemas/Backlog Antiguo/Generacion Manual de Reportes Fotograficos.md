# Generación Manual de Reportes Fotográficos en Obra

## 1. Definición del Problema
En la industria AEC, el reporte fotográfico documenta avances, certifica calidad y protege ante disputas legales. Sin embargo, hacerlo manualmente (tomar fotos con celular, enviarlas por WhatsApp, ordenarlas en Excel/Word) genera una "Brecha de Visibilidad" y pérdida de contexto espacial/temporal, costando miles de horas y provocando retrabajo.

## 2. Perfiles Afectados
- [[Inspector ITSE]]
- [[Inspector Municipal de Obra (IMU)]]
- [[Perito Tecnico]]

## 3. Cuellos de Botella y Dificultad Técnica
Las herramientas ofimáticas tradicionales (Drive, WhatsApp) fallan por su incapacidad para manejar flujos de **realidad digital estructural**:

1. **Pérdida de Metadatos y Silos de Datos:** Al enviar fotos por mensajería, se pierde la data EXIF (fecha, GPS). Sin esta "fuente única de verdad", la foto pierde su valor documental legal. 
2. **Falta de Asociación Espacial (Mapeo 2D a 3D):** Una simple carpeta no permite anclar una imagen bidimensional sobre coordenadas X,Y,Z de un plano arquitectónico. Alinear esto automáticamente requiere visión por computadora avanzada.
3. **Limitaciones de SLAM en Interiores:** El GPS convencional falla bajo losas de hormigón. Lograr que un sistema posicione automáticamente la foto en una habitación requiere algoritmos de SLAM (Simultaneous Localization and Mapping) de alto nivel.
4. **Costo de Retrabajo:** Entre el 48% y 52% del retrabajo en obra (que cuesta miles de millones) se atribuye directamente a documentación fotográfica inexacta o desactualizada.

## 4. Tecnologías Involucradas (Founder Market Fit)
Para solucionar esto, un Computer Scientist debe construir:
- Entornos Comunes de Datos (CDE) conectados a bases relacionales en la nube.
- Extracción automatizada de metadatos EXIF.
- Desarrollo móvil nativo para cacheo offline en obra.
- Integración de visores de PDFs vectoriales interactivos para anclar pines georreferenciados (X,Y) in situ.
