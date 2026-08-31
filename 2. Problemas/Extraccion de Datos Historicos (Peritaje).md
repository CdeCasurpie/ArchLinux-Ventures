# Extracción de Datos Históricos (Peritaje)

## Definición del Problema
Los Peritos Tasadores necesitan recopilar la historia y estatus legal/constructivo de un inmueble. Esto exige un rastreo visual iterativo en mapas satelitales (año por año), búsqueda manual de Copias Literales en la SUNARP e información en la SUNAT o catastro. Toda la consolidación de datos para justificar la tasación se hace a "fuerza bruta".

## Impacto
* **Tiempo Administrativo (Dolor Crítico):** Confirmado por Isabel, este levantamiento de información "investigativa" le consume **1 día entero**. Es una labor que odian por ser netamente burocrática y mecánica.
* **Score:** 32/40. (Urgencia de nivel 10).

## Oportunidad Tech (CS Fit)
* Web Scraping automatizado, uso de APIs de SUNAT/SUNARP (o RPA si no hay API pública), y análisis de imágenes satelitales (Computer Vision para detectar automáticamente en qué año cambió la huella techada de un lote).
* Generar el "Background Check" del inmueble en un click.
