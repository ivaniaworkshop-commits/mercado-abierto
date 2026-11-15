# A11Y_R003 · Ejecución reproducible en entorno aislado

**Estado de esta ficha:** PROCEDIMIENTO, NO PRUEBA EJECUTADA. El ejecutor es `a11y_r003_browser_audit.cjs` y el checkpoint real es `../evidence/A11Y_R003_CHECKPOINT_20261114.json`.

## Gate antes de iniciar

1. Revisar el HEAD del PR #306 y separar/revisar cambios concurrentes de backend (`identity.py`, `platform.py`, `commerce_state.py`, `activity.py`, `vercel.json`) antes de usar una vista previa. No ejecutar tests E2E contra producción.
2. Confirmar SHA exacto y URL de un preview **no productivo**, con protección de acceso, datos de prueba y sin variables de producción copiadas. Revisar por separado los metadatos Vercel: `target=preview`, SHA de GitSource coincidente con `RIO_A11Y_SOURCE_SHA` y hostname idéntico a `RIO_A11Y_APPROVED_PREVIEW_ORIGIN`. La comprobación de forma de SHA por sí sola no verifica el despliegue. **Ronda posterior observada:** Vercel respondió `400 incorrect_git_source_info` al intentar desplegar el SHA `ac65664af42c6b7d9ea1ef9a55c3d89491c30417` usando el ID de repositorio `1342440387` acreditado por GitHub. No se obtuvo URL. La respuesta significa que Vercel no reconoció ese repositorio en la operación; **no prueba por sí sola** qué permiso o vínculo falta. Verificar el enlace Git de este proyecto y la instalación autorizada de Vercel, sin transferir credenciales a chat ni cambiar la configuración de producción. No se debe reintentar con un ID supuesto. Conservar URL en `null` ante cualquiera de los dos errores (`429` histórico o `400` observado después).
3. Ejecutar desde una máquina con Node.js, Playwright y axe-core instalados en un directorio de pruebas aislado. Instalar dependencias con versión verificada y fijar el lockfile de ese ambiente; no introducir paquetes en el runtime bancario.
4. Confirmar un navegador Chromium funcional y una sesión de prueba autorizada. Guardar `storageState` fuera del repositorio (permisos restrictivos) o usar variables de entorno privadas; nunca colocar correo, contraseñas, cookies ni tokens en el PR.

## Ejecución

```bash
# Ejemplo de terminal en un ambiente de pruebas que ya contiene las dependencias:
export RIO_A11Y_BASE_URL='https://<preview-verificado>.vercel.app'
export RIO_A11Y_APPROVED_PREVIEW_ORIGIN='https://<preview-verificado>.vercel.app'
export RIO_A11Y_STORAGE_STATE='/ruta-privada/session.json'
export RIO_A11Y_SOURCE_SHA='<sha-exacto-del-preview>'
export RIO_A11Y_REPORT_DIR='/ruta-privada/a11y-report'
export CHROMIUM_EXECUTABLE_PATH='/usr/bin/chromium'
node apps/rio_pey_codi/app/tests/a11y_r003_browser_audit.cjs
```

El código **rechaza** dominios de producción conocidos y exige una coincidencia exacta con el preview aprobado; **no demuestra por sí solo que cualquier subdominio de Vercel sea un preview**. Sólo las solicitudes GET/HEAD/OPTIONS hacia el **mismo origen de prueba aprobado** y el POST `/v1/auth/login` del mismo origen están permitidos; toda salida cross-origin o escritura distinta se bloquea y se contabiliza. El gate exige `blocked_writes=0` y `blocked_cross_origin=0`; los bloqueos son hallazgos, no evidencia de una navegación correcta. Se configura `serviceWorkers:'block'` para impedir derivaciones fuera del enrutado del contexto. Esto protege el entorno de auditoría, no demuestra que el servidor esté seguro. Ejecuta 390 px y 320 px; Menú, Mis negocios, Caja (CoDi y efectivo, sin enviar cobros), Historial; navegación por teclado; axe-core WCAG A/AA; contraste estricto 4.5:1 por combinaciones de texto visible y fondo sólido calculado; Escape/Cancelar del diálogo sin DELETE. Registra condiciones no calculables como UNKNOWN.

## Comprobaciones aisladas antes del E2E

En un checkout autorizado con Node.js se pueden ejecutar `node apps/rio_pey_codi/app/tests/a11y_r003_origin_guard.cjs`, `node apps/rio_pey_codi/app/tests/a11y_r003_network_policy.cjs` y `node apps/rio_pey_codi/app/tests/a11y_r003_gate_regression.cjs`. No hacen llamadas externas ni ejecutan cobros. Su ejecución **como archivos completos** debe registrarse con stdout/exit code antes de declararla observada; las comprobaciones de fragmentos aislados previas no la sustituyen.

## Evidencia exigida

El archivo `A11Y_R003_browser_results.json` se genera localmente; **no subirlo íntegro si pudiera revelar nombres, emails o estructura sensible**. Conservar versión de axe-core, SHA de preview, fecha, viewport, lista de violaciones por regla y nodos redactados. `axe_violations = null` significa que no se ejecutó; no equivale a cero.

Comprobar que no hay `horizontal_overflow`, `axe.violations` ni contraste <4.5, y que los `axe.incomplete` y `contrast.unknown` estén resueltos. Cualquier `NOT_OBSERVED` en el diálogo o escenarios de rol impide cerrar el gate correspondiente. Automatización no prueba todos los estados ni certifica WCAG AA.

## Lector de pantalla · comprobación manual obligatoria

En Windows+NVDA (Firefox o Chrome) y/o macOS+VoiceOver (Safari), recorrer **login → menú → Mis negocios → Caja → Historial** para una sesión de prueba. Registrar nombres y roles, lectura de estados, foco y retorno tras Cancelar, tabla/lista móvil y errores anunciados. Probar 390 y 320 px, incluido titular/no titular. Anotar aplicación, versiones, capturas redactadas y PASS/FAIL concretos; sin esa evidencia el estado es NOT_OBSERVED.

**Prohibido durante auditoría:** generar solicitudes CoDi, registrar efectivo, desconectar un comercio, enviar correos o alterar configuración/credenciales.
