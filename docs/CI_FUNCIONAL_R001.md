# Mercado Abierto · CI funcional público · R001

## Base y alcance
- Base: publicación fusionada en `main`, commit `b55f11b22446515a9400d322a9df97e7584a66e8`.
- Aplicación publicada: `source/app`.
- Workflow: `.github/workflows/mercado-functional-ci.yml`.
- Requiere únicamente permisos de lectura de GitHub Actions. No usa secretos, credenciales de comercios, correo real, proveedores de pago ni infraestructura productiva.

## Matriz de pruebas introducidas
| Área | Evidencia ejecutada en el workflow | Alcance técnico |
| --- | --- | --- |
| Alta de cuentas y proveedor por comercio | `test_self_signup_and_own_pey.py` | rutas de alta/verificación/sesión y separación entre negocios; proveedor aislado |
| Acceso al workspace | `test_login_first_workspace.py` | login y control de HTML/recursos privados |
| Navegación y autorización de Mercado | `test_mercado_abierto_navigation.py` | módulos, perfiles y denegaciones de acceso |
| Invitaciones | `test_merchant_invitation.py` | invitación, caducidad/reemplazo y permisos |
| Estado comercial | `test_hackaton_r016_commerce.py` | revisión CAS, CSRF, integridad, aislamiento entre cuentas |
| Flujo HTTP en localhost | `test_http_operational_flow.py` | servidor HTTP local real, registro, QR no pagable, conciliación no bancaria y reinicio |
| Gateway y conciliación | `test_gateway.py`, `test_reconciliation.py` | rechazo de operaciones inseguras, exactitud de importes y clasificación de conciliación |
| JavaScript Caja y puente | `cash_ui.test.cjs`, `puente.test.cjs` | redondeo en centavos, ventas de efectivo, aislamiento, transferencia Mercado→Caja |
| JavaScript alta, verificación y centro de ayuda | `self_signup_ui.cjs`, `auth_verification_client.test.cjs`, `rio_help_dock_static.cjs` | contratos de DOM y seguridad de cliente; no sustituyen pruebas reales de navegador |

## Semántica de los resultados
- `PASS` sólo puede afirmarse tras observar una ejecución de Actions completada satisfactoriamente.
- El flujo HTTP prueba **código y endpoints reales en localhost** con SQLite y correo en memoria. No es observación de un despliegue público.
- La suite JavaScript no sustituye una ejecución Chromium/Playwright, puesto que ejercita contratos de DOM aislados.
- No hay pruebas de pagos bancarios, correo entregado, proveedor real, credenciales reales ni cobranzas.
- Se seleccionan archivos autocontenidos de prueba. Parte de las pruebas del snapshot requieren fixtures auxiliares que deliberadamente no se publicaron. Una prueba omitida no puede contarse como `PASS`.

## Criterios de aceptación
1. Workflow visible en GitHub Actions y ambas tareas completadas con conclusión `success`.
2. Comprobar HEAD de rama/PR, resultados de jobs, y ruta exacta del workflow mediante readback.
3. Si falla, mantener `FAIL` y separar defecto de producto de problema de publicación/fixture; no ocultar ni desactivar una prueba que falle sin justificarlo.
4. No promover a `PRODUCTION_READY`, `BANK_SETTLEMENT_OBSERVED` ni `E2E_PRODUCTION_PASS` a partir de este CI.
