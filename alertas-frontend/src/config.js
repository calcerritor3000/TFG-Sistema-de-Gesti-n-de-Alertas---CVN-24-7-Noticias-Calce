/**
 * URL base del API. En producción (mismo dominio que el backend) déjala vacía
 * y las peticiones irán a /api/... del mismo host.
 */
export const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p;
}

/** Archivos en public/ (logo, favicon, etc.) */
export function publicAsset(filePath) {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const p = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${base}${p}`;
}

export const LOGO_URL = publicAsset('/CVN_Noticias.png');

/** Rutas de imágenes de alertas (/uploads/alerts/...) o URLs absolutas */
export function mediaUrl(imagePath) {
  if (!imagePath) return null;
  const p = String(imagePath).trim().replace(/\\/g, '/');
  if (/^https?:\/\//i.test(p) || p.startsWith('data:image/')) return p;
  if (p.startsWith('/')) return apiUrl(p);
  if (p.startsWith('uploads/')) return apiUrl(`/${p}`);
  return apiUrl(`/uploads/alerts/${p}`);
}
