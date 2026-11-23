# Memeshop v0.24 — Máscaras universales (primera fase)

- Máscaras no destructivas para capas de imagen, texto, forma y pintura.
- Pincel Borrar/Restaurar desde la barra superior, con tamaño, dureza, difusión y opacidad.
- Trazos de máscara persistidos en el documento y registrados en el historial.
- Restablecer máscara desde la herramienta y desde el inspector de capas.
- El modo de máscara para capas no-imagen usa luminancia (blanco visible, negro oculto).

## Límites

- No incluye aún máscaras de selección compartidas ni filtros limitados por máscara.
- Las imágenes conservan su ruta de máscara existente (alfa/varita); no se ha reescrito para evitar regresiones.
- Los grupos son lógicos, no máscaras de grupo.
- No se han ejecutado pruebas en iOS/Android.
