# ArchForms — prototipo navegable

Mock responsive y autocontenido del flujo de expedientes e informes de visita.

## Abrir

Abrir `index.html` directamente en el navegador o servir la carpeta:

```bash
python3 -m http.server 8080 --directory prototipo-archforms
```

Luego visitar `http://localhost:8080`.

## Recorrido sugerido

1. Inicio → Ver expedientes.
2. Expedientes → Nuevo expediente o abrir “Remodelación C.C. La Molina”.
3. Expediente → Nueva visita.
4. Visita → Checklist, Captura y Resumen.
5. Resumen → Terminar toma de datos.
6. Editor → Guardar borrador, Vista previa o Generar PDF.

Es un prototipo de diseño: persiste cambios únicamente durante la sesión del navegador y no accede a cámara, micrófono, nube ni base de datos reales.
