/**
 * Listado tipo “noticias” construido sobre las mismas alertas activas del API.
 * - `GET /api/alerts?estado=activa&categoria=...`
 * - Geocodificación inversa opcional (Nominatim) para mostrar población aproximada.
 * - Navegación al mapa con `?alerta=id` al pulsar una tarjeta.
 */
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './NewsPage.css';
import { CATEGORIAS_OPTIONS, getLevelEmoji, getLevelLabelText } from '../alertVisuals';
import { CategoryBrief } from './AlertChips';
import { apiUrl, LOGO_URL } from '../config';

const NewsPage = ({ user, onLogout }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategoria, setFilterCategoria] = useState('todos');
  const [locationNames, setLocationNames] = useState({});
  const navigate = useNavigate();

  const categorias = [
    { value: 'todos', label: 'Todas las categorías', icon: '📰' },
    ...CATEGORIAS_OPTIONS.map((c) => ({ value: c.value, label: c.label, icon: c.emoji }))
  ];

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

    const backendBaseUrl = apiUrl('');
    const normalizedPath = String(imagePath).trim().replace(/\\/g, '/');

    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }

    if (normalizedPath.startsWith('//')) {
      return `http:${normalizedPath}`;
    }

    if (normalizedPath.startsWith('data:image/')) {
      return normalizedPath;
    }

    if (normalizedPath.startsWith('/uploads/')) {
      return `${backendBaseUrl}${normalizedPath}`;
    }

    if (normalizedPath.startsWith('uploads/')) {
      return `${backendBaseUrl}/${normalizedPath}`;
    }

    return `${backendBaseUrl}/uploads/alerts/${normalizedPath}`;
  };

  const NEWS_IMAGE_FALLBACK =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="%23ecf0f1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%237f8c8d" font-family="Arial" font-size="24">Imagen no disponible</text></svg>';

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const geocodingCacheRef = useRef({});

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    const currentFilterCategoria = filterCategoria;
    
    const fetchNews = async () => {
      if (currentRequestId === requestIdRef.current) {
        setLoading(true);
      }

      try {
        let url = apiUrl('/api/alerts?estado=activa');
        if (currentFilterCategoria !== 'todos') {
          url += `&categoria=${encodeURIComponent(currentFilterCategoria)}`;
        }

        const response = await fetch(url, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error('Error al cargar noticias');
        }

        const data = await response.json();

        if (currentRequestId === requestIdRef.current) {
          setNews(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error al cargar noticias:', err);
        if (currentRequestId === requestIdRef.current) {
          setNews([]);
          setLoading(false);
        }
      }
    };

    fetchNews();

    return () => {
      abortController.abort();
    };
  }, [filterCategoria]);

  useEffect(() => {
    const geocodeAbortController = new AbortController();

    const resolveNewsLocations = async () => {
      const updates = {};

      for (const item of news) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (geocodingCacheRef.current[cacheKey]) {
          updates[item.id] = geocodingCacheRef.current[cacheKey];
          continue;
        }

        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&accept-language=es`;
          const response = await fetch(url, {
            signal: geocodeAbortController.signal,
            headers: { 'User-Agent': 'AlertasCVN/1.0' }
          });

          if (!response.ok) continue;

          const data = await response.json();
          const name =
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            data?.address?.municipality ||
            data?.address?.county ||
            data?.display_name?.split(',')[0] ||
            'Ubicación desconocida';

          geocodingCacheRef.current[cacheKey] = name;
          updates[item.id] = name;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }

      if (Object.keys(updates).length > 0) {
        setLocationNames((prev) => ({ ...prev, ...updates }));
      }
    };

    resolveNewsLocations();

    return () => {
      geocodeAbortController.abort();
    };
  }, [news]);

  const handleNewsClick = (alertId) => {
    navigate(`/mapa?alerta=${alertId}`);
  };

  return (
    <div className="news-page">
      <header className="news-header">
        <div className="news-header-content">
          <div className="news-logo-container">
            <img 
              src={LOGO_URL} 
              alt="CVN Noticias" 
              className="news-logo"
            />
          </div>
          <div className="news-header-info">
            <div className="news-header-stats">
              <span className="news-stat-item">
                <span className="news-stat-icon">📰</span>
                <span className="news-stat-value">{news.length}</span>
                <span className="news-stat-label">Noticias</span>
              </span>
              <span className="news-stat-divider">|</span>
              <span className="news-stat-item">
                <span className="news-stat-icon">👤</span>
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
              🚪 Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

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

      <div className="news-container">
        {loading ? (
          <div className="loading">⏳ Cargando noticias...</div>
        ) : news.length === 0 ? (
          <div className="no-news">
            <p>📭 No hay noticias con los filtros seleccionados.</p>
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
                        if (e.currentTarget.src !== NEWS_IMAGE_FALLBACK) {
                          e.currentTarget.src = NEWS_IMAGE_FALLBACK;
                        }
                      }}
                    />
                  </div>
                )}
                <div className="news-card-header">
                  <div className="news-category">
                    <CategoryBrief categoria={item.categoria || item.category || 'otro'} />
                  </div>
                  <div 
                    className={`news-level news-level-${item.level || item.nivel || 'verde'}`}
                  >
                    {getLevelEmoji(item.level || item.nivel || 'verde')} {getLevelLabelText(item.level || item.nivel || 'verde')}
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
                    📅 {formatDate(item.created_at || item.fecha_creacion || new Date())}
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
