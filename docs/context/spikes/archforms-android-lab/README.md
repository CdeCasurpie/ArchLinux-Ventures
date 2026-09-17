# ArchForms Android Lab — Iteración 0.2

Laboratorio funcional para validar en un teléfono Android real los riesgos de ArchForms antes de construir el producto completo.

## Capacidades

| Capacidad | Estado |
|---|---|
| Cámara real | Visor embebido con `@capacitor-community/camera-preview` |
| Fotos en almacenamiento privado | Implementada con `@capacitor/filesystem` |
| Descriptores locales binarios + matching geométrico | Implementados en el dispositivo |
| Grabación real | Plugin Android propio: PCM/WAV mono, 16 kHz |
| Cámara embebida | `camera-preview` para Capacitor 8; encendido, apagado y captura sin salir de la app |
| Audio en almacenamiento privado | Implementado con `@capacitor/filesystem` |
| Recuperación tras cerrar la app | Implementada con archivos + `@capacitor/preferences` |
| `whisper.cpp` nativo | Siguiente hito; no se simula transcripción |

La grabación nativa comprueba permisos y persistencia y ya produce PCM/WAV a 16 kHz para alimentar el futuro modelo local.

## Preparar el teléfono

1. Abre **Ajustes → Acerca del teléfono**.
2. Toca siete veces **Número de compilación**.
3. Abre **Opciones de desarrollador** y activa **Depuración USB**.
4. Conecta un cable con transferencia de datos.
5. Acepta en el teléfono la huella RSA de la computadora.
6. Ejecuta `adb devices -l`: debe aparecer una fila terminada en `device`.

## Construir e instalar

```bash
cd /home/cesar/contexto/ArchVentures/spikes/archforms-android-lab
export ANDROID_HOME=/home/cesar/Android/Sdk
export JAVA_HOME='/home/cesar/.local/share/jdks/jdk-21.0.12.1+1'
npm run android:build
npm run android:run
```

También puedes instalar el APK producido:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Protocolo de prueba

### Cámara

1. Toma la misma escena dos veces con una variación pequeña.
2. Toma una escena distinta.
3. Revisa las sugerencias basadas en coincidencias de puntos locales.
4. Fuerza el cierre y vuelve a abrir la app.
5. Comprueba que todas las fotos reaparezcan.

### Audio

1. Graba 30 segundos, reproduce y reinicia la app.
2. Repite con 2 minutos.
3. Repite con 10 minutos y observa temperatura/estabilidad.
4. Activa modo avión y repite.

Texto sugerido:

> Se verifica avance de obra en el cuarto piso. Continúan trabajos de enchape, instalaciones eléctricas y colocación de drywall. Se observa material acumulado junto a la escalera y falta señalización preventiva.

### Criterios de salida

- Las fotos reaparecen después de matar la app.
- Los audios confirmados reaparecen y se reproducen.
- Un audio de diez minutos se guarda sin bloquear la interfaz.
- Los descriptores locales sugieren tomas cercanas sin eliminar archivos.
- Cámara y audio funcionan en modo avión.

## Siguiente hito: Whisper Android

1. Integrar `whisper.cpp` con NDK/CMake.
2. Descargar y verificar el modelo multilingüe `tiny`.
3. Capturar PCM mono a 16 kHz por fragmentos.
4. Mostrar texto parcial real.
5. Medir primer parcial, tiempo final, memoria y temperatura.
6. Probar `base` solo si `tiny` no alcanza la exactitud necesaria.
