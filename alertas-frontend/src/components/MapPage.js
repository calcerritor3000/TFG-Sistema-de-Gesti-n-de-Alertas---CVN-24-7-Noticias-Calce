/**
 * =============================================================================
 * MapPage — Mapa interactivo (React-Leaflet) y operativa de alertas
 * =============================================================================
 * Es el núcleo funcional del TFG para ciudadanos y administradores.
 *
 * Datos: alertas desde `GET /api/alerts` (polling, sin WebSockets), caché
 *   localStorage y mensajes al Service Worker cuando existe.
 * Mapa: marcadores por nivel/categoría, círculos de radio, capas mapa/satélite.
 * Admin: formularios crear/editar, subida de imagen (`/api/upload-image`),
 *   eliminación con modal de confirmación, reportes desde popup.
 * Rutas: query `?alerta=id` (p. ej. desde Noticias) centra y resalta la alerta.
 *
 * El archivo está seccionado con `// =========` (imports, estado, efectos,
 * CRUD, UI, modales). Para el tribunal: seguir esos bloques es más ágil que
 * leer el fichero de arriba a abajo de una vez.
 * =============================================================================
 */

// ============================================
// IMPORTS Y DEPENDENCIAS
// ============================================
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapPage.css';

// Sin WebSockets - se usa polling automático para actualizaciones

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

/** Límites de radio de alerta (deben coincidir con el backend; ver ALERT_RADIUS_MAX_METERS en .env) */
const ALERT_RADIUS_MIN = 50;
const ALERT_RADIUS_MAX = parseInt(process.env.REACT_APP_ALERT_RADIUS_MAX_METERS, 10) || 25000;

function clampAlertRadiusMeters(value, fallback) {
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ALERT_RADIUS_MAX, Math.max(ALERT_RADIUS_MIN, n));
}

// ============================================
// FUNCIONES AUXILIARES - ICONOS Y COLORES
// ============================================

/**
 * Crea un icono personalizado para los marcadores del mapa
 * @param {string} level - Nivel de alerta (rojo/amarillo/verde)
 * @param {string} categoria - Categoría de la alerta
 * @returns {L.DivIcon} Icono de Leaflet
 */
const createCustomIcon = (level, categoria = 'otro') => {
  const colors = {
    rojo: '#e74c3c',
    amarillo: '#f39c12',
    verde: '#27ae60'
  };
  
  const icons = {
    rojo: '🔴',
    amarillo: '🟡',
    verde: '🟢'
  };

  const categoryIcon = getCategoryIcon(categoria);

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${colors[level]};
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      color: white;
      position: relative;
    ">
      <div style="font-size: 14px; position: absolute; bottom: -2px; right: -2px; background: ${getCategoryColor(categoria)}; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border: 2px solid white;">
        ${categoryIcon}
      </div>
      ${icons[level]}
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

/**
 * Crea un icono para la ubicación del usuario
 * @returns {L.DivIcon} Icono de Leaflet para la ubicación del usuario
 */
const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `<div style="
      position: relative;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <!-- Círculo exterior animado -->
      <div class="user-location-pulse-outer" style="
        position: absolute;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: rgba(52, 152, 219, 0.4);
        animation: userLocationPulseOuter 2s ease-in-out infinite;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      "></div>
      <!-- Círculo medio animado -->
      <div class="user-location-pulse-middle" style="
        position: absolute;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(52, 152, 219, 0.5);
        animation: userLocationPulseMiddle 2s ease-in-out infinite;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      "></div>
      <!-- Círculo principal -->
      <div style="
        position: absolute;
        z-index: 10;
        background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 5px solid white;
        box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.3), 0 4px 20px rgba(52, 152, 219, 0.8), 0 0 30px rgba(52, 152, 219, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: userLocationPulse 2s ease-in-out infinite;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      ">
        <div style="
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
        "></div>
      </div>
    </div>`,
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -30]
  });
};

/**
 * Sincroniza la vista del mapa Leaflet con el estado React (`mapCenter`, `targetZoom`).
 * @param {[number, number]} coords - [lat, lng]
 * @param {number|null|undefined} zoom - nivel de zoom; si es null/undefined usa 13 por defecto
 */
function ChangeMapView({ coords, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      const z = zoom === null || zoom === undefined ? 13 : zoom;
      // Sin animación: evita “doble zoom” o pan raro al cambiar rápido de una alerta a otra
      map.setView(coords, z, { animate: false });
    }
  }, [coords, zoom, map]);
  return null;
}

// ============================================
// CONSTANTES - LÍMITES GEOGRÁFICOS
// ============================================

/**
 * Límites geográficos de la Comunidad Valenciana
 * Cubre las tres provincias: Alicante, Valencia y Castellón
 */
const COMUNIDAD_VALENCIANA_BOUNDS = {
  LAT_MIN: 38.2,   // Sur (extremo sur de Alicante)
  LAT_MAX: 40.7,   // Norte (extremo norte de Castellón)
  LNG_MIN: -1.2,   // Oeste (extremo oeste)
  LNG_MAX: 0.6     // Este (extremo este, incluyendo islas)
};

/**
 * Valida si las coordenadas están dentro de la Comunidad Valenciana
 * @param {number} lat - Latitud
 * @param {number} lng - Longitud
 * @returns {boolean} true si está dentro de los límites
 */
function validarComunidadValenciana(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  return latNum >= COMUNIDAD_VALENCIANA_BOUNDS.LAT_MIN &&
         latNum <= COMUNIDAD_VALENCIANA_BOUNDS.LAT_MAX &&
         lngNum >= COMUNIDAD_VALENCIANA_BOUNDS.LNG_MIN &&
         lngNum <= COMUNIDAD_VALENCIANA_BOUNDS.LNG_MAX;
}

/**
 * Componente que detecta clicks en el mapa
 * Actualiza las coordenadas de la alerta que se está creando/editando
 */
function MapClickHandler({ setNewAlert, setEditingAlert, editingAlert, showAppModal }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      
      // Validar que el click esté dentro de la Comunidad Valenciana
      if (validarComunidadValenciana(lat, lng)) {
        if (editingAlert) {
          // Si estamos editando, actualizar la alerta en edición
          setEditingAlert(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
        } else {
          // Si no, actualizar la nueva alerta
          setNewAlert(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
        }
      } else {
        showAppModal(
          'Ubicación no permitida',
          '⚠️ Solo se pueden crear alertas dentro de la Comunidad Valenciana',
          'warning'
        );
      }
    }
  });
  return null;
}

function SingleOpenPopupManager() {
  useMapEvents({
    popupopen(e) {
      const map = e.target;
      const openedPopup = e.popup;

      map.eachLayer((layer) => {
        if (layer instanceof L.Popup && layer !== openedPopup) {
          map.removeLayer(layer);
        }
      });
    }
  });

  return null;
}

/**
 * Devuelve el icono emoji según la categoría
 * @param {string} categoria - Categoría de la alerta
 * @returns {string} Emoji del icono
 */
const getCategoryIcon = (categoria) => {
  const icons = {
    incendio: '🔥',
    inundacion: '💧',
    dana: '🌀',
    trafico: '🚗',
    obras: '🚧',
    meteorologia: '🌦️',
    seguridad: '🛡️',
    salud: '🏥',
    medio_ambiente: '🌳',
    infraestructura: '🏗️',
    otro: '📍'
  };
  return icons[categoria] || '📍';
};

/**
 * Devuelve el color hexadecimal según la categoría
 * @param {string} categoria - Categoría de la alerta
 * @returns {string} Color hexadecimal
 */
const getCategoryColor = (categoria) => {
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
  return colors[categoria] || '#7f8c8d';
};

/**
 * Lista de todas las categorías disponibles
 * Cada categoría tiene: value (código), label (nombre), icon (emoji)
 */
const CATEGORIAS = [
  { value: 'incendio', label: '🔥 Incendio', icon: '🔥' },
  { value: 'inundacion', label: '💧 Inundación', icon: '💧' },
  { value: 'dana', label: '🌀 DANA', icon: '🌀' },
  { value: 'trafico', label: '🚗 Tráfico', icon: '🚗' },
  { value: 'obras', label: '🚧 Obras', icon: '🚧' },
  { value: 'meteorologia', label: '🌦️ Meteorología', icon: '🌦️' },
  { value: 'seguridad', label: '🛡️ Seguridad', icon: '🛡️' },
  { value: 'salud', label: '🏥 Salud', icon: '🏥' },
  { value: 'medio_ambiente', label: '🌳 Medio Ambiente', icon: '🌳' },
  { value: 'infraestructura', label: '🏗️ Infraestructura', icon: '🏗️' },
  { value: 'otro', label: '📍 Otro', icon: '📍' }
];

// ============================================
// COMPONENTE PRINCIPAL - MapPage
// ============================================

/**
 * Componente principal que muestra el mapa y gestiona las alertas
 * @param {object} user - Usuario actual (con token y role)
 * @param {function} onLogout - Función para cerrar sesión
 */
const MapPage = ({ user, onLogout }) => {
  // ============================================
  // HOOKS DE ROUTING
  // ============================================
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // ============================================
  // ESTADOS (STATE) - Variables que cambian
  // ============================================
  
  // Estados principales
  const [alerts, setAlerts] = useState([]); // Array de todas las alertas
  const [mapCenter, setMapCenter] = useState([39.4699, -0.3774]); // Centro del mapa [lat, lng] - Por defecto: Valencia
  // Estados de formularios
  const [newAlert, setNewAlert] = useState({ title: '', description: '', image_url: '', level: 'verde', categoria: 'otro', lat: '', lng: '', radius: '' }); // Datos de nueva alerta
  const [editingAlert, setEditingAlert] = useState(null); // Alerta en edición (null si no hay ninguna)
  const [loading, setLoading] = useState(false); // Estado de carga (mostrar spinner)
  
  // Estados de UI
  const [showTutorial, setShowTutorial] = useState(false); // Mostrar tutorial (desactivado por defecto)
  const [selectedAlert, setSelectedAlert] = useState(null); // ID de alerta seleccionada
  const [openPopupAlertId, setOpenPopupAlertId] = useState(null); // ID de alerta con popup abierto
  const alertMarkerRefs = useRef(new Map()); // Referencias a marcadores por ID
  const activePopupAlertIdRef = useRef(null); // ID del popup activo
  const leafletMapRef = useRef(null); // Referencia al mapa de Leaflet
  const [showAlertsList, setShowAlertsList] = useState(false); // Mostrar lista de alertas
  const [showCircles, setShowCircles] = useState(true); // Mostrar círculos de área
  const [showAdminPanel, setShowAdminPanel] = useState(user?.role === 'admin'); // Panel admin (solo admins)
  // Estados de filtros
  const [filterCategoria, setFilterCategoria] = useState('todos'); // Filtro por categoría
  const [searchQuery, setSearchQuery] = useState(''); // Búsqueda por texto
  
  // Estados de conexión y datos
  const [isOnline, setIsOnline] = useState(navigator.onLine); // Estado de conexión
  const [maintenanceAlerts, setMaintenanceAlerts] = useState([]); // Alertas de mantenimiento programado
  
  // Estados de mapa
  const [mapType, setMapType] = useState('street'); // Tipo de mapa: street, satellite, terrain
  
  // Estados de estadísticas (solo admin)
  const [showStats, setShowStats] = useState(false); // Mostrar modal de estadísticas
  const [stats, setStats] = useState(null); // Datos de estadísticas
  
  // Estados de geolocalización
  const [userLocation, setUserLocation] = useState(null); // Ubicación del usuario
  const [proximityAlerts, setProximityAlerts] = useState([]); // Alertas cuya zona de afectación cubre tu posición
  const [proximityAlertDismissed, setProximityAlertDismissed] = useState(
    () => localStorage.getItem('proximityAlertDismissed') === 'true'
  ); // Si el usuario cerró la alerta de proximidad
  const [subscriptionProximityAlerts, setSubscriptionProximityAlerts] = useState([]); // Alertas cercanas a zonas guardadas
  const [subscriptionAlertDismissed, setSubscriptionAlertDismissed] = useState(
    () => localStorage.getItem('subscriptionAlertDismissed') === 'true'
  ); // Si el usuario cerró la alerta de zonas
  
  // Estados de zonas de interés
  const [showSubscriptions, setShowSubscriptions] = useState(false); // Mostrar modal de zonas de interés
  const [subscriptions, setSubscriptions] = useState([]); // Zonas de interés del usuario
  const [newSubscription, setNewSubscription] = useState({ nombre_zona: '', lat: '', lng: '', radius: 1000 }); // Nueva zona de interés
  const [uploadingNewImage, setUploadingNewImage] = useState(false);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    () => ('Notification' in window ? Notification.permission : 'denied')
  ); // Permiso real de notificaciones del navegador
  const [appModal, setAppModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  }); // Modal interno para evitar alertas del navegador
  const [reportModal, setReportModal] = useState({
    visible: false,
    alertId: null,
    tipo: 'falsa',
    motivo: ''
  }); // Modal para reportar alertas sin usar prompt

  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    visible: false,
    alertId: null
  }); // Confirmación de borrado sin window.confirm (evita texto "localhost")

  // Ref para evitar llamadas repetidas cuando el token es inválido
  const tokenInvalidRef = useRef(false);
  
  // Ref para cancelar peticiones de alertas anteriores
  const abortControllerRef = useRef(null);
  
  // Ref para almacenar la función fetchAlerts y evitar problemas de inicialización
  const fetchAlertsRef = useRef(null);
  
  // Ref para evitar notificaciones duplicadas
  const notifiedAlertsRef = useRef(new Set());
  const notifiedSubscriptionAlertsRef = useRef(new Set());
  
  // Ref para controlar si está cargando
  const isLoadingRef = useRef(false);

  /** Solo centrar en el “promedio” de alertas una vez al cargar; no al deseleccionar tras timeout */
  const hasAppliedInitialAlertsCenterRef = useRef(false);
  /** Un solo temporizador al pulsar alertas seguidas (evita saltos al centro medio) */
  const clearSelectedAlertTimeoutRef = useRef(null);

  const showAppModal = (title, message, type = 'info') => {
    setAppModal({
      visible: true,
      title,
      message,
      type
    });
  };

  const openReportModal = (alertId) => {
    setReportModal({
      visible: true,
      alertId,
      tipo: 'falsa',
      motivo: ''
    });
  };

  const closeReportModal = () => {
    setReportModal(prev => ({
      ...prev,
      visible: false
    }));
  };

  const closeDeleteConfirmModal = () => {
    setDeleteConfirmModal({ visible: false, alertId: null });
  };

  const sendDeviceNotification = async (title, options = {}) => {
    if (!('Notification' in window)) {
      return { ok: false, reason: 'unsupported' };
    }

    if (Notification.permission !== 'granted') {
      return { ok: false, reason: 'permission_not_granted' };
    }

    const payload = {
      icon: '/logo192.png',
      ...options
    };

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.showNotification) {
          await registration.showNotification(title, payload);
          return { ok: true, channel: 'service_worker' };
        }
      }

      // Fallback a Notification directa si no hay service worker
      new Notification(title, payload);
      return { ok: true, channel: 'window_notification' };
    } catch (error) {
      console.error('Error al mostrar notificación del dispositivo:', error);
      return { ok: false, reason: 'runtime_error', error };
    }
  };

  const ensurePushSubscription = useCallback(async () => {
    if (!user?.token) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
    if (permission !== 'granted') {
      return;
    }

    try {
      await navigator.serviceWorker.register('/service-worker.js');
      const registration = await navigator.serviceWorker.ready;

      const keyResponse = await fetch('http://localhost:4000/api/push/public-key');
      if (!keyResponse.ok) {
        throw new Error(`No se pudo obtener VAPID key (${keyResponse.status})`);
      }
      const { publicKey } = await keyResponse.json();
      if (!publicKey) {
        throw new Error('Servidor sin clave pública VAPID');
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      await fetch('http://localhost:4000/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ subscription })
      });
    } catch (error) {
      console.error('Error configurando notificaciones push:', error);
    }
  }, [user?.token]);

  // ============================================
  // FUNCIONES AUXILIARES (declaradas antes de las funciones de carga)
  // ============================================
  
  /**
   * Devuelve el radio por defecto según el nivel de alerta
   * @param {string} level - Nivel (rojo/amarillo/verde)
   * @returns {number} Radio en metros
   */
  const getDefaultRadius = (level) => {
    switch (level) {
      case 'rojo': return 500;
      case 'amarillo': return 400;
      case 'verde': return 300;
      default: return 300;
    }
  };

  /**
   * Calcular distancia entre dos puntos (Haversine)
   * @param {number} lat1 - Latitud punto 1
   * @param {number} lon1 - Longitud punto 1
   * @param {number} lat2 - Latitud punto 2
   * @param {number} lon2 - Longitud punto 2
   * @returns {number} Distancia en metros
   */
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ============================================
  // FUNCIONES DE CARGA DE DATOS (declaradas antes de los useEffect)
  // ============================================
  
  /**
   * Obtiene alertas desde el servidor
   * Aplica filtros de nivel y categoría
   * Guarda en localStorage para uso offline
   */
  const fetchAlerts = useCallback((categoriaFilter = null) => {
    // Evitar múltiples peticiones simultáneas
    if (isLoadingRef.current) {
      return;
    }
    
    // Cancelar petición anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Crear nuevo AbortController para esta petición
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Marcar como cargando
    isLoadingRef.current = true;
    
    // Usar el parámetro si se proporciona, sino usar el estado actual
    const categoriaToUse = categoriaFilter !== null ? categoriaFilter : filterCategoria;
    
    // Construir URL con filtros usando URLSearchParams para mejor manejo
    const params = new URLSearchParams();
    params.set('estado', 'activa');
    
    if (categoriaToUse && categoriaToUse !== 'todos') {
      params.set('categoria', categoriaToUse.toLowerCase().trim());
    }
    
    const url = `http://localhost:4000/api/alerts?${params.toString()}`;
    
    fetch(url, {
      signal: abortController.signal
    })  // URL absoluta al API
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error HTTP: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        // Verificar que la petición no fue cancelada
        if (abortController.signal.aborted) {
          isLoadingRef.current = false;
          return;
        }
        
        // Asegurar que data es un array
        if (!Array.isArray(data)) {
          console.error('La respuesta no es un array:', data);
          data = [];
        }
        
        // Verificar que el filtro no haya cambiado mientras se cargaba
        const currentCategoria = categoriaFilter !== null ? categoriaFilter : filterCategoria;
        if (currentCategoria !== categoriaToUse) {
          isLoadingRef.current = false;
          return; // Ignorar respuesta obsoleta
        }
        
        // Asegurar que todas las alertas tengan un radio (usar valor por defecto si no existe)
        const alertsWithRadius = data.map(alert => ({
          ...alert,
          radius: alert.radius || getDefaultRadius(alert.level)
        }));
        
        // Solo actualizar si hay cambios reales (evitar re-renders innecesarios)
        setAlerts(prevAlerts => {
          const prevIds = new Set(prevAlerts.map(a => a.id));
          const newIds = new Set(alertsWithRadius.map(a => a.id));
          
          // Si son iguales, no actualizar
          if (prevIds.size === newIds.size && 
              [...prevIds].every(id => newIds.has(id)) &&
              prevAlerts.length === alertsWithRadius.length) {
            return prevAlerts;
          }
          
          return alertsWithRadius;
        });
        
        // Guardar en localStorage para uso offline
        try {
          localStorage.setItem('cachedAlerts', JSON.stringify(alertsWithRadius));
          localStorage.setItem('cachedAlertsTimestamp', new Date().toISOString());
        } catch (e) {
          console.error('Error al guardar en localStorage:', e);
        }
        
        // Cachear en Service Worker también
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          try {
            navigator.serviceWorker.controller.postMessage({
              type: 'CACHE_ALERTS',
              alerts: alertsWithRadius
            });
          } catch (e) {
            console.error('Error al enviar mensaje al Service Worker:', e);
          }
        }
        
        isLoadingRef.current = false;
      })
      .catch(err => {
        isLoadingRef.current = false;
        
        // Ignorar errores de abort
        if (err.name === 'AbortError') {
          return;
        }
        
        // Verificar que el filtro no haya cambiado mientras se cargaba
        const currentCategoria = categoriaFilter !== null ? categoriaFilter : filterCategoria;
        if (currentCategoria !== categoriaToUse) {
          return; // Ignorar error de petición obsoleta
        }
        
        console.error('Error al cargar alertas:', err);
        // Intentar cargar desde caché si falla la conexión
        const cachedAlerts = localStorage.getItem('cachedAlerts');
        if (cachedAlerts) {
          try {
            const alerts = JSON.parse(cachedAlerts);
            const alertsWithRadius = alerts.map(alert => ({
              ...alert,
              radius: alert.radius || getDefaultRadius(alert.level)
            }));
            setAlerts(alertsWithRadius);
            setIsOnline(false);
            console.log('📦 Usando alertas en caché debido a error de conexión');
          } catch (e) {
            console.error('Error al cargar desde caché:', e);
            setAlerts([]);
          }
        } else {
          setAlerts([]);
        }
      });
  }, [filterCategoria]);
  
  // Actualizar el ref cada vez que fetchAlerts cambie
  useEffect(() => {
    fetchAlertsRef.current = fetchAlerts;
  }, [fetchAlerts]);

  /**
   * Carga alertas desde servidor o caché local (si está offline)
   */
  const loadAlerts = useCallback(() => {
    if (navigator.onLine) {
      if (fetchAlertsRef.current) {
        fetchAlertsRef.current();
      }
    } else {
      // Cargar desde localStorage si está offline
      const cachedAlerts = localStorage.getItem('cachedAlerts');
      if (cachedAlerts) {
        try {
          const alerts = JSON.parse(cachedAlerts);
          const alertsWithRadius = alerts.map(alert => ({
            ...alert,
            radius: alert.radius || getDefaultRadius(alert.level)
          }));
          setAlerts(alertsWithRadius);
          console.log('📦 Alertas cargadas desde caché (modo offline)');
        } catch (err) {
          console.error('Error al cargar alertas desde caché:', err);
        }
      }
    }
  }, []);

  useEffect(() => {
    ensurePushSubscription();
  }, [ensurePushSubscription]);

  // ============================================
  // EFECTOS (USE EFFECT) - Código que se ejecuta automáticamente
  // ============================================
  
  /**
   * Efecto 1: Detectar estado de conexión online/offline
   * Recarga alertas cuando vuelve la conexión
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (fetchAlertsRef.current) {
        fetchAlertsRef.current(); // Recargar alertas cuando vuelve la conexión
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Efecto 2: Cargar datos iniciales al montar el componente
   * - Obtiene geolocalización del usuario
   * - Carga alertas desde servidor
   * - Conecta a WebSocket para notificaciones en tiempo real
   */
  useEffect(() => {
    // Si hay un parámetro de alerta en la URL, cargar alertas inmediatamente
    const alertaId = searchParams.get('alerta');
    if (alertaId) {
      // Cargar desde caché primero para mostrar algo rápido
      const cachedAlerts = localStorage.getItem('cachedAlerts');
      if (cachedAlerts) {
        try {
          const alerts = JSON.parse(cachedAlerts);
          const alertsWithRadius = alerts.map(alert => ({
            ...alert,
            radius: alert.radius || getDefaultRadius(alert.level)
          }));
          setAlerts(alertsWithRadius);
        } catch (e) {
          console.error('Error al cargar desde caché:', e);
        }
      }
    }
    
    // Cargar alertas desde servidor o caché local
    loadAlerts();
    
    // Solicitar permiso para notificaciones (si aún no se ha decidido)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
      });
    }

    let watchId = null;

    // Intentar obtener la ubicación del usuario (sin cambiar el centro del mapa automáticamente)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          // Guardar la ubicación del usuario
          setUserLocation({ lat, lng });
          
          // NO cambiar el centro del mapa automáticamente para no perder las alertas visibles
          // El usuario puede centrar manualmente si lo desea
        },
        (error) => {
          // Si no permite o hay error, no hacer nada
          console.log('Geolocalización no disponible:', error);
        }
      );
      
      // También configurar watchPosition para actualizar la ubicación en tiempo real
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
        },
        (error) => {
          console.log('Error al actualizar geolocalización:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 30000, // Actualizar cada 30 segundos
          timeout: 10000
        }
      );
      
    }

    // Polling automático cada 60 segundos para actualizar alertas (reducido para mejor rendimiento)
    const pollingInterval = setInterval(() => {
      if (fetchAlertsRef.current && !isLoadingRef.current) {
        fetchAlertsRef.current();
      }
    }, 60000); // 60 segundos (antes era 30)

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      clearInterval(pollingInterval);
    };
  }, [loadAlerts]);

  // Sincroniza el permiso cuando el usuario cambia ajustes del navegador
  useEffect(() => {
    const syncPermission = () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    };

    syncPermission();
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);

    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  // Recargar alertas al volver a la ruta del mapa y al recuperar foco/visibilidad
  useEffect(() => {
    if (location.pathname === '/mapa' && fetchAlertsRef.current && !isLoadingRef.current) {
      fetchAlertsRef.current();
    }
  }, [location.pathname]);

  useEffect(() => {
    const refreshAlertsOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (fetchAlertsRef.current && !isLoadingRef.current) {
        fetchAlertsRef.current();
      }
    };

    window.addEventListener('focus', refreshAlertsOnFocus);
    document.addEventListener('visibilitychange', refreshAlertsOnFocus);

    return () => {
      window.removeEventListener('focus', refreshAlertsOnFocus);
      document.removeEventListener('visibilitychange', refreshAlertsOnFocus);
    };
  }, []);

  /**
   * Efecto 3: Detectar alertas de mantenimiento programado
   * Filtra alertas que están programadas para las próximas 24 horas
   */
  useEffect(() => {
    const now = new Date();
    const upcoming = alerts.filter(alert => {
      if (!alert.is_maintenance || !alert.maintenance_start) return false;
      const startDate = new Date(alert.maintenance_start);
      const endDate = alert.maintenance_end ? new Date(alert.maintenance_end) : null;
      
      // Mostrar si el mantenimiento está programado para las próximas 24 horas
      const hoursUntil = (startDate - now) / (1000 * 60 * 60);
      return hoursUntil > 0 && hoursUntil <= 24 && (!endDate || endDate > now);
    });
    setMaintenanceAlerts(upcoming);
  }, [alerts]);

  // Estado para controlar el zoom cuando se navega desde noticias
  const [targetZoom, setTargetZoom] = useState(null);
  const [isNavigatingToAlert, setIsNavigatingToAlert] = useState(false);
  
  /**
   * Efecto 4: Ajustar el centro del mapa cuando hay alertas
   * Calcula el centro promedio de todas las alertas (solo una vez al cargar)
   * O se centra en una alerta específica si viene desde noticias
   */
  useEffect(() => {
    if (alerts.length === 0) {
      hasAppliedInitialAlertsCenterRef.current = false;
    }

    const alertaId = searchParams.get('alerta');
    
    // Si hay un parámetro de alerta en la URL, buscar y centrar en esa alerta
    if (alertaId) {
      setIsNavigatingToAlert(true);
      
      // Esperar a que las alertas se carguen (puede tardar un momento)
      // Si las alertas ya están cargadas, buscar inmediatamente
      if (alerts.length > 0) {
      // Buscar la alerta específica
      const alerta = alerts.find(a => a.id === parseInt(alertaId));
      if (alerta) {
        // Centrar el mapa en la alerta con zoom cercano
        setMapCenter([parseFloat(alerta.lat), parseFloat(alerta.lng)]);
        setTargetZoom(15); // Zoom cercano para ver bien la alerta
          // Seleccionar la alerta y mantenerla seleccionada
        setSelectedAlert(parseInt(alertaId));
        hasAppliedInitialAlertsCenterRef.current = true;
          
          // Limpiar el parámetro de la URL después de que el usuario haya visto la alerta
          // Pero mantener la alerta seleccionada visible
          const timeout = setTimeout(() => {
          setSearchParams({});
          setTargetZoom(null);
            setIsNavigatingToAlert(false);
            // Mantener la alerta seleccionada visible por más tiempo
            setTimeout(() => {
              setSelectedAlert(null);
            }, 5000); // Mantener seleccionada 5 segundos más
          }, 8000); // 8 segundos antes de limpiar el parámetro
          
          return () => clearTimeout(timeout);
    } else {
          // Si no se encuentra la alerta, puede que aún se esté cargando
          // Esperar un poco más antes de dar por perdida
          const timeout = setTimeout(() => {
            // Verificar una vez más si la alerta está disponible
            const alertaRecheck = alerts.find(a => a.id === parseInt(alertaId));
            if (!alertaRecheck && alerts.length > 0) {
              // Si después de esperar aún no está, limpiar el parámetro
              console.warn(`Alerta ${alertaId} no encontrada después de cargar`);
              setSearchParams({});
              setIsNavigatingToAlert(false);
    }
          }, 5000); // Esperar 5 segundos más
          
          return () => clearTimeout(timeout);
        }
      }
      // Si las alertas aún no están cargadas, el efecto se ejecutará de nuevo cuando se carguen
    } else if (alerts.length > 0 && !alertaId && !isNavigatingToAlert) {
      // Centrar en el punto medio solo la primera vez con datos (no al deseleccionar tras 2s)
      if (!selectedAlert && !hasAppliedInitialAlertsCenterRef.current) {
        const avgLat = alerts.reduce((sum, a) => sum + parseFloat(a.lat), 0) / alerts.length;
        const avgLng = alerts.reduce((sum, a) => sum + parseFloat(a.lng), 0) / alerts.length;
        setMapCenter([avgLat, avgLng]);
        setTargetZoom(8);
        hasAppliedInitialAlertsCenterRef.current = true;
      }
    }
  }, [alerts, searchParams, setSearchParams, isNavigatingToAlert, selectedAlert]);

  // ============================================
  // FUNCIONES AUXILIARES - UTILIDADES
  // ============================================
  
  /**
   * Devuelve el color hexadecimal según el nivel de alerta
   * @param {string} level - Nivel (rojo/amarillo/verde)
   * @returns {string} Color hexadecimal
   */
  const getColor = level => {
    switch (level) {
      case 'rojo': return '#e74c3c';
      case 'amarillo': return '#f39c12';
      case 'verde': return '#27ae60';
      default: return '#3498db';
    }
  };

  /**
   * Devuelve el emoji según el nivel de alerta
   * @param {string} level - Nivel (rojo/amarillo/verde)
   * @returns {string} Emoji
   */
  const getLevelIcon = level => {
    switch (level) {
      case 'rojo': return '🔴';
      case 'amarillo': return '🟡';
      case 'verde': return '🟢';
      default: return '🔵';
    }
  };

  /**
   * Devuelve el radio de una alerta (personalizado o por defecto)
   * @param {object} alert - Objeto de alerta
   * @returns {number} Radio en metros
   */
  const getAlertRadius = (alert) => {
    return alert.radius || getDefaultRadius(alert.level);
  };

  /**
   * Deselección automática tras un tiempo (un solo timeout si se pulsan varias alertas seguidas)
   */
  const scheduleClearSelectedAlert = (alertId) => {
    if (clearSelectedAlertTimeoutRef.current) {
      clearTimeout(clearSelectedAlertTimeoutRef.current);
      clearSelectedAlertTimeoutRef.current = null;
    }
    setSelectedAlert(alertId);
    clearSelectedAlertTimeoutRef.current = setTimeout(() => {
      setSelectedAlert(null);
      clearSelectedAlertTimeoutRef.current = null;
    }, 2000);
  };

  /**
   * Centra el mapa en una alerta específica
   * @param {object} alert - Objeto de alerta
   */
  const focusAlert = (alert) => {
    setMapCenter([parseFloat(alert.lat), parseFloat(alert.lng)]);
    setTargetZoom(13);
    scheduleClearSelectedAlert(alert.id);
  };

  // ============================================
  // FUNCIONES DE GESTIÓN DE ALERTAS (CRUD)
  // ============================================
  
  /**
   * Maneja cambios en el formulario de alerta
   * Valida coordenadas si se están editando
   * @param {Event} e - Evento del input
   */
  const handleAlertChange = e => {
    const { name, value } = e.target;
    const updatedAlert = { ...newAlert, [name]: value };
    
    // Si se están editando coordenadas, validar que estén dentro de la Comunidad Valenciana
    if ((name === 'lat' || name === 'lng') && updatedAlert.lat && updatedAlert.lng) {
      if (!validarComunidadValenciana(updatedAlert.lat, updatedAlert.lng)) {
        // No bloquear la escritura, pero mostrar advertencia visual
        console.warn('Coordenadas fuera de la Comunidad Valenciana');
      }
    }
    
    setNewAlert(updatedAlert);
  };

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const uploadAlertImage = async (file) => {
    if (!file) return null;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      throw new Error('Formato no permitido. Usa PNG, JPG, WEBP o GIF');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('La imagen supera 5MB');
    }

    const dataUrl = await fileToDataUrl(file);
    const res = await fetch('http://localhost:4000/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token}`
      },
      body: JSON.stringify({ dataUrl, fileName: file.name })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'No se pudo subir la imagen');
    }
    return data.image_url;
  };

  const handleNewImageSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNewImage(true);
    try {
      const imageUrl = await uploadAlertImage(file);
      setNewAlert(prev => ({ ...prev, image_url: imageUrl || '' }));
      showAppModal('Imagen subida', 'La imagen se ha asociado a la alerta.', 'success');
    } catch (err) {
      showAppModal('Error al subir imagen', err.message || 'No se pudo subir la imagen.', 'error');
    } finally {
      setUploadingNewImage(false);
      e.target.value = '';
    }
  };

  const handleEditImageSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editingAlert) return;
    setUploadingEditImage(true);
    try {
      const imageUrl = await uploadAlertImage(file);
      setEditingAlert(prev => ({ ...prev, image_url: imageUrl || '' }));
      showAppModal('Imagen subida', 'La imagen se ha actualizado para esta alerta.', 'success');
    } catch (err) {
      showAppModal('Error al subir imagen', err.message || 'No se pudo subir la imagen.', 'error');
    } finally {
      setUploadingEditImage(false);
      e.target.value = '';
    }
  };

  /**
   * Crea una nueva alerta
   * Valida coordenadas y envía POST al servidor
   * @param {Event} e - Evento del formulario
   */
  const handleSubmitAlert = async (e) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!newAlert.title || !newAlert.title.trim()) {
      alert('⚠️ Por favor, ingresa un título para la alerta');
      return;
    }
    
    if (!newAlert.description || !newAlert.description.trim()) {
      alert('⚠️ Por favor, ingresa una descripción para la alerta');
      return;
    }
    
    if (!newAlert.lat || !newAlert.lng) {
      alert('⚠️ Por favor, haz clic en el mapa para seleccionar una ubicación');
      return;
    }
    
    // Validar coordenadas numéricas
    const lat = parseFloat(newAlert.lat);
    const lng = parseFloat(newAlert.lng);
    
    if (isNaN(lat) || isNaN(lng)) {
      alert('⚠️ Las coordenadas deben ser números válidos');
      return;
    }
    
    if (!validarComunidadValenciana(lat, lng)) {
      showAppModal(
        'Ubicación no permitida',
        '⚠️ Solo se pueden crear alertas dentro de la Comunidad Valenciana',
        'warning'
      );
      return;
    }
    
    // Validar que el usuario tenga token
    if (!user?.token) {
      alert('⚠️ No estás autenticado. Por favor, inicia sesión de nuevo.');
      onLogout();
      return;
    }
    
    setLoading(true);
    
    try {
      // Preparar datos para enviar
      const alertData = {
        title: newAlert.title.trim(),
        description: newAlert.description.trim(),
        image_url: newAlert.image_url?.trim() || null,
        level: newAlert.level || 'verde',
        categoria: newAlert.categoria || 'otro',
        lat: lat,
        lng: lng,
        radius: clampAlertRadiusMeters(newAlert.radius, getDefaultRadius(newAlert.level || 'verde'))
      };
      
      const response = await fetch('http://localhost:4000/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
      },
        body: JSON.stringify(alertData)
      });
      
      // Verificar si la respuesta es OK
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Error HTTP: ${response.status}` }));
        throw new Error(errorData.error || `Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Verificar si hay error en la respuesta
        if (data.error) {
        throw new Error(data.error);
      }
      
      // Si todo está bien, recargar las alertas desde el servidor
      if (fetchAlertsRef.current) {
        fetchAlertsRef.current();
      }
      
      // Limpiar formulario
        setNewAlert({ title: '', description: '', image_url: '', level: 'verde', categoria: 'otro', lat: '', lng: '', radius: '' });
      
      // Mostrar mensaje de éxito
        showAppModal('Alerta creada', 'La alerta se ha creado correctamente.', 'success');
      
      // Centrar el mapa en la nueva alerta
      setMapCenter([lat, lng]);
      
    } catch (err) {
        console.error('Error al crear alerta:', err);
      alert(`❌ Error al crear alerta: ${err.message || 'Error desconocido'}`);
    } finally {
        setLoading(false);
    }
  };

  /**
   * Inicia la edición de una alerta
   * Solo disponible para administradores
   * @param {object} alert - Alerta a editar
   */
  const handleEditAlert = (alert) => {
    if (clearSelectedAlertTimeoutRef.current) {
      clearTimeout(clearSelectedAlertTimeoutRef.current);
      clearSelectedAlertTimeoutRef.current = null;
    }
    setEditingAlert({
      ...alert,
      radius:
        alert.radius != null && alert.radius !== ''
          ? String(Number(alert.radius))
          : String(getDefaultRadius(alert.level))
    });
    setMapCenter([parseFloat(alert.lat), parseFloat(alert.lng)]);
    setSelectedAlert(alert.id);
  };

  /**
   * Guarda los cambios de una alerta editada
   * Valida coordenadas y envía PUT al servidor
   * @param {Event} e - Evento del formulario
   */
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    
    if (!editingAlert.lat || !editingAlert.lng) {
      alert('⚠️ Por favor, selecciona una ubicación');
      return;
    }
    
    if (!validarComunidadValenciana(editingAlert.lat, editingAlert.lng)) {
      showAppModal(
        'Ubicación no permitida',
        '⚠️ Solo se pueden crear alertas dentro de la Comunidad Valenciana',
        'warning'
      );
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await fetch(`http://localhost:4000/api/alerts/${editingAlert.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token}`
        },
        body: JSON.stringify({
          title: editingAlert.title,
          description: editingAlert.description,
          image_url: editingAlert.image_url?.trim() || null,
          level: editingAlert.level,
          categoria: editingAlert.categoria,
          lat: editingAlert.lat,
          lng: editingAlert.lng,
          radius: clampAlertRadiusMeters(editingAlert.radius, getDefaultRadius(editingAlert.level)),
          is_maintenance: editingAlert.is_maintenance || false,
          maintenance_start: editingAlert.maintenance_start || null,
          maintenance_end: editingAlert.maintenance_end || null
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }
      
      const updatedAlert = {
        ...editingAlert,
        lat: parseFloat(editingAlert.lat),
        lng: parseFloat(editingAlert.lng),
        radius: clampAlertRadiusMeters(editingAlert.radius, getDefaultRadius(editingAlert.level))
      };
        const updatedAlerts = alerts.map(a => a.id === editingAlert.id ? updatedAlert : a);
        setAlerts(updatedAlerts);
        // Actualizar caché
        localStorage.setItem('cachedAlerts', JSON.stringify(updatedAlerts));
        localStorage.setItem('cachedAlertsTimestamp', new Date().toISOString());
        setEditingAlert(null);
        setSelectedAlert(null);
        showAppModal('Alerta actualizada', 'La alerta se ha actualizado correctamente.', 'success');
    } catch (err) {
      console.error('Error al actualizar alerta:', err);
      alert('Error al actualizar alerta');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cancela la edición de una alerta
   */
  const handleCancelEdit = () => {
    if (clearSelectedAlertTimeoutRef.current) {
      clearTimeout(clearSelectedAlertTimeoutRef.current);
      clearSelectedAlertTimeoutRef.current = null;
    }
    setEditingAlert(null);
    setSelectedAlert(null);
  };

  /**
   * Abre el modal de confirmación para eliminar una alerta (admin)
   * @param {number} id - ID de la alerta a eliminar
   */
  const handleDeleteAlert = (id) => {
    setDeleteConfirmModal({ visible: true, alertId: id });
  };

  /**
   * Ejecuta el borrado tras confirmar en el modal
   */
  const confirmDeleteAlert = () => {
    const id = deleteConfirmModal.alertId;
    if (id == null) return;

    fetch(`http://localhost:4000/api/alerts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user?.token}` }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          closeDeleteConfirmModal();
          showAppModal('No se pudo eliminar', data.error, 'error');
          return;
        }
        const updatedAlerts = alerts.filter((a) => a.id !== id);
        setAlerts(updatedAlerts);
        localStorage.setItem('cachedAlerts', JSON.stringify(updatedAlerts));
        localStorage.setItem('cachedAlertsTimestamp', new Date().toISOString());
        closeDeleteConfirmModal();
        if (editingAlert && editingAlert.id === id) {
          setEditingAlert(null);
          setSelectedAlert(null);
        }
        showAppModal('Alerta eliminada', 'La alerta se ha eliminado correctamente.', 'success');
      })
      .catch((err) => {
        console.error('Error al borrar alerta:', err);
        closeDeleteConfirmModal();
        showAppModal('Error', 'No se pudo eliminar la alerta. Inténtalo de nuevo.', 'error');
      });
  };

  // ============================================
  // FUNCIONES DE INTERACCIÓN CON ALERTAS
  // ============================================
  
  /**
   * Confirma una alerta (el usuario indica que es real)
   * @param {number} alertId - ID de la alerta
   */
  const handleConfirmAlert = async (alertId) => {
    if (!user?.token) {
      alert('⚠️ Debes iniciar sesión para confirmar alertas');
      return;
    }
    if (user?.role !== 'admin') {
      return;
    }

    try {
      const res = await fetch(`http://localhost:4000/api/alerts/${alertId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        }
      });
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }
      // Recargar alertas para actualizar contador
      if (fetchAlertsRef.current) {
        fetchAlertsRef.current();
      }
      alert('✅ Alerta confirmada');
    } catch (err) {
      console.error('Error al confirmar alerta:', err);
      alert('Error al confirmar alerta');
    }
  };

  /**
   * Reporta una alerta como falsa o incorrecta
   * @param {number} alertId - ID de la alerta
   * @param {string} tipo - Tipo de reporte (falsa, desactualizada, etc.)
   * @param {string} motivo - Motivo del reporte (opcional)
   */
  const handleReportAlert = async (alertId, tipo, motivo = '') => {
    if (!user?.token) {
      alert('⚠️ Debes iniciar sesión para reportar alertas');
      return false;
    }
    if (user?.role !== 'admin') {
      return false;
    }

    try {
      const res = await fetch(`http://localhost:4000/api/alerts/${alertId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ tipo, motivo })
      });
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
        return false;
      }
      alert('✅ Alerta reportada. Los administradores la revisarán.');
      return true;
    } catch (err) {
      console.error('Error al reportar alerta:', err);
      alert('Error al reportar alerta');
      return false;
    }
  };

  const handleSubmitReportModal = async () => {
    const ok = await handleReportAlert(
      reportModal.alertId,
      reportModal.tipo,
      reportModal.motivo.trim()
    );

    if (ok) {
      closeReportModal();
    }
  };

  // Alertas en cuya zona estás: distancia al centro <= radio de la alerta (mismo criterio que el círculo del mapa)
  const nearbyAlerts = useMemo(() => {
    if (!userLocation || alerts.length === 0) return [];

    return alerts.filter(alert => {
      if (alert.estado && alert.estado !== 'activa') return false;
      const alertLat = parseFloat(alert.lat);
      const alertLng = parseFloat(alert.lng);
      if (isNaN(alertLat) || isNaN(alertLng)) return false;

      const distance = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        alertLat,
        alertLng
      );
      const zoneMeters = getAlertRadius(alert);
      return distance <= zoneMeters;
    });
  }, [userLocation, alerts]);

  // Alertas cercanas a zonas de interés (ej: "Mi casa", "Trabajo")
  const nearbySubscriptionAlerts = useMemo(() => {
    if (!subscriptions.length || alerts.length === 0) return [];

    const activeAlerts = alerts.filter(alert => alert.estado === 'activa' || !alert.estado);
    const matches = [];

    subscriptions.forEach(subscription => {
      const subLat = parseFloat(subscription.lat);
      const subLng = parseFloat(subscription.lng);
      const subRadius = parseInt(subscription.radius, 10) || 1000;

      if (isNaN(subLat) || isNaN(subLng)) return;

      activeAlerts.forEach(alert => {
        const alertLat = parseFloat(alert.lat);
        const alertLng = parseFloat(alert.lng);
        if (isNaN(alertLat) || isNaN(alertLng)) return;

        const distance = calculateDistance(subLat, subLng, alertLat, alertLng);
        if (distance <= subRadius) {
          matches.push({
            key: `${subscription.id}-${alert.id}`,
            subscriptionId: subscription.id,
            subscriptionName: subscription.nombre_zona,
            alert,
            distance: Math.round(distance)
          });
        }
      });
    });

    return matches;
  }, [subscriptions, alerts]);

  useEffect(() => {
    setProximityAlerts(nearbyAlerts);

    // Notificar solo alertas nuevas (evitar duplicados)
    if (nearbyAlerts.length > 0 && 'Notification' in window && notificationPermission === 'granted') {
      const newAlerts = nearbyAlerts.filter(alert => !notifiedAlertsRef.current.has(alert.id));
      
      if (newAlerts.length > 0) {
        // Marcar como notificadas
        newAlerts.forEach(alert => notifiedAlertsRef.current.add(alert.id));

        // Limpiar IDs antiguos que ya no están cerca (para permitir re-notificación si vuelven)
        const currentIds = new Set(nearbyAlerts.map(a => a.id));
        notifiedAlertsRef.current.forEach(id => {
          if (!currentIds.has(id)) {
            notifiedAlertsRef.current.delete(id);
          }
        });
        
        // Crear notificación solo para nuevas alertas
        if (newAlerts.length === 1) {
          sendDeviceNotification(`⚠️ Has entrado en la zona de una alerta`, {
            body: newAlerts[0].title,
            tag: `alert-${newAlerts[0].id}` // Tag para evitar duplicados del sistema
          });
        } else {
          sendDeviceNotification(`⚠️ Has entrado en ${newAlerts.length} zonas de alerta`, {
            body: newAlerts.map(a => a.title).join(', '),
            tag: 'multiple-alerts'
          });
        }
      }
    }
  }, [nearbyAlerts, notificationPermission]);

  useEffect(() => {
    setSubscriptionProximityAlerts(nearbySubscriptionAlerts);

    if (nearbySubscriptionAlerts.length > 0 && 'Notification' in window && notificationPermission === 'granted') {
      const newMatches = nearbySubscriptionAlerts.filter(
        item => !notifiedSubscriptionAlertsRef.current.has(item.key)
      );

      if (newMatches.length > 0) {
        newMatches.forEach(item => notifiedSubscriptionAlertsRef.current.add(item.key));

        const currentKeys = new Set(nearbySubscriptionAlerts.map(item => item.key));
        notifiedSubscriptionAlertsRef.current.forEach(key => {
          if (!currentKeys.has(key)) {
            notifiedSubscriptionAlertsRef.current.delete(key);
          }
        });

        if (newMatches.length === 1) {
          const hit = newMatches[0];
          sendDeviceNotification(`⚠️ Alerta cerca de "${hit.subscriptionName}"`, {
            body: `${hit.alert.title} (${hit.distance}m)`,
            tag: `subscription-${hit.key}`
          });
        } else {
          sendDeviceNotification(`⚠️ ${newMatches.length} alertas en tus zonas`, {
            body: newMatches.slice(0, 3).map(item => `${item.subscriptionName}: ${item.alert.title}`).join(' | '),
            tag: 'multiple-subscription-alerts'
          });
        }
      }
    }
  }, [nearbySubscriptionAlerts, notificationPermission]);

  const handleTestNotification = async () => {
    if (!('Notification' in window)) {
      showAppModal('Notificaciones no disponibles', 'Este navegador no soporta notificaciones.', 'error');
      return;
    }

    if (notificationPermission !== 'granted') {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          sendDeviceNotification('✅ Notificación de prueba', {
            body: 'Las notificaciones funcionan correctamente en este dispositivo.',
            tag: 'test-notification'
          }).then((result) => {
            if (result.ok) {
              showAppModal('Notificación enviada', 'Se ha enviado una notificación de prueba al dispositivo.', 'success');
            } else {
              showAppModal('No se pudo enviar', 'No se pudo mostrar la notificación del sistema. Revisa permisos del navegador y de Windows.', 'warning');
            }
          });
        } else {
          showAppModal('Permiso denegado', 'Debes permitir notificaciones en el navegador y en Windows.', 'warning');
        }
      });
      return;
    }

    const result = await sendDeviceNotification('✅ Notificación de prueba', {
      body: 'Las notificaciones funcionan correctamente en este dispositivo.',
      tag: 'test-notification'
    });

    if (result.ok) {
      showAppModal('Notificación enviada', `Canal: ${result.channel}. Si no aparece, revisa notificaciones de Windows.`, 'success');
    } else {
      showAppModal('No se pudo enviar', 'No se pudo mostrar la notificación del sistema. Activa notificaciones de Windows para el navegador.', 'warning');
    }
  };

  // Compartir alerta
  const handleShareAlert = (alert) => {
    const url = `${window.location.origin}?alert=${alert.id}`;
    if (navigator.share) {
      navigator.share({
        title: alert.title,
        text: alert.description,
        url: url
      }).catch(err => console.log('Error al compartir:', err));
    } else {
      // Fallback: copiar al portapapeles
      navigator.clipboard.writeText(url).then(() => {
        alert('✅ Enlace copiado al portapapeles');
      }).catch(err => {
        console.error('Error al copiar al portapapeles:', err);
        alert('❌ Error al copiar el enlace');
      });
    }
  };

  // Permisos: ubicación (ya se pide al cargar) + notificaciones al entrar en zona de alerta
  const enableProximityAlerts = async () => {
    if (!navigator.geolocation) {
      showAppModal('Geolocalización', 'Tu navegador no permite obtener la posición.', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {
        showAppModal('Ubicación', 'Activa la ubicación del navegador para detectar si entras en una zona de alerta.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    if (!('Notification' in window)) {
      showAppModal('Notificaciones', 'Este navegador no muestra avisos del sistema; verás el aviso en pantalla en el mapa.', 'info');
      return;
    }
    if (Notification.permission === 'granted') {
      showAppModal('Listo', 'Cuando entres en el círculo de una alerta (su radio en el mapa), recibirás un aviso si el navegador lo permite.', 'success');
      return;
    }
    if (Notification.permission === 'denied') {
      showAppModal('Notificaciones bloqueadas', 'Desbloquea las notificaciones para este sitio en la configuración del navegador.', 'warning');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      showAppModal('Listo', 'Te avisaremos al entrar en la zona de afectación de una alerta (mientras la pestaña esté abierta o según permita el sistema).', 'success');
    } else {
      showAppModal('Sin notificaciones del sistema', 'Seguirás viendo el aviso en el mapa al estar dentro del radio de la alerta.', 'info');
    }
  };

  const useCurrentLocationForSubscription = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewSubscription(prev => ({
          ...prev,
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6)
        }));
      },
      () => {
        alert('No se pudo obtener tu ubicación actual');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Función para verificar si un token JWT está expirado
  const isTokenExpired = (token) => {
    if (!token) return true;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      
      const payload = JSON.parse(atob(parts[1]));
      
      if (!payload.exp) return false;
      
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      
      return expirationTime < currentTime;
    } catch (error) {
      return true;
    }
  };

  // Cargar zonas de interés
  const loadSubscriptions = async () => {
    // Si el token ya fue marcado como inválido, no intentar cargar
    if (tokenInvalidRef.current) {
      return;
    }
    
    if (!user?.token) {
      setSubscriptions([]);
      return;
    }
    
    // Verificar si el token está expirado antes de hacer la petición
    if (isTokenExpired(user.token)) {
      tokenInvalidRef.current = true;
      setSubscriptions([]);
      localStorage.removeItem('user');
      if (onLogout) {
        onLogout();
      }
      navigate('/login');
      return;
    }
    
    try {
      // Cada usuario debe ver únicamente sus propias zonas de interés
      const res = await fetch('http://localhost:4000/api/subscriptions', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      // Si el token es inválido o expirado (403/401), limpiar sesión y redirigir al login
      if (res.status === 403 || res.status === 401) {
        tokenInvalidRef.current = true;
        setSubscriptions([]);
        // Intentar leer el mensaje de error pero no mostrar en consola
        try {
          await res.json();
        } catch {
          // Ignorar errores de parsing
        }
        // Limpiar sesión y redirigir al login
        localStorage.removeItem('user');
        if (onLogout) {
          onLogout();
        }
        navigate('/login');
        return;
      }
      
      // Si la petición fue exitosa, resetear el flag
      tokenInvalidRef.current = false;
      
      if (!res.ok) {
        throw new Error(`Error HTTP: ${res.status}`);
      }
      
      let data;
      try {
        data = await res.json();
        } catch (jsonError) {
          console.error('Error al parsear JSON de zonas de interés:', jsonError);
          data = [];
        }
        
        setSubscriptions(Array.isArray(data) ? data : []);
      } catch (err) {
        // Solo mostrar error si no es un error de autenticación
        if (!err.message.includes('403') && !err.message.includes('401')) {
          console.error('Error al cargar zonas de interés:', err);
        }
        setSubscriptions([]);
      }
    };

  // Crear zona de interés
  const handleCreateSubscription = async () => {
    if (!newSubscription.nombre_zona || !newSubscription.lat || !newSubscription.lng) {
      alert('⚠️ Completa todos los campos');
      return;
    }

    try {
      const res = await fetch('http://localhost:4000/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify(newSubscription)
      });
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }
      showAppModal('Zona creada', 'La zona de interés se ha creado correctamente.', 'success');
      setNewSubscription({ nombre_zona: '', lat: '', lng: '', radius: 1000 });
      loadSubscriptions();
    } catch (err) {
      console.error('Error al crear zona de interés:', err);
      alert('Error al crear zona de interés');
    }
  };

  // Cargar zonas de interés al iniciar
  useEffect(() => {
    // Resetear el flag cuando el usuario cambia (nuevo login)
    tokenInvalidRef.current = false;
    if (user?.token) {
      loadSubscriptions();
    } else {
      setSubscriptions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Logout
  const handleLogout = () => {
    onLogout();
    // Resetear al centro por defecto al hacer logout
    setMapCenter([39.4699, -0.3774]);
  };

  return (
    <div className="map-page-container">
      
      {/* Banner de Estado Offline */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#e74c3c',
          color: 'white',
          padding: '10px 20px',
          textAlign: 'center',
          zIndex: 10000,
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          ⚠️ Modo Offline - Estás viendo alertas en caché. Algunas funciones pueden no estar disponibles.
        </div>
      )}

      {/* Banner de Mantenimiento Programado */}
      {maintenanceAlerts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: !isOnline ? '40px' : '0',
          left: 0,
          right: 0,
          background: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
          color: 'white',
          padding: '12px 20px',
          zIndex: 9999,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🔧</span>
              <div>
                <strong>Mantenimiento Programado:</strong>
                {maintenanceAlerts.map((alert, idx) => {
                  const startDate = new Date(alert.maintenance_start);
                  const hoursUntil = Math.round((startDate - new Date()) / (1000 * 60 * 60));
                  return (
                    <span key={alert.id} style={{ marginLeft: idx > 0 ? '10px' : '5px' }}>
                      {alert.title} - {hoursUntil > 0 ? `En ${hoursUntil}h` : 'Próximamente'} 
                      ({startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})
                    </span>
                  );
                })}
              </div>
            </div>
            <button 
              onClick={() => setMaintenanceAlerts([])}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              × Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Header con Logo */}
      <div className="map-header" style={{ 
        marginTop: maintenanceAlerts.length > 0 ? (!isOnline ? '80px' : '60px') : (!isOnline ? '40px' : '0'),
        transition: 'margin-top 0.3s ease'
      }}>
        <div className="map-header-content">
          <div className="map-logo-container">
            <img 
              src="/CVN_Noticias.png" 
              alt="CVN Noticias" 
              className="map-logo-image"
            />
          </div>
          <div className="map-header-stats">
            <span className="map-stat-item">
              <span className="map-stat-icon">🚨</span>
              <span className="map-stat-value">{alerts.length}</span>
              <span className="map-stat-label">Alertas</span>
            </span>
            <span className="map-stat-divider">|</span>
            <span className="map-stat-item">
              <span className="map-stat-icon">👤</span>
              <span className="map-stat-label">{user?.username}</span>
            </span>
            <span className="map-stat-divider">|</span>
            <span className="map-stat-item">
              <span className="map-stat-icon">🔑</span>
              <span className="map-stat-label">{user?.role}</span>
            </span>
          </div>
          <div className={`map-user-info ${user?.role !== 'admin' ? 'map-user-info-normal' : ''}`}>
            <button 
              onClick={() => setShowTutorial(true)} 
              className="map-btn map-btn-help"
              title="Ver tutorial"
            >
              Ayuda
            </button>
            {user?.role === 'admin' && (
              <button 
                onClick={() => setShowAlertsList(!showAlertsList)} 
                className="map-btn map-btn-list"
                title="Ver lista de alertas"
              >
                📋 Alertas ({alerts.length})
              </button>
            )}
            <button 
              onClick={() => setShowCircles(!showCircles)} 
              className="map-btn map-btn-toggle"
              title={showCircles ? 'Ocultar áreas' : 'Mostrar áreas'}
            >
              {showCircles ? '🔵 Áreas' : '⚪ Áreas'}
            </button>
            <select 
              id="map-filter-categoria"
              name="map-filter-categoria"
              value={filterCategoria} 
              onChange={(e) => {
                const newCategoria = e.target.value;
                setFilterCategoria(newCategoria);
                // Pasar el nuevo valor directamente para evitar problemas de timing
                if (fetchAlertsRef.current) {
                  fetchAlertsRef.current(newCategoria);
                }
              }}
              className="map-filter-select"
              title="Filtrar por categoría"
            >
              <option value="todos">Todas las categorías</option>
              {CATEGORIAS.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              id="map-type-select"
              name="map-type-select"
              value={mapType}
              onChange={(e) => setMapType(e.target.value)}
              className="map-filter-select"
              title="Tipo de mapa"
            >
              <option value="street">Callejero</option>
              <option value="satellite">Satélite</option>
              <option value="terrain">Terreno</option>
            </select>
            <input
              id="map-search-input"
              name="map-search-input"
              type="text"
              placeholder="🔍 Buscar alertas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="map-search-input"
            />
            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  fetch('http://localhost:4000/api/stats')
                    .then(res => res.json())
                    .then(data => {
                      setStats(data);
                      setShowStats(true);
                    })
                    .catch(err => console.error('Error al cargar estadísticas:', err));
                }}
                className="map-btn map-btn-toggle"
                title="Ver estadísticas"
              >
                📊 Estadísticas
              </button>
            )}
            <button 
              onClick={() => setShowSubscriptions(!showSubscriptions)}
              className="map-btn map-btn-toggle"
              title="Zonas de interés"
            >
              📍 Zonas de Interés
            </button>
            <button
              onClick={() => navigate('/noticias')}
              className="map-btn map-btn-toggle"
              title="Ver noticias"
            >
              📰 Noticias
            </button>
            <button
              onClick={() => navigate('/tiempo')}
              className="map-btn map-btn-toggle"
              title="Ver previsión meteorológica"
            >
              🌤️ Tiempo
            </button>
            {user?.role !== 'admin' && (
              <button 
                onClick={() => setShowAlertsList(!showAlertsList)} 
                className="map-btn map-btn-list"
                title="Ver lista de alertas"
              >
                📋 Alertas ({alerts.length})
              </button>
            )}
          </div>
        </div>
        <button onClick={handleLogout} className="map-btn map-btn-logout">
          🚪 Cerrar Sesión
        </button>
      </div>

      {/* Tutorial/Guía de uso con variantes por rol */}
      {showTutorial && (
        <div className="tutorial-overlay">
          <div className="tutorial-card">
            <div className="tutorial-header">
              <h2>{user?.role === 'admin' ? '📖 Guía de Uso · Administración' : '📖 Guía de Uso · Usuario'}</h2>
              <button onClick={() => setShowTutorial(false)} className="btn-close">✕</button>
            </div>
            <div className="tutorial-content">
              <div className="tutorial-step">
                <span className="step-number">1</span>
                <div>
                  <strong>Ver Alertas:</strong> Las alertas aparecen como círculos de colores en el mapa.
                  <div className="tutorial-legend">
                    <div className="tutorial-legend-item">
                      <span className="tutorial-legend-icon" style={{ color: '#e74c3c' }}>🔴</span>
                      <span>Rojo - Alto riesgo</span>
                    </div>
                    <div className="tutorial-legend-item">
                      <span className="tutorial-legend-icon" style={{ color: '#f39c12' }}>🟡</span>
                      <span>Amarillo - Riesgo medio</span>
                    </div>
                    <div className="tutorial-legend-item">
                      <span className="tutorial-legend-icon" style={{ color: '#27ae60' }}>🟢</span>
                      <span>Verde - Bajo riesgo</span>
                    </div>
                  </div>
                </div>
              </div>
              {user.role === 'admin' && (
                <div className="tutorial-step">
                  <span className="step-number">2</span>
                  <div>
                    <strong>Crear Alerta (Solo Admin):</strong>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      <li>Haz clic en el mapa para seleccionar la ubicación</li>
                      <li>Completa el título y descripción</li>
                      <li>Selecciona el nivel de peligro</li>
                      <li>Haz clic en "Crear Alerta"</li>
                    </ul>
                  </div>
                </div>
              )}
              <div className="tutorial-step">
                <span className="step-number">{user.role === 'admin' ? '3' : '2'}</span>
                <div>
                  <strong>Interactuar con el Mapa:</strong>
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li>Haz clic en los círculos de colores para ver detalles</li>
                    <li>Arrastra el mapa para navegar</li>
                    <li>Usa el botón "📋 Alertas" para ver la lista completa</li>
                  </ul>
                </div>
              </div>
              {user.role === 'admin' ? (
                <div className="tutorial-step">
                  <span className="step-number">4</span>
                  <div>
                    <strong>Importante (Admin):</strong> Solo se pueden crear alertas dentro de la Comunidad Valenciana.
                  </div>
                </div>
              ) : (
                <div className="tutorial-step">
                  <span className="step-number">3</span>
                  <div>
                    <strong>Importante (Usuario):</strong> Puedes gestionar tus zonas de interés para recibir avisos relevantes.
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setShowTutorial(false)} className="tutorial-close-btn">
              Entendido, empezar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Alertas - Mejorada para usuarios */}
      {showAlertsList && (
        <div className="alerts-list">
          <div className="alerts-list-header">
            <h3>📋 Alertas Activas ({alerts.length})</h3>
            <button onClick={() => setShowAlertsList(false)} className="btn-close">✕</button>
          </div>
          <div className="alerts-list-content">
            {alerts.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#7f8c8d' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <p style={{ fontSize: '16px', fontWeight: '500' }}>No hay alertas activas</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>Todas las alertas están resueltas o no hay alertas en este momento.</p>
              </div>
            ) : (
              alerts
                .filter(alert => alert.estado === 'activa' || !alert.estado) // Solo mostrar alertas activas
                .map(alert => (
                <div 
                  key={alert.id} 
                  className={`alert-list-item ${selectedAlert === alert.id ? 'alert-list-item-selected' : ''}`}
                  style={{
                    borderLeft: `4px solid ${getColor(alert.level)}`,
                    background: selectedAlert === alert.id ? getColor(alert.level) + '10' : 'white'
                  }}
                  onClick={() => focusAlert(alert)}
                >
                  <div className="alert-list-item-content">
                    <span className="alert-list-item-icon">{getLevelIcon(alert.level)}</span>
                    <div className="alert-list-item-info">
                      <div className="alert-list-item-title">{alert.title}</div>
                      <div className="alert-list-item-description">
                        {alert.description.length > 60 ? alert.description.substring(0, 60) + '...' : alert.description}
                      </div>
                      <div className="alert-list-item-date">
                        {alert.created_at && new Date(alert.created_at).toLocaleDateString('es-ES')}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mapa */}
      <div className="map-container">
        <MapContainer 
          center={mapCenter} 
          zoom={alerts.length > 0 ? 8 : 7} 
          className="map-leaflet-container"
          whenCreated={(mapInstance) => {
            leafletMapRef.current = mapInstance;
          }}
          maxBounds={[
            [COMUNIDAD_VALENCIANA_BOUNDS.LAT_MIN, COMUNIDAD_VALENCIANA_BOUNDS.LNG_MIN],
            [COMUNIDAD_VALENCIANA_BOUNDS.LAT_MAX, COMUNIDAD_VALENCIANA_BOUNDS.LNG_MAX]
          ]}
          maxBoundsViscosity={1.0}
        >
          <ChangeMapView coords={mapCenter} zoom={targetZoom} />
          <TileLayer
            key={`tilelayer-${mapType}`}
            url={
              mapType === 'satellite' 
                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                : mapType === 'terrain'
                ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            }
            attribution={
              mapType === 'satellite'
                ? '&copy; <a href="https://www.esri.com/">Esri</a>'
                : mapType === 'terrain'
                ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }
          />
          {user?.role === 'admin' && (
            <MapClickHandler 
              setNewAlert={setNewAlert} 
              setEditingAlert={setEditingAlert}
              editingAlert={editingAlert}
              showAppModal={showAppModal}
            />
          )}
          <SingleOpenPopupManager />
          
          {/* Marcador para la nueva alerta (se actualiza cada vez que se hace clic) */}
          {user?.role === 'admin' && !editingAlert && newAlert.lat && newAlert.lng && (
            <Marker
              position={[parseFloat(newAlert.lat), parseFloat(newAlert.lng)]}
              icon={L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                  background: #3498db;
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  border: 3px solid white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 18px;
                  color: white;
                ">📍</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
              })}
            >
              <Popup>
                <div style={{ textAlign: 'center', padding: '5px' }}>
                  <strong>📍 Ubicación seleccionada</strong><br/>
                  <small>Lat: {newAlert.lat}<br/>Lng: {newAlert.lng}</small>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Marcador para la alerta en edición (se actualiza cada vez que se hace clic) */}
          {user?.role === 'admin' && editingAlert && editingAlert.lat && editingAlert.lng && (
            <Marker
              position={[parseFloat(editingAlert.lat), parseFloat(editingAlert.lng)]}
              icon={L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                  background: #e67e22;
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  border: 3px solid white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 18px;
                  color: white;
                ">ED</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
              })}
            >
              <Popup>
                <div style={{ textAlign: 'center', padding: '5px' }}>
                  <strong>ED Editando ubicación</strong><br/>
                  <small>Lat: {editingAlert.lat}<br/>Lng: {editingAlert.lng}</small>
                </div>
              </Popup>
            </Marker>
          )}
          
          {alerts
            .filter(alert => {
              // Normalizar categoría: si es null/undefined, usar 'otro'
              const alertCategoria = alert.categoria || 'otro';
              const matchCategoria = filterCategoria === 'todos' || alertCategoria === filterCategoria;
              const matchSearch = !searchQuery || 
                alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                alert.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (alertCategoria && alertCategoria.toLowerCase().includes(searchQuery.toLowerCase()));
              return matchCategoria && matchSearch;
            })
            .map(alert => (
            <React.Fragment key={alert.id}>
              {/* Círculo pequeño para mostrar área de influencia (opcional) */}
              {showCircles && (
                <Circle
                  center={[parseFloat(alert.lat), parseFloat(alert.lng)]}
                  radius={getAlertRadius(alert)}
                  color={getColor(alert.level)}
                  fillColor={getColor(alert.level)}
                  fillOpacity={selectedAlert === alert.id ? 0.25 : 0.12}
                  weight={selectedAlert === alert.id ? 3 : 1.5}
                />
              )}
              {/* Marcador principal */}
              <Marker
                ref={(markerInstance) => {
                  if (markerInstance) {
                    alertMarkerRefs.current.set(alert.id, markerInstance);
                  } else {
                    alertMarkerRefs.current.delete(alert.id);
                  }
                }}
                position={[parseFloat(alert.lat), parseFloat(alert.lng)]}
                icon={createCustomIcon(alert.level, alert.categoria || 'otro')}
                eventHandlers={{
                  click: () => {
                    scheduleClearSelectedAlert(alert.id);
                  },
                  popupopen: () => {
                    activePopupAlertIdRef.current = alert.id;
                    setOpenPopupAlertId(alert.id);
                  },
                  popupclose: () => {
                    setOpenPopupAlertId((currentOpenId) =>
                      currentOpenId === alert.id ? null : currentOpenId
                    );
                    if (activePopupAlertIdRef.current === alert.id) {
                      activePopupAlertIdRef.current = null;
                    }
                  }
                }}
              >
                <Popup className="custom-popup" autoClose closeOnClick>
                  <div className="alert-popup-content">
                    <div className={`alert-popup-header ${alert.level === 'rojo' ? 'bg-red' : alert.level === 'amarillo' ? 'bg-yellow' : 'bg-green'}`}>
                      <span style={{ fontSize: '20px' }}>{getLevelIcon(alert.level)}</span>
                      <span>{alert.title}</span>
                    </div>
                    <p className="alert-popup-title">{alert.description}</p>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ 
                        background: getCategoryColor(alert.categoria || 'otro'), 
                        color: 'white', 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '12px',
                        marginRight: '8px'
                      }}>
                        {getCategoryIcon(alert.categoria || 'otro')} {alert.categoria || 'otro'}
                      </span>
                      {alert.confirmaciones > 0 && (
                        <span style={{ fontSize: '12px', color: '#27ae60' }}>
                          ✅ {alert.confirmaciones} confirmaciones
                        </span>
                      )}
                    </div>
                    <div className="alert-popup-footer">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={`alert-popup-badge ${alert.level === 'rojo' ? 'badge-red' : alert.level === 'amarillo' ? 'badge-yellow' : 'badge-green'}`}>
                          {getLevelIcon(alert.level)} {alert.level}
                        </span>
                        {alert.created_at && (
                          <span className="alert-popup-date">
                            📅 {new Date(alert.created_at).toLocaleDateString('es-ES', { 
                              day: 'numeric', 
                              month: 'short', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {user && (
                          <>
                            <button 
                              onClick={() => handleShareAlert(alert)}
                              style={{ 
                                background: '#9b59b6', 
                                color: 'white', 
                                border: 'none', 
                                padding: '6px 12px', 
                                borderRadius: '4px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title="Compartir alerta"
                            >
                              Compartir
                            </button>
                          </>
                        )}
                        {user?.role === 'admin' && (
                          <>
                            <button 
                              onClick={() => handleConfirmAlert(alert.id)} 
                              style={{ 
                                background: '#27ae60', 
                                color: 'white', 
                                border: 'none', 
                                padding: '6px 12px', 
                                borderRadius: '4px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title="Confirmar esta alerta"
                            >
                              Confirmar
                            </button>
                            <button 
                              onClick={() => openReportModal(alert.id)}
                              style={{ 
                                background: '#e74c3c', 
                                color: 'white', 
                                border: 'none', 
                                padding: '6px 12px', 
                                borderRadius: '4px', 
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              title="Reportar esta alerta"
                            >
                              Reportar
                            </button>
                            <button 
                              onClick={() => handleEditAlert(alert)} 
                              className="alert-popup-edit-btn"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => handleDeleteAlert(alert.id)} 
                              className="alert-popup-delete-btn"
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
          
          {/* Círculos de zonas de interés del usuario */}
          {subscriptions.map(subscription => (
            <React.Fragment key={subscription.id}>
              <Circle
                center={[parseFloat(subscription.lat), parseFloat(subscription.lng)]}
                radius={subscription.radius || 1000}
                color="#9b59b6"
                fillColor="#9b59b6"
                fillOpacity={0.15}
                weight={2}
                dashArray="10, 5"
              />
              <Marker
                position={[parseFloat(subscription.lat), parseFloat(subscription.lng)]}
                icon={L.divIcon({
                  className: 'subscription-marker',
                  html: `<div style="
                    background: #9b59b6;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: white;
                  ">🏠</div>`,
                  iconSize: [24, 24],
                  iconAnchor: [12, 12],
                  popupAnchor: [0, -12]
                })}
              >
                <Popup>
                  <div style={{ textAlign: 'center', padding: '8px', minWidth: '150px' }}>
                    <div style={{ fontSize: '20px', marginBottom: '4px' }}>🏠</div>
                    <strong>{subscription.nombre_zona}</strong>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      Radio: {(subscription.radius || 1000) / 1000} km
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
          
          {/* Marcador de ubicación del usuario */}
          {userLocation && (
            <>
              {/* Círculo de área alrededor de la ubicación */}
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={50}
                color="#3498db"
                fillColor="#3498db"
                fillOpacity={0.15}
                weight={2}
                dashArray="5, 5"
              />
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={createUserLocationIcon()}
                zIndexOffset={1000}
              >
                <Popup>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📍</div>
                    <strong>Tu ubicación</strong>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      Lat: {userLocation.lat.toFixed(6)}<br />
                      Lng: {userLocation.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>

      {/* Panel de alertas (solo para admin) */}
      {user.role === 'admin' && (
        <>
          {/* Botón flotante para mostrar panel cuando está oculto */}
          {!showAdminPanel && (
            <button
              onClick={() => setShowAdminPanel(true)}
              style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                background: '#2c3e50',
                color: 'white',
                border: 'none',
                borderRadius: '50px',
                padding: '15px 25px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                zIndex: 1000,
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#34495e';
                e.target.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#2c3e50';
                e.target.style.transform = 'scale(1)';
              }}
            >
              <span>➕</span>
              <span>Mostrar Panel Admin</span>
            </button>
          )}
          
          {showAdminPanel && (
            <div className="alert-panel">
              {/* Botón para minimizar/ocultar panel */}
              <button
                onClick={() => setShowAdminPanel(false)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'rgba(0,0,0,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  color: '#7f8c8d',
                  zIndex: 10,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(231, 76, 60, 0.2)';
                  e.target.style.color = '#e74c3c';
                  e.target.style.transform = 'rotate(90deg)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(0,0,0,0.1)';
                  e.target.style.color = '#7f8c8d';
                  e.target.style.transform = 'rotate(0deg)';
                }}
                title="Minimizar panel"
              >
                ✕
              </button>
              
          {!editingAlert ? (
            <div className="alert-form">
              <div className="alert-form-title">
                <span style={{ fontSize: '24px' }}>➕</span>
                <h3>Nueva Alerta</h3>
              </div>
            {newAlert.lat && newAlert.lng && (
              <div className="alert-location-indicator">
                <span style={{ fontSize: '20px' }}>📍</span>
                <div className="alert-location-indicator-content">
                  <div className="alert-location-indicator-label">Ubicación seleccionada</div>
                  <div className="alert-location-indicator-coords">
                    Lat: {newAlert.lat} | Lng: {newAlert.lng}
                  </div>
                </div>
              </div>
            )}
            <form onSubmit={handleSubmitAlert}>
              <div className="form-group">
                <label className="form-label">Título</label>
                <input 
                  name="title" 
                  placeholder="Ej: Incendio forestal" 
                  value={newAlert.title} 
                  onChange={handleAlertChange} 
                  className="form-input"
                  required 
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea 
                  name="description" 
                  placeholder="Descripción detallada de la alerta..." 
                  value={newAlert.description} 
                  onChange={handleAlertChange} 
                  className="form-input form-textarea"
                  required 
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label">URL de imagen (opcional)</label>
                <input
                  name="image_url"
                  type="text"
                  placeholder="https://ejemplo.com/imagen.jpg"
                  value={newAlert.image_url || ''}
                  onChange={handleAlertChange}
                  className="form-input"
                  disabled={loading}
                />
                <input
                  id="new-alert-image-file"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={handleNewImageSelected}
                  className="form-input"
                  style={{ marginTop: '8px' }}
                  disabled={loading || uploadingNewImage}
                />
                {uploadingNewImage && (
                  <small style={{ color: '#7f8c8d' }}>Subiendo imagen...</small>
                )}
                {newAlert.image_url && (
                  <small style={{ color: '#27ae60', display: 'block', marginTop: '4px' }}>
                    Imagen asociada correctamente.
                  </small>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Categoría <span style={{ color: '#e74c3c' }}>*</span></label>
                <select 
                  name="categoria" 
                  value={newAlert.categoria || 'otro'} 
                  onChange={handleAlertChange}
                  className="form-input"
                  required
                  disabled={loading}
                >
                  {CATEGORIAS.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <small style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '4px', display: 'block' }}>
                  Selecciona la categoría para que el filtro funcione correctamente
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">Nivel de Peligro</label>
                <select 
                  name="level" 
                  value={newAlert.level} 
                  onChange={(e) => {
                    const level = e.target.value;
                    setNewAlert({
                      ...newAlert,
                      level,
                      radius:
                        newAlert.radius !== '' && newAlert.radius != null
                          ? newAlert.radius
                          : String(getDefaultRadius(level))
                    });
                  }}
                  className="form-input"
                  disabled={loading}
                >
                  <option value="verde">🟢 Verde - Bajo riesgo</option>
                  <option value="amarillo">🟡 Amarillo - Riesgo medio</option>
                  <option value="rojo">🔴 Rojo - Alto riesgo</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Radio del Área (metros)
                  <span style={{ fontSize: '11px', color: '#7f8c8d', fontWeight: 'normal', marginLeft: '5px' }}>
                    ({ALERT_RADIUS_MIN} - {ALERT_RADIUS_MAX} m)
                  </span>
                </label>
                <input 
                  name="radius" 
                  type="number" 
                  min={ALERT_RADIUS_MIN}
                  max={ALERT_RADIUS_MAX}
                  step="50"
                  placeholder={getDefaultRadius(newAlert.level)}
                  value={newAlert.radius === '' || newAlert.radius == null ? '' : String(newAlert.radius)}
                  onChange={handleAlertChange} 
                  className="form-input"
                  disabled={loading}
                />
                <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '4px' }}>
                  Por defecto: {getDefaultRadius(newAlert.level)}m ({newAlert.level === 'rojo' ? 'Alto' : newAlert.level === 'amarillo' ? 'Medio' : 'Bajo'} riesgo)
                </div>
              </div>
              <div className="form-coords-container">
                <div className="form-coord-input">
                  <label className="form-label">Latitud</label>
                  <input 
                    name="lat" 
                    type="number" 
                    step="any"
                    placeholder="40.4168" 
                    value={newAlert.lat} 
                    onChange={handleAlertChange} 
                    className="form-input"
                    required 
                    disabled={loading}
                  />
                </div>
                <div className="form-coord-input">
                  <label className="form-label">Longitud</label>
                  <input 
                    name="lng" 
                    type="number" 
                    step="any"
                    placeholder="-3.7038" 
                    value={newAlert.lng} 
                    onChange={handleAlertChange} 
                    className="form-input"
                    required 
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="form-instructions">
                <span style={{ fontSize: '18px' }}>💡</span>
                <div className="form-instructions-content">
                  <div className="form-instructions-title">Instrucciones</div>
                  <div className="form-instructions-text">
                    Haz clic en el mapa para seleccionar la ubicación. Solo se permiten alertas dentro de la Comunidad Valenciana.
                  </div>
                </div>
              </div>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Creando alerta...' : 'Crear Alerta'}
              </button>
            </form>
            </div>
          ) : (
            <div className="alert-form">
              <div className="alert-form-title">
                <span style={{ fontSize: '24px' }}>ED</span>
                <h3>Editar Alerta</h3>
              </div>
              {editingAlert.lat && editingAlert.lng && (
                <div className="alert-location-indicator">
                  <span style={{ fontSize: '20px' }}>📍</span>
                  <div className="alert-location-indicator-content">
                    <div className="alert-location-indicator-label">Ubicación seleccionada</div>
                    <div className="alert-location-indicator-coords">
                      Lat: {editingAlert.lat} | Lng: {editingAlert.lng}
                    </div>
                  </div>
                </div>
              )}
              <form onSubmit={handleSaveEdit}>
                <div className="form-group">
                  <label className="form-label">Título</label>
                  <input 
                    name="title" 
                    placeholder="Ej: Incendio forestal" 
                    value={editingAlert.title} 
                    onChange={(e) => setEditingAlert({ ...editingAlert, title: e.target.value })} 
                    className="form-input"
                    required 
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea 
                    name="description" 
                    placeholder="Descripción detallada de la alerta..." 
                    value={editingAlert.description} 
                    onChange={(e) => setEditingAlert({ ...editingAlert, description: e.target.value })} 
                    className="form-input form-textarea"
                    required 
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">URL de imagen (opcional)</label>
                  <input
                    name="image_url"
                    type="text"
                    placeholder="https://ejemplo.com/imagen.jpg"
                    value={editingAlert.image_url || ''}
                    onChange={(e) => setEditingAlert({ ...editingAlert, image_url: e.target.value })}
                    className="form-input"
                    disabled={loading}
                  />
                  <input
                    id="edit-alert-image-file"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={handleEditImageSelected}
                    className="form-input"
                    style={{ marginTop: '8px' }}
                    disabled={loading || uploadingEditImage}
                  />
                  {uploadingEditImage && (
                    <small style={{ color: '#7f8c8d' }}>Subiendo imagen...</small>
                  )}
                  {editingAlert.image_url && (
                    <small style={{ color: '#27ae60', display: 'block', marginTop: '4px' }}>
                      Imagen asociada correctamente.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría <span style={{ color: '#e74c3c' }}>*</span></label>
                  <select 
                    name="categoria" 
                    value={editingAlert.categoria || 'otro'} 
                    onChange={(e) => setEditingAlert({ ...editingAlert, categoria: e.target.value })}
                    className="form-input"
                    required
                    disabled={loading}
                  >
                    {CATEGORIAS.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nivel de Peligro</label>
                  <select 
                    name="level" 
                    value={editingAlert.level} 
                    onChange={(e) => {
                      const level = e.target.value;
                      setEditingAlert({
                        ...editingAlert,
                        level,
                        radius:
                          editingAlert.radius !== '' && editingAlert.radius != null
                            ? editingAlert.radius
                            : String(getDefaultRadius(level))
                      });
                    }}
                    className="form-input"
                    disabled={loading}
                  >
                    <option value="verde">Verde - Bajo riesgo</option>
                    <option value="amarillo">Amarillo - Riesgo medio</option>
                    <option value="rojo">Rojo - Alto riesgo</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Radio del Área (metros)
                    <span style={{ fontSize: '11px', color: '#7f8c8d', fontWeight: 'normal', marginLeft: '5px' }}>
                      ({ALERT_RADIUS_MIN} - {ALERT_RADIUS_MAX} m)
                    </span>
                  </label>
                  <input 
                    name="radius" 
                    type="number" 
                    min={ALERT_RADIUS_MIN}
                    max={ALERT_RADIUS_MAX}
                    step="50"
                    placeholder={getDefaultRadius(editingAlert.level)}
                    value={
                      editingAlert.radius === '' || editingAlert.radius == null || editingAlert.radius === undefined
                        ? ''
                        : String(editingAlert.radius)
                    }
                    onChange={(e) => setEditingAlert({ ...editingAlert, radius: e.target.value })} 
                    className="form-input"
                    disabled={loading}
                  />
                  <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '4px' }}>
                    Por defecto: {getDefaultRadius(editingAlert.level)}m ({editingAlert.level === 'rojo' ? 'Alto' : editingAlert.level === 'amarillo' ? 'Medio' : 'Bajo'} riesgo)
                  </div>
                </div>
                <div className="form-coords-container">
                  <div className="form-coord-input">
                    <label className="form-label">Latitud</label>
                    <input 
                      name="lat" 
                      type="number" 
                      step="any"
                      placeholder="40.4168" 
                      value={editingAlert.lat} 
                      onChange={(e) => setEditingAlert({ ...editingAlert, lat: e.target.value })} 
                      className="form-input"
                      required 
                      disabled={loading}
                    />
                  </div>
                  <div className="form-coord-input">
                    <label className="form-label">Longitud</label>
                    <input 
                      name="lng" 
                      type="number" 
                      step="any"
                      placeholder="-3.7038" 
                      value={editingAlert.lng} 
                      onChange={(e) => setEditingAlert({ ...editingAlert, lng: e.target.value })} 
                      className="form-input"
                      required 
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="form-instructions">
                  <span style={{ fontSize: '18px' }}>💡</span>
                  <div className="form-instructions-content">
                    <div className="form-instructions-title">Instrucciones</div>
                    <div className="form-instructions-text">
                      Haz clic en el mapa para cambiar la ubicación. Solo se permiten alertas dentro de la Comunidad Valenciana.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                  <button 
                    type="button"
                    onClick={handleCancelEdit}
                    className="btn-secondary"
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Estadísticas */}
          <div className="stats-container">
            <h4 className="stats-title">📊 Resumen</h4>
            <div className="stats-card">
              <div className="stats-card-number">{alerts.length}</div>
              <div className="stats-card-label">Total alertas</div>
            </div>
            <div className="stats-grid">
              <div className="stats-card-mini stats-card-mini-red">
                <span style={{ fontSize: '20px' }}>🔴</span>
                <strong className="alert-level-red" style={{ fontSize: '18px' }}>
                  {alerts.filter(a => a.level === 'rojo').length}
                </strong>
                <span style={{ fontSize: '11px', color: '#7f8c8d' }}>Alto riesgo</span>
              </div>
              <div className="stats-card-mini stats-card-mini-yellow">
                <span style={{ fontSize: '20px' }}>🟡</span>
                <strong className="alert-level-yellow" style={{ fontSize: '18px' }}>
                  {alerts.filter(a => a.level === 'amarillo').length}
                </strong>
                <span style={{ fontSize: '11px', color: '#7f8c8d' }}>Riesgo medio</span>
              </div>
              <div className="stats-card-mini stats-card-mini-green">
                <span style={{ fontSize: '20px' }}>🟢</span>
                <strong className="alert-level-green" style={{ fontSize: '18px' }}>
                  {alerts.filter(a => a.level === 'verde').length}
                </strong>
                <span style={{ fontSize: '11px', color: '#7f8c8d' }}>Bajo riesgo</span>
              </div>
            </div>
          </div>
            </div>
          )}
        </>
      )}


      {/* Modal de Estadísticas */}
      {showStats && stats && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>📊 Estadísticas</h2>
              <button 
                onClick={() => setShowStats(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#7f8c8d'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#ecf0f1', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2c3e50' }}>{stats.total_activas}</div>
                <div style={{ color: '#7f8c8d', fontSize: '14px' }}>Alertas Activas</div>
              </div>
              <div style={{ background: '#ecf0f1', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#27ae60' }}>{stats.total_confirmaciones}</div>
                <div style={{ color: '#7f8c8d', fontSize: '14px' }}>Confirmaciones</div>
              </div>
              <div style={{ background: '#ecf0f1', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#e74c3c' }}>{stats.reportes_pendientes}</div>
                <div style={{ color: '#7f8c8d', fontSize: '14px' }}>Reportes Pendientes</div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3>Por Nivel</h3>
              {stats.por_nivel.map(item => (
                <div key={item.nivel} style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>{getLevelIcon(item.nivel)} {item.nivel}</span>
                    <strong>{item.total}</strong>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    background: '#ecf0f1', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(item.total / stats.total_activas) * 100}%`,
                      background: getColor(item.nivel),
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3>Por Categoría</h3>
              {stats.por_categoria.map(item => (
                <div key={item.categoria} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '8px',
                  background: '#f8f9fa',
                  marginBottom: '4px',
                  borderRadius: '4px'
                }}>
                  <span>{getCategoryIcon(item.categoria)} {item.categoria}</span>
                  <strong>{item.total}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Banner de Alertas Cercanas */}
      {proximityAlerts.length > 0 && userLocation && !proximityAlertDismissed && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          right: '20px',
          maxWidth: '400px',
          background: '#e74c3c',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
          zIndex: 1000,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>⚠️ {proximityAlerts.length} alerta(s): estás dentro de su zona</strong>
            <button
              onClick={() => {
                setProximityAlertDismissed(true);
                localStorage.setItem('proximityAlertDismissed', 'true');
              }}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '14px' }}>
            {proximityAlerts.slice(0, 3).map(alert => (
              <div key={alert.id} style={{ marginBottom: '4px' }}>
                • {alert.title} (a {Math.round(calculateDistance(userLocation.lat, userLocation.lng, parseFloat(alert.lat), parseFloat(alert.lng)))} m del centro; radio {getAlertRadius(alert)} m)
              </div>
            ))}
          </div>
          <button
            onClick={enableProximityAlerts}
            style={{
              marginTop: '8px',
              background: 'white',
              color: '#e74c3c',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            Ubicación + avisos al entrar en zona
          </button>
        </div>
      )}

      {/* Banner de Alertas Cercanas a Zonas */}
      {subscriptionProximityAlerts.length > 0 && !subscriptionAlertDismissed && (
        <div style={{
          position: 'fixed',
          bottom: proximityAlerts.length > 0 && userLocation && !proximityAlertDismissed ? '190px' : '20px',
          left: '20px',
          right: '20px',
          maxWidth: '460px',
          background: '#2c3e50',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
          zIndex: 1000,
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>🏠 {subscriptionProximityAlerts.length} alerta(s) cerca de tus zonas</strong>
            <button
              onClick={() => {
                setSubscriptionAlertDismissed(true);
                localStorage.setItem('subscriptionAlertDismissed', 'true');
              }}
              style={{ background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '14px' }}>
            {subscriptionProximityAlerts.slice(0, 3).map(item => (
              <div key={item.key} style={{ marginBottom: '4px' }}>
                • {item.subscriptionName}: {item.alert.title} ({item.distance}m)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel de Suscripciones */}
      {showSubscriptions && user && (
        <div style={{
          position: 'fixed',
          top: '50%',
          right: '20px',
          transform: 'translateY(-50%)',
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '350px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>📍 Zonas de Interés</h3>
            <button
              onClick={() => setShowSubscriptions(false)}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h4>Nueva Zona de Interés</h4>
            <input
              id="subscription-name"
              name="subscription-name"
              type="text"
              placeholder="Ej: Mi casa, Mi trabajo, Valencia centro..."
              value={newSubscription.nombre_zona}
              onChange={(e) => setNewSubscription({ ...newSubscription, nombre_zona: e.target.value })}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <input
                id="subscription-lat"
                name="subscription-lat"
                type="number"
                step="any"
                placeholder="Latitud"
                value={newSubscription.lat}
                onChange={(e) => setNewSubscription({ ...newSubscription, lat: e.target.value })}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
              <input
                id="subscription-lng"
                name="subscription-lng"
                type="number"
                step="any"
                placeholder="Longitud"
                value={newSubscription.lng}
                onChange={(e) => setNewSubscription({ ...newSubscription, lng: e.target.value })}
                style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              />
            </div>
            <input
              id="subscription-radius"
              name="subscription-radius"
              type="number"
              placeholder="Radio (metros)"
              value={newSubscription.radius}
              onChange={(e) => setNewSubscription({ ...newSubscription, radius: parseInt(e.target.value) || 1000 })}
              style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <button
              type="button"
              onClick={useCurrentLocationForSubscription}
              style={{
                width: '100%',
                background: '#ecf0f1',
                color: '#2c3e50',
                border: '1px solid #d5d8dc',
                padding: '8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                marginBottom: '8px'
              }}
            >
              📍 Usar mi ubicación actual
            </button>
            <button
              onClick={handleCreateSubscription}
              style={{
                width: '100%',
                background: '#3498db',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Guardar Zona
            </button>
          </div>

          <div>
            <h4>Mis Zonas ({subscriptions.length})</h4>
            {subscriptions.length === 0 ? (
              <p style={{ color: '#7f8c8d', fontStyle: 'italic' }}>No tienes zonas de interés guardadas</p>
            ) : (
              subscriptions.map(sub => (
                <div key={sub.id} style={{
                  background: '#f8f9fa',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{sub.nombre_zona}</strong>
                      <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                        Radio: {sub.radius}m
                      </div>
                      {user?.role === 'admin' && sub.owner_name && (
                        <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                          Usuario: {sub.owner_name}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`http://localhost:4000/api/subscriptions/${sub.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${user.token}` }
                          });
                          if (res.ok) {
                            loadSubscriptions();
                            showAppModal('Zona eliminada', 'La zona de interés se ha eliminado correctamente.', 'success');
                          }
                        } catch (err) {
                          console.error('Error:', err);
                        }
                      }}
                      style={{
                        background: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal para reportar alertas */}
      {reportModal.visible && user?.role === 'admin' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={closeReportModal}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 10px 35px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0 }}>🚩 Reportar alerta</h3>
              <button
                onClick={closeReportModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#555'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#2c3e50', fontWeight: '600' }}>
                Tipo de reporte
                <select
                  value={reportModal.tipo}
                  onChange={(e) => setReportModal(prev => ({ ...prev, tipo: e.target.value }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #dcdcdc',
                    fontSize: '14px'
                  }}
                >
                  <option value="falsa">Falsa</option>
                  <option value="desactualizada">Desactualizada</option>
                  <option value="duplicada">Duplicada</option>
                  <option value="inapropiada">Inapropiada</option>
                  <option value="otro">Otro</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#2c3e50', fontWeight: '600' }}>
                Motivo (opcional)
                <textarea
                  value={reportModal.motivo}
                  onChange={(e) => setReportModal(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Describe brevemente el motivo del reporte..."
                  rows={4}
                  style={{
                    resize: 'vertical',
                    minHeight: '90px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #dcdcdc',
                    fontSize: '14px',
                    fontFamily: 'inherit'
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                onClick={closeReportModal}
                style={{
                  flex: 1,
                  border: '1px solid #bdc3c7',
                  background: '#ecf0f1',
                  color: '#2c3e50',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitReportModal}
                style={{
                  flex: 1,
                  border: 'none',
                  background: '#e74c3c',
                  color: '#fff',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Enviar reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminación de alerta (sin window.confirm / localhost) */}
      {deleteConfirmModal.visible && user?.role === 'admin' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 12100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={closeDeleteConfirmModal}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 10px 35px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>Eliminar alerta</h3>
              <button
                type="button"
                onClick={closeDeleteConfirmModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#555'
                }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 8px 0', color: '#333', lineHeight: 1.5 }}>
              ¿Seguro que quieres eliminar esta alerta?
              {deleteConfirmModal.alertId != null && (
                <>
                  {' '}
                  <strong>
                    {alerts.find((a) => a.id === deleteConfirmModal.alertId)?.title ||
                      `ID ${deleteConfirmModal.alertId}`}
                  </strong>
                </>
              )}
            </p>
            <p style={{ margin: '0 0 18px 0', color: '#7f8c8d', fontSize: '13px', lineHeight: 1.4 }}>
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={closeDeleteConfirmModal}
                style={{
                  flex: 1,
                  border: '1px solid #bdc3c7',
                  background: '#ecf0f1',
                  color: '#2c3e50',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteAlert}
                style={{
                  flex: 1,
                  border: 'none',
                  background: '#c0392b',
                  color: '#fff',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal interno de notificaciones */}
      {appModal.visible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setAppModal(prev => ({ ...prev, visible: false }))}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#fff',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 10px 35px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>
                {appModal.type === 'success'
                  ? '✅'
                  : appModal.type === 'warning'
                  ? '⚠️'
                  : appModal.type === 'error'
                  ? '❌'
                  : 'ℹ️'}{' '}
                {appModal.title}
              </h3>
              <button
                onClick={() => setAppModal(prev => ({ ...prev, visible: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#555'
                }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 16px 0', color: '#333', lineHeight: 1.4 }}>
              {appModal.message}
            </p>
            <button
              onClick={() => setAppModal(prev => ({ ...prev, visible: false }))}
              style={{
                width: '100%',
                background: '#3498db',
                color: '#fff',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Los estilos ahora están en MapPage.css

export default MapPage;