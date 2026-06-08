/**
 * Pantalla de acceso: pestañas Login / Registro.
 * Llama a `POST /api/login` y `POST /api/register` del backend y entrega el
 * objeto usuario a `onLogin` (token + role + username) para el resto de la app.
 */
import React, { useState } from 'react';
import './LoginPage.css';
import { apiUrl, LOGO_URL } from '../config';

const LoginPage = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const handleLoginChange = e => setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
  const handleRegisterChange = e => setRegisterForm({ ...registerForm, [e.target.name]: e.target.value });

  const fetchWithTimeout = async (url, options, ms = 90000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetchWithTimeout(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.token) {
        onLogin({
          username: data.username,
          role: data.role,
          token: data.token
        });
      } else if (response.status === 401) {
        alert(data.error || 'Usuario o contraseña incorrectos');
      } else if (response.status === 503 || data.offline) {
        alert('El servidor no responde. En el plan free de Render puede tardar hasta 60 segundos en despertar. Espera y vuelve a intentar.');
      } else {
        alert(data.error || `Error en el inicio de sesión (${response.status})`);
      }
    } catch (err) {
      console.error('Error en login:', err);
      if (err.name === 'AbortError') {
        alert('El servidor tarda en responder (Render despertando). Espera un minuto y pulsa Iniciar sesión otra vez.');
      } else {
        alert('Error de conexión con el servidor. Comprueba que usas https://cvnalertas.onrender.com');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      });

      const data = await response.json();

      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        alert('Usuario registrado correctamente');
        setRegisterForm({ username: '', email: '', password: '' });
        setActiveTab('login');
      }
    } catch (err) {
      console.error('Error en registro:', err);
      alert('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-logo-container">
        <div className="login-logo-box">
          <img
            src={LOGO_URL}
            alt="CVN Noticias"
            className="login-logo-img"
          />
        </div>
      </div>

      <div className="login-auth-panel">
        <div className="login-tab-container">
          <button
            type="button"
            className={`login-tab${activeTab === 'login' ? ' active' : ''}`}
            onClick={() => setActiveTab('login')}
            disabled={loading}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`login-tab${activeTab === 'register' ? ' active' : ''}`}
            onClick={() => setActiveTab('register')}
            disabled={loading}
          >
            Registrarse
          </button>
        </div>

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="login-form">
            <div className="login-input-group">
              <label htmlFor="login-username" className="login-label">Usuario o Email</label>
              <input
                id="login-username"
                name="username"
                className="login-input"
                placeholder="Introduce tu usuario o correo"
                value={loginForm.username}
                onChange={handleLoginChange}
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div className="login-input-group">
              <label htmlFor="login-password" className="login-label">Contraseña</label>
              <div className="password-input-container">
                <input
                  id="login-password"
                  name="password"
                  className="login-input login-input-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  placeholder="Introduce tu contraseña"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  disabled={loading}
                  aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showLoginPassword ? '🔒' : '👁️'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? 'Conectando…' : 'Iniciar sesión'}
            </button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="login-form">
            <div className="login-input-group">
              <label htmlFor="register-username" className="login-label">Usuario</label>
              <input
                id="register-username"
                name="username"
                className="login-input"
                placeholder="tu_usuario"
                value={registerForm.username}
                onChange={handleRegisterChange}
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div className="login-input-group">
              <label htmlFor="register-email" className="login-label">Email</label>
              <input
                id="register-email"
                name="email"
                type="email"
                className="login-input"
                placeholder="tu@email.com"
                value={registerForm.email}
                onChange={handleRegisterChange}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <div className="login-input-group">
              <label htmlFor="register-password" className="login-label">Contraseña</label>
              <div className="password-input-container">
                <input
                  id="register-password"
                  name="password"
                  className="login-input login-input-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={registerForm.password}
                  onChange={handleRegisterChange}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  disabled={loading}
                  aria-label={showRegisterPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showRegisterPassword ? '🔒' : '👁️'}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={loading}
            >
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>

      <div className="login-footer">
        <p>Sistema de Gestión de Alertas - CVN 24/7 Noticias</p>
      </div>
    </div>
  );
};

export default LoginPage;
