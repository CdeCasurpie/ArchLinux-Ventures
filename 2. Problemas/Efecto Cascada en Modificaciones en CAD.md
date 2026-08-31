# Efecto Cascada en Modificaciones en CAD

## Definición del Problema
Cuando el cliente (o revisor municipal) pide un "cambio menor", como ampliar un baño o un cuarto en 50 centímetros, este no es un cambio trivial. Se rompen invariantes de diseño en la planta, forzando el recálculo manual de todas las proporciones contiguas y la afectación directa a la estructura, los sótanos y las tuberías.

## Impacto
* **Horas de Retrabajo:** Como indicó el Proyectista César Perales, un cambio de ese tipo exige reproporcionar todo, consumiendo hasta 8 horas (1 día laboral) de redibujo y cuadre estructural. El dibujo 2D no es paramétrico en su esencia básica.
* **Score:** 30/40.

## Oportunidad Tech (CS Fit)
* Constraint Solving (Resolución de Restricciones Geométricas) o Modelos generativos que adapten dinámicamente un *layout* al modificar una cota, manteniendo el área libre y respetando pasadizos automáticamente.
