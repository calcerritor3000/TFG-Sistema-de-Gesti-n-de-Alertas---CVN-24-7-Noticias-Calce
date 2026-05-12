/**
 * Listado tipo “noticias” construido sobre las mismas alertas activas del API.
 * - `GET /api/alerts?estado=activa&categoria=...`
 * - Geocodificación inversa opcional (Nominatim) para mostrar población aproximada.
 * - Navegación al mapa con `?alerta=id` al pulsar una tarjeta.
 */
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './NewsPage.css';

const NewsPage = ({ user, onLogout }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategoria, setFilterCategoria] = useState('todos');
  const [locationNames, setLocationNames] = useState({});
  const navigate = useNavigate();

  // Categorías disponibles
  const categorias = [
    { value: 'todos', label: 'Todas las categorías', icon: '📰' },
    { value: 'incendio', label: 'Incendio', icon: '🔥' },
    { value: 'inundacion', label: 'Inundación', icon: '💧' },
    { value: 'dana', label: 'DANA', icon: '🌀' },
    { value: 'trafico', label: 'Tráfico', icon: '🚗' },
    { value: 'obras', label: 'Obras', icon: '🚧' },
    { value: 'meteorologia', label: 'Meteorología', icon: '🌦️' },
    { value: 'seguridad', label: 'Seguridad', icon: '🛡️' },
    { value: 'salud', label: 'Salud', icon: '🏥' },
    { value: 'medio_ambiente', label: 'Medio Ambiente', icon: '🌳' },
    { value: 'infraestructura', label: 'Infraestructura', icon: '🏗️' },
    { value: 'otro', label: 'Otro', icon: '📍' }
  ];


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

  const getCategoryLabel = (categoria) => {
    const cat = categorias.find(c => c.value === categoria);
    return cat ? cat.label : 'Otro';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resolveImageUrl = (imagePath) => {
    if (!imagePath) return null;

    const backendBaseUrl = 'http://localhost:4000';
    const normalizedPath = String(imagePath).trim().replace(/\\/g, '/');

    // URL absoluta (http/https)
    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }

    // URL de protocolo relativo (//host/ruta)
    if (normalizedPath.startsWith('//')) {
      return `http:${normalizedPath}`;
    }

    // data URI (base64)
    if (normalizedPath.startsWith('data:image/')) {
      return normalizedPath;
    }

    // Ruta tipo /uploads/alerts/archivo.jpg
    if (normalizedPath.startsWith('/uploads/')) {
      return `${backendBaseUrl}${normalizedPath}`;
    }

    // Ruta tipo uploads/alerts/archivo.jpg
    if (normalizedPath.startsWith('uploads/')) {
      return `${backendBaseUrl}/${normalizedPath}`;
    }

    // Nombre de archivo suelto: archivo.jpg
    return `${backendBaseUrl}/uploads/alerts/${normalizedPath}`;
  };

  const NEWS_IMAGE_FALLBACK =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="%23ecf0f1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%237f8c8d" font-family="Arial" font-size="24">Imagen no disponible</text></svg>';

  // Usar un ref para rastrear el ID de la petición actual y evitar condiciones de carrera
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const geocodingCacheRef = useRef({});

  // Cargar noticias (alertas) desde el servidor cuando cambian los filtros
  useEffect(() => {
    // Cancelar petición anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Crear nuevo AbortController para esta petición
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Incrementar el ID de la petición
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    const currentFilterCategoria = filterCategoria;
    
    const fetchNews = async () => {
      // Solo establecer loading si esta es la petición más reciente
      if (currentRequestId === requestIdRef.current) {
        setLoading(true);
      }
      
      try {
        // Construir parámetros de consulta
        const params = new URLSearchParams();
        params.set('estado', 'activa');
        
        // Agregar filtro de categoría solo si no es 'todos'
        if (currentFilterCategoria && currentFilterCategoria !== 'todos') {
          const categoriaValue = currentFilterCategoria.toLowerCase().trim();
          params.set('categoria', categoriaValue);
        }

        const url = `http://localhost:4000/api/alerts?${params.toString()}`;
        const response = await fetch(url, {
          signal: abortController.signal
        });
        
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          throw new Error('Respuesta inválida del servidor');
        }
        
        // Asegurar que data es un array
        if (!Array.isArray(data)) {
          data = [];
        }

        // Verificar que esta sigue siendo la petición más reciente y el filtro no ha cambiado
        if (currentRequestId !== requestIdRef.current || currentFilterCategoria !== filterCategoria || abortController.signal.aborted) {
          return; // Ignorar respuesta obsoleta
        }

        // Ordenar por fecha más reciente primero
        const sortedNews = [...data].sort((a, b) => {
          return new Date(b.created_at || b.fecha_creacion) - new Date(a.created_at || a.fecha_creacion);
        });

        setNews(sortedNews);
        setLoading(false);
      } catch (error) {
        // Ignorar errores de abort
        if (error.name === 'AbortError') {
          return;
        }

        // Solo manejar el error si esta es la petición más reciente Y el filtro no ha cambiado
        if (currentRequestId === requestIdRef.current && currentFilterCategoria === filterCategoria && !abortController.signal.aborted) {
          console.error('Error al cargar noticias:', error);
          setNews([]);
          setLoading(false);
        }
      }
    };

    fetchNews();

    // Cleanup: cancelar petición si el componente se desmonta o cambia el filtro
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [filterCategoria]);

  // Resolver nombre de ciudad/pueblo a partir de coordenadas
  useEffect(() => {
    const geocodeAbortController = new AbortController();

    const resolveLocationLabel = async (lat, lng) => {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        return null;
      }

      const cacheKey = `${latNum.toFixed(5)},${lngNum.toFixed(5)}`;
      if (geocodingCacheRef.current[cacheKey]) {
        return geocodingCacheRef.current[cacheKey];
      }

      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          lat: String(latNum),
          lon: String(lngNum),
          zoom: '12',
          addressdetails: '1'
        });

        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          signal: geocodeAbortController.signal,
          headers: {
            Accept: 'application/json'
          }
        });

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        const address = data?.address || {};
        const resolvedName =
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.county ||
          null;

        geocodingCacheRef.current[cacheKey] = resolvedName;
        return resolvedName;
      } catch (error) {
        if (error.name === 'AbortError') {
          return null;
        }
        return null;
      }
    };

    const resolveNewsLocations = async () => {
      if (!news.length) {
        setLocationNames({});
        return;
      }

      const resolvedEntries = await Promise.all(
        news.map(async (item) => {
          const locationText = item.location || item.ubicacion;
          if (locationText) {
            return [item.id, locationText];
          }

          const locationName = await resolveLocationLabel(item.lat, item.lng);
          return [item.id, locationName];
        })
      );

      if (!geocodeAbortController.signal.aborted) {
        const nextLocationNames = Object.fromEntries(
          resolvedEntries.filter(([, value]) => Boolean(value))
        );
        setLocationNames(nextLocationNames);
      }
    };

    resolveNewsLocations();

    return () => {
      geocodeAbortController.abort();
    };
  }, [news]);

  const handleNewsClick = (alertId) => {
    // Navegar al mapa y centrarse en la alerta específica
    navigate(`/mapa?alerta=${alertId}`);
  };

  return (
    <div className="news-page">
      {/* Header */}
      <header className="news-header">
        <div className="news-header-content">
          <div className="news-logo-container">
            <img 
              src="/CVN_Noticias.png" 
              alt="CVN Noticias" 
              className="news-logo"
            />
          </div>
          <div className="news-header-info">
            <div className="news-header-stats">
              <span className="news-stat-item">
                <span className="news-stat-icon">N</span>
                <span className="news-stat-value">{news.length}</span>
                <span className="news-stat-label">Noticias</span>
              </span>
              <span className="news-stat-divider">|</span>
              <span className="news-stat-item">
                <span className="news-stat-icon">US</span>
                <span className="news-stat-label">{user?.username}</span>
              </span>
            </div>
          </div>
          <div className="news-header-actions">
            <button 
              onClick={() => navigate('/mapa')} 
              className="btn-secondary"
            >
              🗺️ Ver Mapa
            </button>
            <button 
              onClick={() => navigate('/tiempo')} 
              className="btn-secondary"
            >
              🌤️ Tiempo
            </button>
            <button onClick={onLogout} className="btn-logout">
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="news-filters">
        <div className="filter-group">
          <label htmlFor="filter-categoria">📂 Categoría:</label>
          <select 
            id="filter-categoria"
            name="filter-categoria"
            value={filterCategoria} 
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="filter-select"
          >
            {categorias.map(cat => (
              <option key={cat.value} value={cat.value}>
                {cat.icon} {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista de Noticias */}
      <div className="news-container">
        {loading ? (
          <div className="loading">Cargando noticias...</div>
        ) : news.length === 0 ? (
          <div className="no-news">
            <p>📭 No hay noticias disponibles con los filtros seleccionados</p>
            <p style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '10px' }}>
              {filterCategoria !== 'todos' ? `Filtro activo: Categoría: ${filterCategoria}` : ''}
            </p>
          </div>
        ) : (
          <div className="news-list">
            {news.map((item) => (
              <div 
                key={item.id} 
                className="news-card"
                onClick={() => handleNewsClick(item.id)}
              >
                {(item.image_url || item.imageUrl) && (
                  <div className="news-image-wrap">
                    <img
                      src={resolveImageUrl(item.image_url || item.imageUrl)}
                      alt={item.title || item.titulo || 'Imagen de la noticia'}
                      className="news-image"
                      loading="lazy"
                      onError={(e) => {
                        // Evita que "desaparezca": usa imagen de fallback
                        if (e.currentTarget.src !== NEWS_IMAGE_FALLBACK) {
                          e.currentTarget.src = NEWS_IMAGE_FALLBACK;
                        }
                      }}
                    />
                  </div>
                )}
                <div className="news-card-header">
                  <div className="news-category">
                    <span className="category-icon">
                      {getCategoryIcon(item.categoria || item.category || 'otro')}
                    </span>
                    <span className="category-label">
                      {getCategoryLabel(item.categoria || item.category || 'otro')}
                    </span>
                  </div>
                  <div 
                    className={`news-level news-level-${item.level || item.nivel || 'verde'}`}
                  >
                    {item.level === 'rojo' || item.nivel === 'rojo' ? '🔴 Alto' :
                     item.level === 'amarillo' || item.nivel === 'amarillo' ? '🟡 Medio' :
                     '🟢 Bajo'}
                  </div>
                </div>

                <h3 className="news-title">{item.title || item.titulo || 'Sin título'}</h3>
                
                <p className="news-description">
                  {item.description || item.descripcion || 'Sin descripción'}
                </p>

                <div className="news-footer">
                  <div className="news-location">
                    📍 {locationNames[item.id] || 'Ciudad o pueblo no disponible'}
                  </div>
                  <div className="news-date">
                    {formatDate(item.created_at || item.fecha_creacion || new Date())}
                  </div>
                </div>

                {item.confirmations_count > 0 && (
                  <div className="news-confirmations">
                    ✅ {item.confirmations_count} confirmación{item.confirmations_count !== 1 ? 'es' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPage;
