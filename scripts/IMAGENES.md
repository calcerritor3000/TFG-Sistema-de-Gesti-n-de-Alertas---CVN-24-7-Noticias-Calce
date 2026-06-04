# Imágenes del TFG (logo y alertas)

## Logo CVN (fijo, siempre visible)

- **Ubicación:** `alertas-frontend/public/CVN_Noticias.png`
- **En la web:** `/CVN_Noticias.png`
- **No va en la base de datos.** Va en `public/` y se copia al `build` en cada deploy.

## Fotos de las alertas (noticias y mapa)

- **En disco (Git):** `uploads/alerts/*.jpg` (y `.png`)
- **En la BD solo la ruta:** columna `image_url` → `/uploads/alerts/nombre.jpg`
- **No guardar BLOB en MySQL** (pesado y malo para el TFG).

Al hacer `npm run build`, el script `sync-static-assets.js` copia las imágenes a  
`alertas-frontend/public/uploads/alerts/` para que Render las sirva junto al React.

## Subir una foto nueva (admin)

1. En el mapa, al crear/editar alerta → subir imagen.
2. El backend guarda el archivo en `uploads/alerts/` y la ruta en la BD.
3. En Render el disco es efímero: las fotos **nuevas** se pierden al redeploy salvo que las vuelvas a subir o las commitees a Git.

## Añadir imágenes de ejemplo al repo

Copia los `.jpg` a `uploads/alerts/` y ejecuta:

```powershell
node scripts/sync-static-assets.js
git add uploads/alerts alertas-frontend/public/uploads
git commit -m "Añadir imágenes de alertas"
```
