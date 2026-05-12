/**
 * Enrutador principal y sesión de usuario.
 * - Rutas protegidas: /mapa, /noticias, /tiempo requieren `user` en estado.
 * - Token JWT en localStorage; `isTokenExpired` evita sesiones colgadas.
 * - Props típicas a páginas: `user` (token, role, username), `onLogout`.
 */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import MapPage from './components/MapPage';
import NewsPage from './components/NewsPage';
import WeatherPage from './components/WeatherPage';
import './App.css';

// Función para verificar si un token JWT está expirado
function isTokenExpired(token) {
  if (!token) return true;
  
  try {
    // Los tokens JWT tienen el formato: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    
    // Decodificar el payload (base64)
    const payload = JSON.parse(atob(parts[1]));
    
    // Verificar si tiene exp (expiration time)
    if (!payload.exp) return false; // Si no tiene exp, asumimos que no expira
    
    // exp está en segundos desde epoch, Date.now() está en milisegundos
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    
    // Si la expiración es menor que el tiempo actual, el token está expirado
    return expirationTime < currentTime;
  } catch (error) {
    // Si hay error al decodificar, asumimos que está expirado
    return true;
  }
}

function App() {
  const [user, setUser] = useState(null);

  // Cargar usuario desde localStorage al iniciar
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        
        // Verificar si el token está expirado
        if (isTokenExpired(parsedUser.token)) {
          // Token expirado, limpiar sesión silenciosamente
          localStorage.removeItem('user');
          setUser(null);
        } else {
          setUser(parsedUser);
        }
      } catch (e) {
        console.error('Error al cargar usuario:', e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Guardar usuario en localStorage cuando cambia
  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/login" 
            element={
              !user ? (
                <LoginPage onLogin={handleLogin} />
              ) : (
                <Navigate to="/mapa" replace />
              )
            } 
          />
          <Route 
            path="/mapa" 
            element={
              user ? (
                <MapPage user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/noticias" 
            element={
              user ? (
                <NewsPage user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/tiempo" 
            element={
              user ? (
                <WeatherPage user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/" 
            element={
              user ? (
                <Navigate to="/mapa" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;