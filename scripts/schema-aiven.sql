-- =============================================================================
-- Esquema MySQL para Aiven (todas las tablas con PRIMARY KEY)
-- Ejecutar en base de datos VACÍA antes de desplegar la app o en lugar de un dump viejo.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS alert_comments;
DROP TABLE IF EXISTS alert_reports;
DROP TABLE IF EXISTS alert_confirmations;
DROP TABLE IF EXISTS zone_subscriptions;
DROP TABLE IF EXISTS weather_forecast;
DROP TABLE IF EXISTS alerts_new;
DROP TABLE IF EXISTS users_new;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_usuario VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_nombre (nombre_usuario),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alerts_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  image_url TEXT NULL,
  nivel ENUM('verde', 'amarillo', 'rojo') DEFAULT 'verde',
  categoria ENUM(
    'incendio', 'inundacion', 'dana', 'trafico', 'obras',
    'meteorologia', 'seguridad', 'salud', 'medio_ambiente',
    'infraestructura', 'otro'
  ) DEFAULT 'otro',
  estado ENUM('activa', 'resuelta', 'en_revision', 'desmentida') DEFAULT 'activa',
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  radius INT DEFAULT 500,
  polygon JSON NULL,
  is_maintenance BOOLEAN DEFAULT FALSE,
  maintenance_start DATETIME NULL,
  maintenance_end DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  user_id INT NOT NULL,
  confirmed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_alert (alert_id, user_id),
  FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  user_id INT NOT NULL,
  tipo ENUM('falsa', 'desactualizada', 'duplicada', 'inapropiada', 'otro') NOT NULL,
  motivo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revisado BOOLEAN DEFAULT FALSE,
  revisado_por INT NULL,
  revisado_at DATETIME NULL,
  FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alert_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  user_id INT NOT NULL,
  comentario TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE zone_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nombre_zona VARCHAR(255) NOT NULL,
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  radius INT DEFAULT 1000,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  alert_id INT NULL,
  tipo ENUM('nueva_alerta', 'alerta_cerca', 'alerta_resuelta', 'comentario', 'reporte_revisado') NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT,
  leida BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE,
  FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX idx_push_endpoint_unique ON push_subscriptions (endpoint(255));

CREATE TABLE weather_forecast (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  temperatura DECIMAL(4, 1),
  probabilidad_precipitacion INT DEFAULT 0,
  cota_nieve INT NULL,
  direccion_viento VARCHAR(10),
  velocidad_viento INT DEFAULT 0,
  icono_tiempo VARCHAR(50) DEFAULT 'soleado',
  temp_minima DECIMAL(4, 1),
  temp_maxima DECIMAL(4, 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_fecha_hora (fecha, hora_inicio, hora_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
