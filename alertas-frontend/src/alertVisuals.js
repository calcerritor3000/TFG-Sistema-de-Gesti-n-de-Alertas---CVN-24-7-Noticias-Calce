/**
 * Colores e iconos emoji para alertas.
 * Unifica mapa, listados, estadísticas y notificaciones.
 */
import { apiUrl } from './config';

export const CATEGORIAS_OPTIONS = [
  { value: 'incendio', label: 'Incendio', emoji: '🔥' },
  { value: 'inundacion', label: 'Inundación', emoji: '💧' },
  { value: 'dana', label: 'DANA', emoji: '🌀' },
  { value: 'trafico', label: 'Tráfico', emoji: '🚗' },
  { value: 'obras', label: 'Obras', emoji: '🚧' },
  { value: 'meteorologia', label: 'Meteorología', emoji: '🌦️' },
  { value: 'seguridad', label: 'Seguridad', emoji: '🛡️' },
  { value: 'salud', label: 'Salud', emoji: '🏥' },
  { value: 'medio_ambiente', label: 'Medio Ambiente', emoji: '🌳' },
  { value: 'infraestructura', label: 'Infraestructura', emoji: '🏗️' },
  { value: 'otro', label: 'Otro', emoji: '📍' }
];

const CATEGORY_LABEL_BY_VALUE = Object.fromEntries(
  CATEGORIAS_OPTIONS.map((c) => [c.value, c.label])
);

const CATEGORY_EMOJI_BY_VALUE = Object.fromEntries(
  CATEGORIAS_OPTIONS.map((c) => [c.value, c.emoji])
);

export function getCategoryLabel(categoria) {
  const key = String(categoria || 'otro').toLowerCase();
  return CATEGORY_LABEL_BY_VALUE[key] || categoria || 'Otro';
}

export function getCategoryEmoji(categoria) {
  const key = String(categoria || 'otro').toLowerCase();
  return CATEGORY_EMOJI_BY_VALUE[key] || '📍';
}

export function getCategoryColor(categoria) {
  const colors = {
    incendio: '#e74c3c',
    inundacion: '#3498db',
    dana: '#1abc9c',
    trafico: '#f39c12',
    obras: '#95a5a6',
    meteorologia: '#9b59b6',
    seguridad: '#2c3e50',
    salud: '#e91e63',
    medio_ambiente: '#27ae60',
    infraestructura: '#34495e',
    otro: '#7f8c8d'
  };
  const key = String(categoria || 'otro').toLowerCase();
  return colors[key] || '#7f8c8d';
}

/** @deprecated Usar getCategoryEmoji — alias para compatibilidad */
export function getCategoryInitial(categoria) {
  return getCategoryEmoji(categoria);
}

export function getLevelColor(level) {
  switch (level) {
    case 'rojo':
      return '#e74c3c';
    case 'amarillo':
      return '#f39c12';
    case 'verde':
      return '#27ae60';
    default:
      return '#3498db';
  }
}

export function getLevelEmoji(level) {
  switch (level) {
    case 'rojo':
      return '🔴';
    case 'amarillo':
      return '🟡';
    case 'verde':
      return '🟢';
    default:
      return '🔵';
  }
}

/** @deprecated Usar getLevelEmoji */
export function getLevelLetter(level) {
  return getLevelEmoji(level);
}

export function getLevelLabelText(level) {
  switch (level) {
    case 'rojo':
      return 'Alto';
    case 'amarillo':
      return 'Medio';
    case 'verde':
      return 'Bajo';
    default:
      return String(level || '');
  }
}

/** Icono de notificación: imagen de la alerta o badge SVG por categoría/nivel */
export function resolveAlertNotificationIcon(alert, apiOrigin = apiUrl('')) {
  const categoria = alert?.categoria || alert?.category || 'otro';
  const nivel = alert?.nivel || alert?.level || 'verde';
  const imageUrl = alert?.image_url || alert?.imageUrl;

  const origin = String(apiOrigin || apiUrl('')).replace(/\/$/, '');

  if (imageUrl && String(imageUrl).trim()) {
    const path = String(imageUrl).trim();
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  }

  const params = new URLSearchParams({
    categoria: String(categoria).toLowerCase(),
    nivel: String(nivel).toLowerCase()
  });
  return `${origin}/api/alert-notification-icon?${params.toString()}`;
}
