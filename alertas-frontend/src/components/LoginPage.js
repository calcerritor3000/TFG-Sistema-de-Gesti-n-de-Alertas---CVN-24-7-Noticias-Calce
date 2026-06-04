/**
 * Pantalla de acceso: pestañas Login / Registro.
 * Llama a `POST /api/login` y `POST /api/register` del backend y entrega el
 * objeto usuario a `onLogin` (token + role + username) para el resto de la app.
 */
import React, { useState } from 'react';
import './LoginPage.css';
import './LoginPageAnimations.css';
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      
      const data = await response.json();
      
      if (data.token) {
        onLogin({ 
          username: data.username, 
          role: data.role, 
          token: data.token 
        });
      } else {
        alert(data.error || 'Error en el inicio de sesión');
      }
    } catch (err) {
      console.error('Error en login:', err);
      alert('Error de conexión con el servidor');
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
      {/* Logo CVN 24/7 Noticias */}
      <div style={logoContainerStyle}>
        <div style={logoStyle}>
          <img 
            src={LOGO_URL} 
            alt="CVN Noticias" 
            style={logoImageStyle}
          />
        </div>
      </div>

      {/* Panel de Login/Registro */}
      <div style={authPanelStyle}>
        <div style={tabContainerStyle}>
          <button 
            style={activeTab === 'login' ? activeTabStyle : tabStyle}
            onClick={() => setActiveTab('login')}
            disabled={loading}
          >
            Iniciar sesión
          </button>
          <button 
            style={activeTab === 'register' ? activeTabStyle : tabStyle}
            onClick={() => setActiveTab('register')}
            disabled={loading}
          >
            Registrarse
          </button>
        </div>

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} style={formStyle}>
            <div style={inputGroupStyle}>
              <label htmlFor="login-username" style={labelStyle}>Usuario o Email</label>
              <input 
                id="login-username"
                name="username" 
                placeholder="Introduce tu usuario o correo" 
                value={loginForm.username} 
                onChange={handleLoginChange} 
                style={inputStyle} 
                required 
                disabled={loading}
              />
            </div>
            <div style={inputGroupStyle}>
              <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
              <div style={passwordInputContainerStyle}>
                <input 
                  id="login-password"
                  name="password" 
                  type={showLoginPassword ? "text" : "password"} 
                  placeholder="Introduce tu contraseña" 
                  value={loginForm.password} 
                  onChange={handleLoginChange} 
                  style={passwordInputStyle} 
                  required 
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  style={passwordToggleStyle}
                  disabled={loading}
                  aria-label={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showLoginPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button 
              type="submit" 
              style={loading ? disabledButtonStyle : primaryButtonStyle}
              disabled={loading}
            >
              {loading ? 'Conectando…' : 'Iniciar sesión'}
            </button>

          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} style={formStyle}>
            <div style={inputGroupStyle}>
              <label htmlFor="register-username" style={labelStyle}>Usuario</label>
              <input 
                id="register-username"
                name="username" 
                placeholder="tu_usuario" 
                value={registerForm.username} 
                onChange={handleRegisterChange} 
                style={inputStyle} 
                required 
                disabled={loading}
              />
            </div>
            <div style={inputGroupStyle}>
              <label htmlFor="register-email" style={labelStyle}>Email</label>
              <input 
                id="register-email"
                name="email" 
                type="email" 
                placeholder="tu@email.com" 
                value={registerForm.email} 
                onChange={handleRegisterChange} 
                style={inputStyle} 
                required 
                disabled={loading}
              />
            </div>
            <div style={inputGroupStyle}>
              <label htmlFor="register-password" style={labelStyle}>Contraseña</label>
              <div style={passwordInputContainerStyle}>
                <input 
                  id="register-password"
                  name="password" 
                  type={showRegisterPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={registerForm.password} 
                  onChange={handleRegisterChange} 
                  style={passwordInputStyle} 
                  required 
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  style={passwordToggleStyle}
                  disabled={loading}
                  aria-label={showRegisterPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showRegisterPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button 
              type="submit" 
              style={loading ? disabledButtonStyle : primaryButtonStyle}
              disabled={loading}
            >
              {loading ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <p>Sistema de Gestión de Alertas - CVN 24/7 Noticias</p>
      </div>
    </div>
  );
};

// Estilos para la página de login
const logoContainerStyle = {
  textAlign: 'center',
  marginBottom: '10px',
  animation: 'slideInDown 0.6s ease-out',
  animationFillMode: 'both'
};

const logoStyle = {
  background: 'rgba(30, 30, 30, 0.95)',
  padding: '10px 20px',
  borderRadius: '15px',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  animation: 'scaleIn 0.5s ease-out 0.2s both'
};


const logoImageStyle = {
  height: '130px',
  width: 'auto',
  maxWidth: '550px',
  objectFit: 'contain',
  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
};

const authPanelStyle = {
  width: '100%',
  maxWidth: '380px',
  background: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(10px)',
  padding: '18px',
  borderRadius: '15px',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  animation: 'slideInUp 0.6s ease-out 0.3s both',
  transition: 'all 0.3s ease'
};

const tabContainerStyle = {
  display: 'flex',
  marginBottom: '12px',
  background: '#f8f9fa',
  borderRadius: '10px',
  padding: '3px',
  animation: 'fadeIn 0.5s ease-out 0.5s both'
};

const tabStyle = {
  flex: 1,
  padding: '10px',
  border: 'none',
  background: 'transparent',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: '600',
  color: '#6c757d',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  fontSize: '13px',
  position: 'relative',
  overflow: 'hidden'
};

const activeTabStyle = {
  ...tabStyle,
  background: 'white',
  color: '#000000',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  transform: 'scale(1.02)'
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const labelStyle = {
  fontSize: '13px',
  fontWeight: '600',
  color: '#2c3e50',
  marginBottom: '2px'
};

const inputStyle = {
  padding: '10px 12px',
  border: '2px solid #e9ecef',
  borderRadius: '8px',
  fontSize: '14px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  background: 'white',
  color: '#2c3e50',
  fontFamily: 'inherit',
  animation: 'fadeIn 0.5s ease-out 0.6s both'
};

const passwordInputContainerStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center'
};

const passwordInputStyle = {
  ...inputStyle,
  paddingRight: '45px',
  width: '100%'
};

const passwordToggleStyle = {
  position: 'absolute',
  right: '8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '20px',
  padding: '5px 10px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s ease',
  borderRadius: '4px',
  opacity: 0.7
};

const primaryButtonStyle = {
  padding: '10px 18px',
  background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
  color: 'white',
  border: '2px solid #000000',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
  fontFamily: 'inherit',
  marginTop: '2px',
  position: 'relative',
  overflow: 'hidden',
  animation: 'fadeIn 0.5s ease-out 0.7s both'
};

const disabledButtonStyle = {
  ...primaryButtonStyle,
  background: '#1a1a1a',
  borderColor: '#2a2a2a',
  cursor: 'not-allowed',
  boxShadow: 'none',
  opacity: '0.5'
};

const footerStyle = {
  marginTop: '40px',
  textAlign: 'center',
  color: 'white',
  fontSize: '14px',
  opacity: '0.8'
};

// Efectos hover
Object.assign(primaryButtonStyle, {
  ':hover': {
    transform: 'translateY(-3px) scale(1.02)',
    background: 'linear-gradient(135deg, #1a1a1a 0%, #000000 100%)',
    borderColor: '#000000',
    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)'
  },
  ':active': {
    transform: 'translateY(-1px) scale(0.98)',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
  }
});

Object.assign(inputStyle, {
  ':focus': {
    outline: 'none',
    borderColor: '#007bff',
    boxShadow: '0 0 0 3px rgba(0, 123, 255, 0.1)',
    transform: 'translateY(-2px)',
    borderWidth: '2px'
  },
  ':hover': {
    borderColor: '#007bff',
    transform: 'translateY(-1px)',
    boxShadow: '0 2px 8px rgba(0, 123, 255, 0.1)'
  }
});

// Estilos para el botón de mostrar/ocultar contraseña
Object.assign(passwordToggleStyle, {
  ':hover': {
    opacity: 1,
    transform: 'scale(1.1)',
    background: 'rgba(0, 123, 255, 0.1)'
  },
  ':active': {
    transform: 'scale(0.95)'
  },
  ':disabled': {
    opacity: 0.4,
    cursor: 'not-allowed'
  }
});

Object.assign(tabStyle, {
  ':hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    transform: 'translateY(-2px)',
    color: '#495057'
  },
  ':active': {
    transform: 'scale(0.95)'
  }
});

export default LoginPage;