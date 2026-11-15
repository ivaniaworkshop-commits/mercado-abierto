# AMA · Cierre verificable R001 (2026-11-15)

**Alcance cerrado:** sitio público de identidad AMA y preparación de identidad visual aditiva para seis superficies de Mercado Abierto, sin cambios de lógica financiera.

## Evidencia
- Dos mascotas webp derivadas de los originales del usuario, favicon y guía de marca; portada responsive con identidad AMA en cabecera y pie.
- PR público [#1](https://github.com/ivaniaworkshop-commits/mercado-abierto/pull/1) fusionado. Commit `34fd04a6b0b098b57894771564e6f496e608a681`. Readback GitHub 6/6 rutas críticas.
- Portal informativo publicado en [AMA público](https://ama-mercado-abierto-publico.vercel.app/) en proyecto Vercel `ama-mercado-abierto-publico`, despliegue `dpl_5JBmSVXe3MQX5aZDwf84EzcBAJMY`, `READY` y `production`. Vercel enumera los seis archivos del sitio, pero la lectura íntegra de bytes y E2E visual remotos siguen `NOT_OBSERVED`.
- Código de las seis superficies de app (inicio, acceso, panel unificado, caja, mercado y comercio) en [Río PR #306](https://github.com/ivaniaworkshop-commits/rio/pull/306), commit `0463c51ea681b66860baa24e6f5c262f7b8cfcb3`, readback 8/8. Sigue abierto y en borrador: **NO MERGED / NO DEPLOYED**.
- Pruebas estáticas locales del sitio: 7/7 PASS; Chromium en este entorno bloqueó localhost/file/data.
- El enlace automático GitHub→Vercel falló por falta de Vercel Git Login Connection; el portal se publicó por carga de archivos sin tocar la app de pagos.

## Deltas
D01 mascotas y favicon: persistidos. D02 portada y diseño: fusionados. D03 responsive/accesibilidad estructural: 7/7 test local. D04 overlay seis superficies: commit privado, no runtime. D05 portada Vercel: READY, HTTP-browser desconocido. D06 readback/recibo: realizado.

## Fronteras
`STATIC_PORTAL != TRANSACTIONAL_APPLICATION` · `BRANCH_PROGRAMMED != RUNTIME_ACTIVE` · `VERCEL_READY != VERIFIED_BROWSER_E2E` · `HASH != TRUTH`.

**Cierre:** `CLOSED_FOR_EXECUTED_VERIFIED_VISUAL_SCOPE`, con integración privada pendiente de revisión, pruebas dinámicas y despliegue. No se declara cerrado ni alterado el canon global de Río.
