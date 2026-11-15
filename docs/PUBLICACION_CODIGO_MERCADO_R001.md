# Publicación del código de Mercado Abierto · R001

## Alcance del paquete

El directorio \`source/app\` contiene un snapshot de código fuente de Mercado Abierto que incluye interfaz de acceso, mercado, caja, administración por comercio, backend Python, persistencia, adaptadores de pago y pruebas. La portada AMA en la raíz del repositorio se conserva como proyecto independiente.

La publicación de código **no** configura producción ni habilita movimientos financieros. El entorno real necesita credenciales externas administradas únicamente como variables de entorno, control de permisos, migraciones y pruebas con autorización.

## Procedencia y fidelidad

- Origen: implementación de Mercado Abierto bajo el proyecto RÍO, snapshot del 15 de noviembre de 2026.
- Conservación de rutas: \`source/app\` reproduce los nombres relativos de la aplicación original; no sustituye automáticamente ningún servicio productivo.
- Diferencia deliberada: el atributo de ejemplo del correo electrónico en \`source/app/rio_pey_codi/static/index.html\` se neutralizó a \`correo@example.com\`.
- Los archivos bajo \`source/app/tests\` son fuentes de prueba; su sola presencia no acredita ejecución ni PASS.

## Exclusiones intencionales

No se publicaron contraseñas, tokens de sesión, valores de configuración real, archivos \`.env\`, secretos de proveedores, llaves de webhook, certificados, respaldos de base de datos, datos reales de usuarios ni informes internos de producción.

Se excluyeron pruebas y fixtures que activaban una revisión por posibles claves, correos, cuentas o cadenas de conexión. La señal automática también puede incluir falsos positivos; se prefirió conservar la privacidad a publicar valores dudosos. Se excluyen los archivos de despliegue que operan cuentas de servicio y las instrucciones de configuración privada.

Las imágenes AMA incluidas en la aplicación reutilizan blobs **idénticos** a los tres recursos ya públicos en \`assets/\`. Los logotipos SVG del proveedor de pago no se redistribuyen aquí.

## Verificaciones

El pipeline \`Public source integrity\` ejecuta compilación sintáctica de Python, las pruebas de la portada y auditoría de patrones de secretos. No ejecuta transferencias, checkout real, E2E con correo ni validaciones bancarias. El resultado de CI debe consultarse en la ejecución efectiva; no se considera aprobado por haber escrito el workflow.

## Avisos

- La presencia de código público no supone que el sistema esté listo para producción, ni que todas sus integraciones estén activas.
- La aplicación requiere configurar por separado su base de datos, servidor y proveedor de correo/pagos con credenciales propias.
- Publicar código fuente no concede por sí solo una licencia de reutilización. Los derechos deben aclararse antes de redistribuir el proyecto.
