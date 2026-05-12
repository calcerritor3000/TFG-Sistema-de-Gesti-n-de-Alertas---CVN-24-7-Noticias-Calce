/**
 * Previsión meteorológica semanal (vista “widget”).
 * - Consume `GET /api/weather/weekdays` (semana actual, filtros por zona).
 * - Selector de zona: automático (geolocalización) o municipios desde
 *   `GET /api/weather/municipalities` (coordenadas fijas en backend).
 * - Admin: modal CRUD sobre `POST/PUT/DELETE /api/weather` cuando aplica.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './WeatherPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const DEFAULT_MUNICIPALITY_OPTIONS = [
  { value: 'auto', label: 'Automático (mi ubicación)' }
];

const WeatherPage = ({ user, onLogout }) => {
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMunicipality, setSelectedMunicipality] = useState('auto');
  const [locationLabel, setLocationLabel] = useState('Comunidad Valenciana');
  const [municipalityOptions, setMunicipalityOptions] = useState(DEFAULT_MUNICIPALITY_OPTIONS);
  const [editingForecast, setEditingForecast] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const navigate = useNavigate();
  const weekScrollRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const scrollStartRef = useRef(0);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchForecast();
  }, [selectedMunicipality]);

  useEffect(() => {
    const loadMunicipalities = async () => {
      try {
        const response = await fetch(`${API_URL}/api/weather/municipalities`);
        if (!response.ok) return;
        const data = await response.json();
        const fetched = Array.isArray(data?.municipalities) ? data.municipalities : [];
        if (fetched.length === 0) return;
        setMunicipalityOptions([
          ...DEFAULT_MUNICIPALITY_OPTIONS,
          ...fetched.map((item) => ({
            value: item.value,
            label: item.label
          }))
        ]);
      } catch (_error) {
        // Si falla el endpoint, mantener opción automática
      }
    };

    loadMunicipalities();
  }, []);

  const fetchForecast = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ week: 'current' });

      if (selectedMunicipality !== 'auto') {
        params.set('municipality', selectedMunicipality);
        const customLabel = municipalityOptions.find((item) => item.value === selectedMunicipality)?.label;
        if (customLabel) setLocationLabel(customLabel);
      } else if (navigator.geolocation) {
        const coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 180000 }
          );
        });

        if (coords) {
          params.set('lat', String(coords.lat));
          params.set('lng', String(coords.lng));
          setLocationLabel('Tu ubicación actual');
        } else {
          setLocationLabel('Comunidad Valenciana');
        }
      } else {
        setLocationLabel('Comunidad Valenciana');
      }

      const response = await fetch(`${API_URL}/api/weather/weekdays?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setForecast(data);
      } else {
        setForecast([]);
      }
    } catch (error) {
      console.error('Error al cargar previsiones:', error);
      setForecast([]);
    } finally {
      setLoading(false);
    }
  };

  const getDayOfWeek = (dateString) => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    // Convertir a formato donde 0 = Lunes, 6 = Domingo
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  };

  const getDayName = (dayIndex) => {
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    return days[dayIndex];
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const getWeatherIcon = (icono) => {
    const icons = {
      soleado: '☀️',
      nublado: '☁️',
      lluvia: '🌧️',
      tormenta: '⛈️',
      nieve: '❄️',
      niebla: '🌫️',
      parcialmente_nublado: '⛅',
      lluvia_ligera: '🌦️'
    };
    return icons[icono] || '☀️';
  };

  const getWindDirection = (direccion) => {
    const directions = {
      'N': 'N',
      'NE': 'NE',
      'E': 'E',
      'SE': 'SE',
      'S': 'S',
      'SO': 'SO',
      'O': 'O',
      'NO': 'NO'
    };
    return directions[direccion] || 'E';
  };

  const groupForecastByDayOfWeek = () => {
    // Crear estructura para los 7 días de la semana (Lunes a Domingo)
    const grouped = {
      0: [], // Lunes
      1: [], // Martes
      2: [], // Miércoles
      3: [], // Jueves
      4: [], // Viernes
      5: [], // Sábado
      6: []  // Domingo
    };
    
    forecast.forEach(item => {
      const dayOfWeek = getDayOfWeek(item.fecha);
      if (grouped[dayOfWeek] !== undefined) {
        grouped[dayOfWeek].push(item);
      }
    });
    
    return grouped;
  };

  const getMinMaxTemp = (dayItems) => {
    if (!dayItems || dayItems.length === 0) return { min: null, max: null };
    const temps = dayItems
      .map(item => [item.temp_minima, item.temp_maxima, item.temperatura])
      .flat()
      .filter(t => t !== null && t !== undefined);
    if (temps.length === 0) return { min: null, max: null };
    return {
      min: Math.min(...temps),
      max: Math.max(...temps)
    };
  };

  const getMainIcon = (dayItems) => {
    if (!dayItems || dayItems.length === 0) return '☀️';
    // Obtener el icono más común o el primero
    return getWeatherIcon(dayItems[0].icono_tiempo);
  };

  const getPrecipitationProbability = (dayItems) => {
    if (!dayItems || dayItems.length === 0) return 0;
    const probabilities = dayItems
      .map(item => item.probabilidad_precipitacion)
      .filter(p => p !== null && p !== undefined);
    if (probabilities.length === 0) return 0;
    return Math.max(...probabilities);
  };

  const getMaxWind = (dayItems) => {
    if (!dayItems || dayItems.length === 0) return { speed: 0, direction: 'N' };
    const validWind = dayItems
      .map(item => ({
        speed: item.velocidad_viento || 0,
        direction: item.direccion_viento || 'N'
      }))
      .sort((a, b) => b.speed - a.speed);
    return validWind[0] || { speed: 0, direction: 'N' };
  };

  const handleEdit = (forecastItem) => {
    setEditingForecast({ ...forecastItem });
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingForecast) return;

    try {
      const token = user?.token;
      const url = editingForecast.id 
        ? `${API_URL}/api/weather/${editingForecast.id}`
        : `${API_URL}/api/weather`;
      
      const method = editingForecast.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editingForecast)
      });

      if (response.ok) {
        setIsEditModalOpen(false);
        setEditingForecast(null);
        fetchForecast();
      } else {
        const error = await response.json();
        alert('Error al guardar: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Error al guardar la previsión');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta previsión?')) {
      return;
    }

    try {
      const token = user?.token;
      const response = await fetch(`${API_URL}/api/weather/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        fetchForecast();
      } else {
        alert('Error al eliminar la previsión');
      }
    } catch (error) {
      console.error('Error al eliminar:', error);
      alert('Error al eliminar la previsión');
    }
  };

  const handleWeekMouseDown = (e) => {
    if (!weekScrollRef.current) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.pageX - weekScrollRef.current.offsetLeft;
    scrollStartRef.current = weekScrollRef.current.scrollLeft;
    weekScrollRef.current.classList.add('dragging');
  };

  const handleWeekMouseMove = (e) => {
    if (!isDraggingRef.current || !weekScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - weekScrollRef.current.offsetLeft;
    const walk = (x - dragStartXRef.current) * 1.2;
    weekScrollRef.current.scrollLeft = scrollStartRef.current - walk;
  };

  const stopWeekDragging = () => {
    if (!weekScrollRef.current) return;
    isDraggingRef.current = false;
    weekScrollRef.current.classList.remove('dragging');
  };

  const handleWeekWheel = (e) => {
    if (!weekScrollRef.current) return;
    // Convierte la rueda vertical en scroll horizontal dentro del carrusel semanal
    const hasHorizontalOverflow = weekScrollRef.current.scrollWidth > weekScrollRef.current.clientWidth;
    if (!hasHorizontalOverflow) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      weekScrollRef.current.scrollLeft += e.deltaY;
    } else {
      weekScrollRef.current.scrollLeft += e.deltaX;
    }
  };

  if (loading) {
    return (
      <div className="weather-page">
        <div className="weather-loading">Cargando previsión meteorológica...</div>
      </div>
    );
  }

  return (
    <div className="weather-page">
      <header className="weather-header">
        <div className="weather-header-content">
          <div>
            <p className="weather-header-kicker">AEMET · Comunidad Valenciana</p>
            <h1>🌤️ Predicción meteorológica</h1>
            <p className="weather-header-subtitle">Información por tramos horarios y resumen diario</p>
            <div className="weather-location-controls">
              <label htmlFor="weather-location-select">Zona:</label>
              <select
                id="weather-location-select"
                value={selectedMunicipality}
                onChange={(e) => setSelectedMunicipality(e.target.value)}
              >
                {municipalityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="weather-header-actions">
            <button 
              className="nav-btn" 
              onClick={() => navigate('/mapa')}
            >
              🗺️ Mapa
            </button>
            <button 
              className="nav-btn" 
              onClick={() => navigate('/noticias')}
            >
              📰 Noticias
            </button>
            {isAdmin && (
              <button 
                className="btn-add-forecast"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setEditingForecast({
                    fecha: today,
                    hora_inicio: '00:00:00',
                    hora_fin: '06:00:00',
                    temperatura: null,
                    probabilidad_precipitacion: 0,
                    cota_nieve: null,
                    direccion_viento: 'N',
                    velocidad_viento: 0,
                    icono_tiempo: 'soleado',
                    temp_minima: null,
                    temp_maxima: null
                  });
                  setIsEditModalOpen(true);
                }}
              >
                ➕ Añadir Previsión
              </button>
            )}
            <button className="btn-logout" onClick={onLogout}>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      <div className="weather-widget-container">
        <div className="weather-summary-strip">
          <span><strong>Boletín:</strong> 7 días</span>
          <span><strong>Zona:</strong> {locationLabel}</span>
          <span><strong>Última actualización:</strong> {new Date().toLocaleString('es-ES')}</span>
        </div>
        {forecast.length === 0 ? (
          <div className="weather-empty">
            <p>No hay previsiones disponibles</p>
            {isAdmin && (
              <button 
                className="btn-add-forecast"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setEditingForecast({
                    fecha: today,
                    hora_inicio: '00:00:00',
                    hora_fin: '06:00:00',
                    temperatura: null,
                    probabilidad_precipitacion: 0,
                    cota_nieve: null,
                    direccion_viento: 'N',
                    velocidad_viento: 0,
                    icono_tiempo: 'soleado',
                    temp_minima: null,
                    temp_maxima: null
                  });
                  setIsEditModalOpen(true);
                }}
              >
                ➕ Crear Primera Previsión
              </button>
            )}
          </div>
        ) : (
          <div
            ref={weekScrollRef}
            className="weather-week-widget"
            onMouseDown={handleWeekMouseDown}
            onMouseMove={handleWeekMouseMove}
            onMouseUp={stopWeekDragging}
            onMouseLeave={stopWeekDragging}
            onWheel={handleWeekWheel}
          >
            {(() => {
              const groupedForecast = groupForecastByDayOfWeek();
              return [0, 1, 2, 3, 4, 5, 6].map(dayIndex => {
              const dayItems = groupedForecast[dayIndex] || [];
              const { min, max } = getMinMaxTemp(dayItems);
              const mainIcon = getMainIcon(dayItems);
              const precipitation = getPrecipitationProbability(dayItems);
              const maxWind = getMaxWind(dayItems);
              const dayName = getDayName(dayIndex);
              
              return (
                <div key={dayIndex} className="weather-day-widget">
                  <div className="widget-day-header">
                    <div>
                      <h3>{dayName}</h3>
                      <div className="widget-day-date">{formatShortDate(dayItems[0]?.fecha)}</div>
                    </div>
                    {isAdmin && dayItems.length > 0 && (
                      <button 
                        className="widget-edit-btn"
                        onClick={() => {
                          // Abrir modal para editar el primer período del día
                          if (dayItems.length > 0) {
                            handleEdit(dayItems[0]);
                          }
                        }}
                        title="Editar previsión"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                  
                  <div className="widget-icon">
                    {mainIcon}
                  </div>
                  
                  <div className="widget-temps">
                    {min !== null && max !== null ? (
                      <>
                        <span className="widget-temp-max">{Math.round(max)}°</span>
                        <span className="widget-temp-sep">/</span>
                        <span className="widget-temp-min">{Math.round(min)}°</span>
                      </>
                    ) : (
                      <span className="widget-temp-na">--</span>
                    )}
                  </div>
                  
                  {precipitation > 0 && (
                    <div className="widget-precipitation">
                      💧 Lluvia: {precipitation}%
                    </div>
                  )}

                  <div className="widget-wind">
                    🌬️ Viento máx: {maxWind.speed} km/h ({getWindDirection(maxWind.direction)})
                  </div>
                  
                  {dayItems.length > 0 && (
                    <div className="widget-details">
                      {dayItems.map((item, idx) => (
                        <div key={item.id || idx} className="widget-period-item">
                          <span className="widget-period-time">
                            {formatTime(item.hora_inicio)}-{formatTime(item.hora_fin)}
                          </span>
                          {item.temperatura !== null && (
                            <span className="widget-period-temp">{Math.round(item.temperatura)}°</span>
                          )}
                          {isAdmin && (
                            <button 
                              className="widget-period-edit"
                              onClick={() => handleEdit(item)}
                              title="Editar"
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {dayItems.length === 0 && isAdmin && (
                    <button 
                      className="widget-add-btn"
                      onClick={() => {
                        // Calcular la fecha del próximo día de la semana
                        const today = new Date();
                        const currentDay = today.getDay();
                        const daysUntilTarget = (dayIndex + 1 - currentDay + 7) % 7 || 7;
                        const targetDate = new Date(today);
                        targetDate.setDate(today.getDate() + daysUntilTarget);
                        const dateString = targetDate.toISOString().split('T')[0];
                        
                        setEditingForecast({
                          fecha: dateString,
                          hora_inicio: '00:00:00',
                          hora_fin: '12:00:00',
                          temperatura: null,
                          probabilidad_precipitacion: 0,
                          cota_nieve: null,
                          direccion_viento: 'N',
                          velocidad_viento: 0,
                          icono_tiempo: 'soleado',
                          temp_minima: null,
                          temp_maxima: null
                        });
                        setIsEditModalOpen(true);
                      }}
                    >
                      Añadir
                    </button>
                  )}
                </div>
              );
            });
            })()}
          </div>
        )}
      </div>

      {isEditModalOpen && editingForecast && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingForecast.id ? 'Editar' : 'Nueva'} Previsión</h2>
            
            <div className="form-group">
              <label>Fecha:</label>
              <input
                type="date"
                value={editingForecast.fecha}
                onChange={(e) => setEditingForecast({ ...editingForecast, fecha: e.target.value })}
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Hora Inicio:</label>
                <input
                  type="time"
                  value={editingForecast.hora_inicio?.substring(0, 5)}
                  onChange={(e) => setEditingForecast({ ...editingForecast, hora_inicio: e.target.value + ':00' })}
                />
              </div>
              
              <div className="form-group">
                <label>Hora Fin:</label>
                <input
                  type="time"
                  value={editingForecast.hora_fin?.substring(0, 5)}
                  onChange={(e) => setEditingForecast({ ...editingForecast, hora_fin: e.target.value + ':00' })}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Temperatura (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingForecast.temperatura || ''}
                  onChange={(e) => setEditingForecast({ ...editingForecast, temperatura: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </div>
              
              <div className="form-group">
                <label>Prob. Precipitación (%):</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingForecast.probabilidad_precipitacion || 0}
                  onChange={(e) => setEditingForecast({ ...editingForecast, probabilidad_precipitacion: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Temp. Mínima (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingForecast.temp_minima || ''}
                  onChange={(e) => setEditingForecast({ ...editingForecast, temp_minima: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </div>
              
              <div className="form-group">
                <label>Temp. Máxima (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingForecast.temp_maxima || ''}
                  onChange={(e) => setEditingForecast({ ...editingForecast, temp_maxima: e.target.value ? parseFloat(e.target.value) : null })}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Dirección Viento:</label>
                <select
                  value={editingForecast.direccion_viento || 'N'}
                  onChange={(e) => setEditingForecast({ ...editingForecast, direccion_viento: e.target.value })}
                >
                  <option value="N">Norte</option>
                  <option value="NE">Noreste</option>
                  <option value="E">Este</option>
                  <option value="SE">Sureste</option>
                  <option value="S">Sur</option>
                  <option value="SO">Suroeste</option>
                  <option value="O">Oeste</option>
                  <option value="NO">Noroeste</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Velocidad Viento (km/h):</label>
                <input
                  type="number"
                  min="0"
                  value={editingForecast.velocidad_viento || 0}
                  onChange={(e) => setEditingForecast({ ...editingForecast, velocidad_viento: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Cota Nieve (m):</label>
                <input
                  type="number"
                  value={editingForecast.cota_nieve || ''}
                  onChange={(e) => setEditingForecast({ ...editingForecast, cota_nieve: e.target.value ? parseInt(e.target.value) : null })}
                />
              </div>
              
              <div className="form-group">
                <label>Icono Tiempo:</label>
                <select
                  value={editingForecast.icono_tiempo || 'soleado'}
                  onChange={(e) => setEditingForecast({ ...editingForecast, icono_tiempo: e.target.value })}
                >
                  <option value="soleado">Soleado</option>
                  <option value="parcialmente_nublado">Parcialmente nublado</option>
                  <option value="nublado">Nublado</option>
                  <option value="lluvia_ligera">Lluvia ligera</option>
                  <option value="lluvia">Lluvia</option>
                  <option value="tormenta">Tormenta</option>
                  <option value="nieve">Nieve</option>
                  <option value="niebla">Niebla</option>
                </select>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsEditModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn-save" onClick={handleSave}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherPage;
