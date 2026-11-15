# AMA · Mercado Abierto

Portada pública informativa de **AMA** con dos mascotas originales aportadas por el titular y diseño derivado de la presentación de marca de 120 segundos. Implementación en HTML/CSS/JS, sin dependencias de terceros y sin incluir credenciales.

**Abrir localmente:** `python -m http.server 8000` y visitar `http://127.0.0.1:8000`.

**Validar:** `python -m unittest discover -s tests -v`.

**Desplegar:** raíz del repo como sitio estático, por ejemplo Vercel o GitHub Pages si se habilita la publicación. La portada enlaza a la aplicación existente; **no** sustituye el servidor de mercado, el inicio de sesión ni el flujo de cobros.

Consulta [docs/MARCA_AMA_R001.md](docs/MARCA_AMA_R001.md) para paleta, usos de las mascotas, deltas y límites de evidencia.

## Código fuente de Mercado Abierto

El código auditable de la aplicación se encuentra en [source/app](source/app). Incluye interfaces de mercado/caja, servidor Python, migraciones y pruebas seleccionadas. La portada en la raíz se mantiene independiente. Consulta [la política de publicación](docs/PUBLICACION_CODIGO_MERCADO_R001.md); ningún archivo público activa cobros o configura credenciales.
