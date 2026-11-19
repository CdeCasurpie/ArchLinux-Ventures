# Publicar ArchForms en Google Play

## Compilar el App Bundle

```sh
npm run android:bundle
```

Salida: `apps/client/android/app/build/outputs/bundle/release/app-release.aab`.
Identificador: **com.karen.archforms**. Versión actual: `1.0.2` (`versionCode 3`).
Incrementar `versionCode` en `apps/client/android/app/build.gradle` para cada nueva
subida a Play. El identificador del paquete no puede cambiar después de publicar.
Este paquete es una aplicación independiente de `com.archventures.archforms`;
los datos locales de aquella instalación no se transfieren automáticamente.
Sincronizarla antes de cambiar de aplicación permite recuperar los datos de la
cuenta en la nueva instalación.

El bundle inicial se validó con `bundletool`, se verificó su firma y su manifiesto
release (`debuggable=false`, API objetivo 36). La configuración solicita
`PAGE_ALIGNMENT_16K`; los segmentos ELF y la disposición RELRO de las seis
bibliotecas de 64 bits incluidas se comprobaron para alineación de 16 KB. Estas
comprobaciones son estáticas; falta la prueba de ejecución en un dispositivo o
emulador configurado con páginas de 16 KB.

La compilación release utiliza la clave de subida de:

```
~/.local/share/archforms/signing/archforms-upload.jks
~/.local/share/archforms/signing/upload.properties
~/.local/share/archforms/signing/upload-certificate.pem
```

`upload.properties` contiene la ruta del keystore, el alias y las contraseñas.
Solo la persona propietaria tiene permiso para leerlo. La clave y las credenciales
se crearon fuera del repositorio. Conservar una copia privada, cifrada y respaldada
de los tres archivos. Nunca añadir el keystore ni sus contraseñas a Git.
Para otra ubicación definir `ARCHFORMS_KEYSTORE_PROPERTIES`.

Activar **Play App Signing** al crear la primera versión. Este keystore firma las
subidas; Google administra la clave que firma las instalaciones distribuidas.
El AAB no se instala directamente como un APK.

## Preparación de la ficha y revisión

1. Crear/verificar la cuenta de Google Play Console y completar los requisitos de
   identidad, contacto y dispositivo que indique la consola.
2. Crear la aplicación ArchForms y subir primero el AAB a pruebas internas.
3. Preparar nombre, descripción breve y completa, correo de soporte, icono 512×512,
   gráfico destacado 1024×500 y capturas reales de la aplicación.
4. Publicar una política de privacidad accesible mediante URL y enlazarla también
   desde la app. Completar Seguridad de los datos según el funcionamiento real:
   cuenta/perfil, expedientes, fotos, audios y sincronización con Supabase. La
   transcripción local y la generación local de PDF deben describirse correctamente.
5. Verificar la eliminación de cuenta y datos en la aplicación y ofrecer una URL
   externa para solicitarla, como requiere Play para aplicaciones con registro.
6. Completar clasificación de contenido, público objetivo, publicidad y demás
   declaraciones solicitadas. Proporcionar una cuenta de revisión funcional y
   las instrucciones necesarias, porque la app requiere iniciar sesión.
7. Revisar el informe previo al lanzamiento, permisos de cámara/micrófono,
   sincronización sin conexión y las comprobaciones de compatibilidad del bundle.
8. Si la cuenta personal se creó después del 13 de noviembre de 2023, Google exige
   una prueba cerrada con al menos **12 testers inscritos durante 14 días
   consecutivos** antes de solicitar acceso a producción. Consultar siempre los
   requisitos que muestre la consola para esa cuenta.

El código apunta a Android API 36. Las bibliotecas nativas del bundle deben
comprobarse para dispositivos de páginas de memoria de 16 KB. Una firma válida y
una compilación exitosa no sustituyen la revisión de Play ni sus pruebas en
dispositivos.

## Backend y despliegue web

El editor requiere la migración
`supabase/migrations/20261119000100_photo_edits.sql`: agrega `foto.editada_at`,
conserva el id de foto en los informes y cambia `archivo_id` por cada versión
inmutable. La transacción rechaza sobrescrituras binarias y evita que una captura
antigua revierta una edición reciente. La eliminación de visitas recoge también
las versiones anteriores.

Los cambios de base de datos, el AAB y el despliegue público web son entregas
independientes. Compilar el bundle no publica la web ni sube cambios a Git.

Las migraciones `20261119000200_safety_template.sql` y
`20261119000300_account_deletion.sql` actualizan la plantilla básica e incorporan
el borrado de cuenta: primero se eliminan los objetos reales con la API de Storage
y después la identidad y sus relaciones en cascada. El proceso impide nuevas
subidas mientras se borra y permite reintentos tras una interrupción. La cuenta
del dispositivo actual también se limpia localmente, sin borrar otras cuentas.

El icono Android y el icono web de 512×512 utilizan la marca ArchForms, con fondo
blanco y margen para las máscaras adaptativas. Archivo para la ficha de Play:
`apps/client/public/archforms-icon.png`.

La política y las instrucciones para publicarla están fuera del repositorio:
`../ArchForms-privacidad/index.html` y `../ArchForms-privacidad/PUBLICAR.md`.
Falta alojarlas en una URL HTTPS pública y añadir el enlace a la aplicación y a
Play Console.

## Referencias oficiales

- [Firma de aplicaciones](https://developer.android.com/studio/publish/app-signing)
- [Requisitos de pruebas de cuentas personales](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Requisitos de eliminación de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Compatibilidad con páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes)
