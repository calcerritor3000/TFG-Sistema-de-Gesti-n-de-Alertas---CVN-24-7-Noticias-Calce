/**
 * Service Worker del frontend (PWA).
 * - install/activate: nombres de caché versionados y limpieza de cachés viejas.
 * - fetch: prioridad red para HTML/JS/CSS del mismo origen; respaldo en caché;
 *   API en red primero; teselas OSM en caché.
 * - push / notificationclick: notificaciones desde el backend (VAPID).
 * Mensajes desde la app: SKIP_WAITING, CACHE_ALERTS (opcional).
 */
// Service Worker para PWA - Funciona completamente offline
const CACHE_NAME = 'alertas-cvn-v2';
const RUNTIME_CACHE = 'alertas-runtime-v2';

// Archivos estáticos a cachear
const STATIC_ASSETS = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/favicon.ico'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache abierto');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Service Worker: Eliminando cache antiguo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia principal: Network First para evitar servir versiones antiguas
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones no GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar esquemas no soportados (chrome-extension, moz-extension, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Navegación y recursos estáticos del mismo origen:
  // primero red (si hay conexión) y cache como respaldo.
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset =
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/static/');

  if (isSameOrigin && (request.mode === 'navigate' || isStaticAsset)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (url.protocol === 'http:' || url.protocol === 'https:')) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                try {
                  cache.put(request, responseToCache);
                } catch (error) {
                  console.warn('No se pudo cachear:', request.url, error.message);
                }
              });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (request.destination === 'document') {
              return caches.match('/');
            }
            return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
          });
        })
    );
  }
  // Para API calls: Network First con fallback a cache
  else if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Si la respuesta es exitosa y el esquema es soportado, cachearla
          if (response.ok && (url.protocol === 'http:' || url.protocol === 'https:')) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                try {
                  cache.put(request, responseToCache);
                } catch (error) {
                  // Ignorar errores de cacheo
                  console.warn('No se pudo cachear:', request.url, error.message);
                }
              });
          }
          return response;
        })
        .catch(() => {
          // Si falla la red, intentar desde cache
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Si no hay cache, devolver respuesta offline
              return new Response(
                JSON.stringify({ 
                  error: 'Sin conexión. Mostrando datos en caché.',
                  offline: true 
                }),
                {
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
  }
  // Para tiles del mapa (Leaflet)
  else if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE)
        .then((cache) => {
          return cache.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return fetch(request)
                .then((response) => {
                  if (response.ok) {
                    try {
                      cache.put(request, response.clone());
                    } catch (error) {
                      // Ignorar errores de cacheo
                      console.warn('No se pudo cachear tile:', request.url, error.message);
                    }
                  }
                  return response;
                })
                .catch(() => {
                  // Devolver tile vacío si no hay conexión
                  return new Response('', {
                    headers: { 'Content-Type': 'image/png' }
                  });
                });
            });
        })
    );
  }
});

// Mensaje para actualizar cache
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_ALERTS') {
    // Cachear alertas específicamente
    const alerts = event.data.alerts;
    caches.open(RUNTIME_CACHE)
      .then((cache) => {
        cache.put(
          new Request(`${self.location.origin}/api/alerts`),
          new Response(JSON.stringify(alerts), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      });
  }
});

// Notificaciones push recibidas desde el backend
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch (_error) {
    payload = { title: 'Nueva alerta', body: event.data.text() };
  }

  const title = payload.title || 'Nueva alerta en tu zona';
  const options = {
    body: payload.body || 'Se ha detectado una alerta dentro de tu zona de interés.',
    icon: payload.icon || '/logo192.png',
    badge: payload.badge || payload.icon || '/logo192.png',
    data: {
      url: payload.url || '/mapa',
      alertId: payload.alertId || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Abrir o enfocar la app al tocar la notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/mapa';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});

