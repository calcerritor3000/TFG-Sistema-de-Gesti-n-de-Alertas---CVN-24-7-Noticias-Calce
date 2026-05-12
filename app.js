/**
 * =============================================================================
 * API REST — Sistema de gestión de alertas (Comunidad Valenciana)
 * =============================================================================
 * Servidor monolítico Node.js + Express. Persistencia en MySQL (mysql2/pool).
 *
 * Responsabilidades principales
 * -------------------------------
 * - Autenticación: registro, login, JWT (`autenticar`, `soloAdmin`).
 * - Alertas: CRUD, filtros, radio/polígono, imágenes en `uploads/alerts/`.
 * - Interacción: comentarios, confirmaciones, reportes, notificaciones.
 * - Zonas de interés y push web (VAPID + `web-push`).
 * - Meteorología: tabla `weather_forecast`, sincronización vía API Open-Meteo.
 * - Arranque: `inicializarBaseDatos()` crea o altera tablas si faltan columnas.
 *
 * Estáticos: `GET /uploads/*`; opcionalmente sirve el build del React si existe.
 * Configuración: variables en `.env` (JWT_SECRET, DB_*, FRONTEND_URL, VAPID_*,
 * WEATHER_*, PORT, ALERT_RADIUS_MAX_METERS, etc.).
 *
 * Bloques del código marcados con `// =========` para localizar rutas rápido.
 * =============================================================================
 */

// Cargar variables de entorno desde .env
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');

const app = express();

// ============================================
// CONSTANTES DE DOMINIO
// ============================================
const VALID_LEVELS = ['verde', 'amarillo', 'rojo'];
const VALID_CATEGORIES = ['incendio', 'inundacion', 'dana', 'trafico', 'obras', 'meteorologia', 'seguridad', 'salud', 'medio_ambiente', 'infraestructura', 'otro'];
const VALID_STATUSES = ['activa', 'resuelta', 'en_revision', 'desmentida'];
const ALERT_DEFAULT_RADIUS_BY_LEVEL = { verde: 300, amarillo: 400, rojo: 500 };
const ALERT_RADIUS_MIN = 50;
const ALERT_RADIUS_MAX = parseInt(process.env.ALERT_RADIUS_MAX_METERS, 10) || 25000;

// ============================================
// PUSH NOTIFICATIONS (SERVICE WORKER)
// ============================================
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'admin@alertas.local';

let effectiveVapidPublicKey = vapidPublicKey;
let effectiveVapidPrivateKey = vapidPrivateKey;

if (!effectiveVapidPublicKey || !effectiveVapidPrivateKey) {
  const generated = webpush.generateVAPIDKeys();
  effectiveVapidPublicKey = generated.publicKey;
  effectiveVapidPrivateKey = generated.privateKey;
  console.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no definidos en .env.');
  console.warn('Se han generado claves temporales para esta sesión.');
  console.warn('Añade estas variables a .env para notificaciones persistentes entre reinicios:');
  console.warn(`VAPID_PUBLIC_KEY=${effectiveVapidPublicKey}`);
  console.warn(`VAPID_PRIVATE_KEY=${effectiveVapidPrivateKey}`);
}

webpush.setVapidDetails(`mailto:${vapidEmail}`, effectiveVapidPublicKey, effectiveVapidPrivateKey);

// ============================================
// ARCHIVOS (SUBIDA DE IMÁGENES)
// ============================================
const uploadsRoot = path.join(__dirname, 'uploads');
const uploadsAlertsDir = path.join(uploadsRoot, 'alerts');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
if (!fs.existsSync(uploadsAlertsDir)) fs.mkdirSync(uploadsAlertsDir, { recursive: true });

// ============================================
// CONFIGURACIÓN INICIAL
// ============================================

// Configurar CORS manualmente
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_URL || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configurar JSON
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsRoot));

// Verificar variables de entorno críticas
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET es requerido. Configúralo en tu archivo .env');
  process.exit(1);
}

// ============================================
// BASE DE DATOS
// ============================================

// Configuración de conexión MySQL
// Usar 127.0.0.1 en lugar de localhost para forzar IPv4
const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbConfig = {
  host: dbHost === 'localhost' ? '127.0.0.1' : dbHost,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alertas_db',
  port: parseInt(process.env.DB_PORT) || 3306
};

// Mostrar configuración (sin mostrar contraseña)
console.log('Configuración de base de datos:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Usuario: ${dbConfig.user}`);
console.log(`   Base de datos: ${dbConfig.database}`);
console.log(`   Puerto: ${dbConfig.port}`);

const pool = mysql.createPool(dbConfig);

// Verificar conexión
pool.getConnection()
  .then(conn => {
    console.log("Conexión a MySQL correcta");
    conn.release();
  })
  .catch(err => {
    console.error("Error al conectar a MySQL:", err.message);
    console.error("Verifica que:");
    console.error("   1. MySQL esté corriendo");
    console.error("   2. El puerto sea correcto (por defecto 3306)");
    console.error("   3. Las credenciales en .env sean correctas");
    console.error("   4. La base de datos exista");
    console.error(`   Intenta conectarte con: mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p`);
  });

/**
 * Crea tablas si no existen y ejecuta ALTER tolerantes a fallos por columnas ya existentes.
 * Se invoca al arrancar el proceso (`inicializarBaseDatos()` tras crear el pool).
 */
async function inicializarBaseDatos() {
  try {
    // Intentar conectar primero
    const conn = await pool.getConnection();
    console.log("Conectado a MySQL, inicializando tablas...");
    conn.release();

    // Tabla de usuarios
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users_new (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre_usuario VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabla users_new lista");

    // Tabla de alertas
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS alerts_new (
        id INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descripcion TEXT,
        image_url TEXT NULL,
        nivel ENUM('verde', 'amarillo', 'rojo') DEFAULT 'verde',
        categoria ENUM('incendio', 'inundacion', 'dana', 'trafico', 'obras', 'meteorologia', 'seguridad', 'salud', 'medio_ambiente', 'infraestructura', 'otro') DEFAULT 'otro',
        estado ENUM('activa', 'resuelta', 'en_revision', 'desmentida') DEFAULT 'activa',
        lat DECIMAL(10, 8) NOT NULL,
        lng DECIMAL(11, 8) NOT NULL,
        radius INT DEFAULT 500,
        is_maintenance BOOLEAN DEFAULT FALSE,
        maintenance_start DATETIME NULL,
        maintenance_end DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Tabla alerts_new lista");

    // Compatibilidad con instalaciones antiguas sin image_url
    try {
      await pool.execute('ALTER TABLE alerts_new ADD COLUMN image_url TEXT NULL');
      console.log("Columna image_url añadida en alerts_new");
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        throw err;
      }
    }

    // Tabla de confirmaciones
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS alert_confirmations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_id INT NOT NULL,
        user_id INT NOT NULL,
        confirmed BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_alert (alert_id, user_id)
      )
    `);
    console.log("Tabla alert_confirmations lista");

    // Tabla de reportes
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS alert_reports (
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
      )
    `);
    console.log("Tabla alert_reports lista");

    // Tabla de comentarios
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS alert_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_id INT NOT NULL,
        user_id INT NOT NULL,
        comentario TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (alert_id) REFERENCES alerts_new(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
      )
    `);
    console.log("Tabla alert_comments lista");

    // Tabla de suscripciones
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS zone_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        nombre_zona VARCHAR(255) NOT NULL,
        lat DECIMAL(10, 8) NOT NULL,
        lng DECIMAL(11, 8) NOT NULL,
        radius INT DEFAULT 1000,
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
      )
    `);
    console.log("Tabla zone_subscriptions lista");

    // Tabla de notificaciones
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
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
      )
    `);
    console.log("Tabla notifications lista");

    // Tabla de suscripciones push web
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users_new(id) ON DELETE CASCADE
      )
    `);
    console.log("Tabla push_subscriptions lista");

    try {
      await pool.execute(`
        CREATE UNIQUE INDEX idx_push_endpoint_unique
        ON push_subscriptions (endpoint(255))
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        throw err;
      }
    }

    // Tabla de previsiones meteorológicas
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS weather_forecast (
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
      )
    `);
    console.log("Tabla weather_forecast lista");

    // Agregar columnas nuevas si no existen (para tablas existentes)
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN radius INT DEFAULT 500
      `);
      console.log("Columna radius agregada");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("Columna radius ya existe");
      } else {
        console.log("Error al agregar columna radius:", err.message);
      }
    }
    
    // Agregar columna para polígonos (GeoJSON)
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN polygon JSON NULL
      `);
      console.log("Columna polygon agregada");
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log("Columna polygon ya existe");
      } else {
        console.log("Error al agregar columna polygon:", err.message);
      }
    }
    
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN IF NOT EXISTS is_maintenance BOOLEAN DEFAULT FALSE
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log("Columna is_maintenance ya existe o no se pudo agregar");
      }
    }
    
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN IF NOT EXISTS maintenance_start DATETIME NULL
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log("Columna maintenance_start ya existe o no se pudo agregar");
      }
    }
    
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN IF NOT EXISTS maintenance_end DATETIME NULL
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log("Columna maintenance_end ya existe o no se pudo agregar");
      }
    }

    // Agregar columnas nuevas para categorías y estado
    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN IF NOT EXISTS categoria ENUM('incendio', 'inundacion', 'dana', 'trafico', 'obras', 'meteorologia', 'seguridad', 'salud', 'medio_ambiente', 'infraestructura', 'otro') DEFAULT 'otro' AFTER nivel
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log("Columna categoria ya existe o no se pudo agregar");
      }
    }

    // Incluir categoría 'dana' en instalaciones que ya tenían el ENUM antiguo
    try {
      await pool.execute(`
        ALTER TABLE alerts_new
        MODIFY COLUMN categoria ENUM(
          'incendio', 'inundacion', 'dana', 'trafico', 'obras',
          'meteorologia', 'seguridad', 'salud', 'medio_ambiente',
          'infraestructura', 'otro'
        ) DEFAULT 'otro'
      `);
      console.log("ENUM categoria comprobado (incluye dana)");
    } catch (err) {
      console.log("ENUM categoria:", err.message);
    }

    try {
      await pool.execute(`
        ALTER TABLE alerts_new 
        ADD COLUMN IF NOT EXISTS estado ENUM('activa', 'resuelta', 'en_revision', 'desmentida') DEFAULT 'activa' AFTER categoria
      `);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') {
        console.log("Columna estado ya existe o no se pudo agregar");
      }
    }

    // Crear usuario admin por defecto (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      const [existe] = await pool.execute('SELECT id FROM users_new WHERE nombre_usuario = ?', ['admin']);
      if (existe.length === 0) {
        const password = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
        const hash = await bcrypt.hash(password, 10);
        await pool.execute(
          'INSERT INTO users_new (nombre_usuario, email, password_hash, role) VALUES (?, ?, ?, ?)',
          ['admin', 'admin@example.com', hash, 'admin']
        );
        console.log("Usuario admin creado (solo desarrollo)");
        console.log("   Usuario: admin | Contraseña:", password);
      }
    }
  } catch (err) {
    console.error("Error inicializando base de datos:", err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error("MySQL no está corriendo o el puerto es incorrecto");
      console.error(`   Intenta: mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p`);
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("Credenciales incorrectas. Verifica usuario y contraseña en .env");
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error("La base de datos no existe. Créala primero:");
      console.error(`   CREATE DATABASE ${dbConfig.database};`);
    }
  }
}

inicializarBaseDatos();

// ============================================
// FUNCIONES DE VALIDACIÓN
// ============================================

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarCoordenadas(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  return !isNaN(latNum) && !isNaN(lngNum) &&
         latNum >= -90 && latNum <= 90 &&
         lngNum >= -180 && lngNum <= 180;
}

// Validar que las coordenadas estén dentro de la Comunidad Valenciana
// Cubre las tres provincias: Alicante, Valencia y Castellón
function validarComunidadValenciana(lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  // Límites de la Comunidad Valenciana (Alicante, Valencia y Castellón)
  // Ajustados para cubrir completamente las tres provincias
  const LAT_MIN = 38.2;   // Sur (extremo sur de Alicante)
  const LAT_MAX = 40.7;   // Norte (extremo norte de Castellón)
  const LNG_MIN = -1.2;   // Oeste (extremo oeste)
  const LNG_MAX = 0.6;    // Este (extremo este, incluyendo islas)
  
  return latNum >= LAT_MIN && latNum <= LAT_MAX &&
         lngNum >= LNG_MIN && lngNum <= LNG_MAX;
}

function validarNivel(nivel) {
  return VALID_LEVELS.includes(nivel);
}

function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const r = 6371000; // metros
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

async function notificarUsuariosPorZona(alertData) {
  try {
    const [rows] = await pool.execute(`
      SELECT
        zs.user_id,
        zs.nombre_zona,
        zs.lat AS zone_lat,
        zs.lng AS zone_lng,
        zs.radius AS zone_radius,
        ps.id AS push_id,
        ps.endpoint,
        ps.p256dh,
        ps.auth
      FROM zone_subscriptions zs
      JOIN push_subscriptions ps ON ps.user_id = zs.user_id
      WHERE zs.activa = TRUE AND ps.activa = TRUE
    `);

    const subscriptionsToNotify = new Map();
    for (const row of rows) {
      const distance = calcularDistanciaMetros(
        parseFloat(row.zone_lat),
        parseFloat(row.zone_lng),
        parseFloat(alertData.lat),
        parseFloat(alertData.lng)
      );

      if (distance > parseInt(row.zone_radius, 10)) {
        continue;
      }

      const current = subscriptionsToNotify.get(row.push_id);
      if (!current || distance < current.distance) {
        subscriptionsToNotify.set(row.push_id, {
          endpoint: row.endpoint,
          p256dh: row.p256dh,
          auth: row.auth,
          zoneName: row.nombre_zona,
          distance: Math.round(distance)
        });
      }
    }

    if (subscriptionsToNotify.size === 0) {
      return;
    }

    const payloadBase = {
      icon: '/logo192.png',
      badge: '/logo192.png',
      url: '/mapa',
      alertId: alertData.id
    };

    await Promise.all(Array.from(subscriptionsToNotify.entries()).map(async ([pushId, sub]) => {
      const payload = JSON.stringify({
        title: `⚠️ Alerta en "${sub.zoneName}"`,
        body: `${alertData.title} (${sub.distance}m de tu zona)`,
        ...payloadBase
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.execute('UPDATE push_subscriptions SET activa = FALSE WHERE id = ?', [pushId]);
          return;
        }
        console.error('Error enviando push notification:', err.message);
      }
    }));
  } catch (err) {
    console.error('Error notificando zonas de interés:', err.message);
  }
}

// ============================================
// MIDDLEWARES
// ============================================

/** Valida cabecera `Authorization: Bearer <JWT>` y adjunta `req.user` (payload). */
function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
}

/** Debe usarse después de `autenticar`; exige `req.user.role === 'admin'`. */
function soloAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  }
  next();
}

// ============================================
// RUTAS DE USUARIOS
// ============================================

// Registrar usuario
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  // Validar datos
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Usuario debe tener entre 3 y 50 caracteres' });
  }
  if (!validarEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users_new (nombre_usuario, email, password_hash) VALUES (?, ?, ?)',
      [username.trim(), email.trim().toLowerCase(), hash]
    );
    res.json({ message: 'Usuario creado correctamente', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Usuario o email ya existe' });
    } else {
      console.error('Error en registro:', err.message);
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const [usuarios] = await pool.execute(
      'SELECT id, nombre_usuario, email, password_hash, role FROM users_new WHERE nombre_usuario = ? OR email = ?',
      [username, username]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = usuarios[0];
    const coincide = await bcrypt.compare(password, usuario.password_hash);

    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, role: usuario.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login correcto',
      token,
      role: usuario.role,
      username: usuario.nombre_usuario
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error en login' });
  }
});

// ============================================
// RUTAS DE PUSH NOTIFICATIONS
// ============================================
app.get('/api/push/public-key', (_req, res) => {
  res.json({ publicKey: effectiveVapidPublicKey });
});

app.post('/api/push/subscribe', autenticar, async (req, res) => {
  const { subscription } = req.body || {};
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Suscripción push inválida' });
  }

  try {
    await pool.execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, activa)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         p256dh = VALUES(p256dh),
         auth = VALUES(auth),
         activa = TRUE,
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, endpoint, p256dh, auth]
    );

    res.json({ message: 'Suscripción push guardada correctamente' });
  } catch (err) {
    console.error('Error al guardar suscripción push:', err.message);
    res.status(500).json({ error: 'Error al guardar suscripción push' });
  }
});

app.post('/api/push/unsubscribe', autenticar, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint requerido' });
  }

  try {
    await pool.execute(
      'UPDATE push_subscriptions SET activa = FALSE WHERE user_id = ? AND endpoint = ?',
      [req.user.id, endpoint]
    );
    res.json({ message: 'Suscripción push desactivada' });
  } catch (err) {
    console.error('Error al desactivar suscripción push:', err.message);
    res.status(500).json({ error: 'Error al desactivar suscripción push' });
  }
});

// ============================================
// RUTAS DE ALERTAS
// ============================================

// Subida de imagen para alertas (base64)
app.post('/api/upload-image', autenticar, soloAdmin, async (req, res) => {
  try {
    const { dataUrl, fileName } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'No se recibió imagen' });
    }

    // Formato esperado: data:image/png;base64,XXXXX
    const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({ error: 'Formato de imagen no válido' });
    }

    const mimeType = match[1].toLowerCase();
    const base64Data = match[3];
    const extensionByMime = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const ext = extensionByMime[mimeType];
    if (!ext) {
      return res.status(400).json({ error: 'Tipo de imagen no permitido' });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (buffer.length > maxSize) {
      return res.status(400).json({ error: 'La imagen supera 5MB' });
    }

    const safeBase = (fileName || 'imagen')
      .toString()
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 40) || 'imagen';
    const uniqueName = `${Date.now()}_${safeBase}.${ext}`;
    const targetPath = path.join(uploadsAlertsDir, uniqueName);

    await fs.promises.writeFile(targetPath, buffer);

    res.json({
      message: 'Imagen subida correctamente',
      image_url: `/uploads/alerts/${uniqueName}`
    });
  } catch (err) {
    console.error('Error al subir imagen:', err.message);
    res.status(500).json({ error: 'Error al subir imagen' });
  }
});

// Obtener todas las alertas
app.get('/api/alerts', async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    try {
      const conn = await pool.getConnection();
      conn.release();
    } catch (dbErr) {
      console.error('Error de conexión a la base de datos:', dbErr.message);
      return res.status(503).json({ error: 'Servicio no disponible. La base de datos no está conectada.' });
    }

    const limite = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // Filtros opcionales
    const categoria = req.query.categoria;
    const estado = req.query.estado;
    const nivel = req.query.nivel;
    
    // Intentar query con columnas nuevas, si falla usar query básica
    let query = 'SELECT id, titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end, created_at FROM alerts_new WHERE 1=1';
    const params = [];
    
    if (estado) {
      query += ' AND estado = ?';
      params.push(estado);
    }
    if (categoria) {
      query += ' AND categoria = ?';
      params.push(categoria.toLowerCase().trim());
    }
    if (nivel) {
      const nivelNormalizado = nivel.toLowerCase().trim();
      // Validar que el nivel sea uno de los valores permitidos
      if (!VALID_LEVELS.includes(nivelNormalizado)) {
        return res.status(400).json({ error: 'Nivel inválido' });
      }
      query += ' AND nivel = ?';
      params.push(nivelNormalizado);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limite, offset);
    
    let alertas = [];
    try {
      const [result] = await pool.execute(query, params);
      alertas = result;
    } catch (err) {
      // Si falla por columnas que no existen, usar query básica
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        let basicQuery = 'SELECT id, titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end, created_at FROM alerts_new WHERE 1=1';
        const basicParams = [];
        if (estado) {
          basicQuery += ' AND estado = ?';
          basicParams.push(estado);
        }
        if (categoria) {
          basicQuery += ' AND categoria = ?';
          basicParams.push(categoria.toLowerCase().trim());
        }
        if (nivel) {
          const nivelNormalizado = nivel.toLowerCase().trim();
          if (VALID_LEVELS.includes(nivelNormalizado)) {
            basicQuery += ' AND nivel = ?';
            basicParams.push(nivelNormalizado);
          }
        }
        basicQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        basicParams.push(limite, offset);
        const [result] = await pool.execute(basicQuery, basicParams);
        alertas = result;
      } else {
        console.error('Error en consulta SQL:', err);
        throw err;
      }
    }
    
    // Obtener confirmaciones y reportes para cada alerta
    const alertasConStats = await Promise.all(alertas.map(async (alerta) => {
      let confirmaciones = [{ total: 0 }];
      let reportes = [{ total: 0 }];
      
      try {
        const [conf] = await pool.execute(
          'SELECT COUNT(*) as total FROM alert_confirmations WHERE alert_id = ? AND confirmed = TRUE',
          [alerta.id]
        );
        confirmaciones = conf;
      } catch (err) {
        // Tabla puede no existir todavía
        console.log('Tabla alert_confirmations no existe todavía');
      }
      
      try {
        const [rep] = await pool.execute(
          'SELECT COUNT(*) as total FROM alert_reports WHERE alert_id = ? AND revisado = FALSE',
          [alerta.id]
        );
        reportes = rep;
      } catch (err) {
        // Tabla puede no existir todavía
        console.log('Tabla alert_reports no existe todavía');
      }
      
      return {
        id: alerta.id,
        title: alerta.titulo,
        description: alerta.descripcion,
        image_url: alerta.image_url || null,
        level: alerta.nivel,
        categoria: alerta.categoria || 'otro', // Asegurar que siempre haya una categoría
        estado: alerta.estado || 'activa',
        lat: alerta.lat,
        lng: alerta.lng,
        radius: alerta.radius,
        is_maintenance: alerta.is_maintenance,
        maintenance_start: alerta.maintenance_start,
        maintenance_end: alerta.maintenance_end,
        created_at: alerta.created_at,
        confirmaciones: confirmaciones[0]?.total || 0,
        reportes_pendientes: reportes[0]?.total || 0
      };
    }));
    
    res.json(alertasConStats);
  } catch (err) {
    console.error('Error al obtener alertas:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('Error completo:', err);
    res.status(500).json({ error: 'Error al obtener alertas', details: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor' });
  }
});

// Crear alerta (solo admin)
app.post('/api/alerts', autenticar, soloAdmin, async (req, res) => {
  const { title, description, image_url, level, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end } = req.body;

  // Validar datos
  if (!title || !description || !level || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  if (title.trim().length === 0 || title.length > 255) {
    return res.status(400).json({ error: 'Título debe tener entre 1 y 255 caracteres' });
  }
  if (!validarNivel(level)) {
    return res.status(400).json({ error: 'Nivel inválido. Debe ser: verde, amarillo o rojo' });
  }
  if (!validarCoordenadas(lat, lng)) {
    return res.status(400).json({ error: 'Coordenadas inválidas' });
  }
  
  if (!validarComunidadValenciana(lat, lng)) {
    return res.status(400).json({ 
      error: 'Las alertas solo pueden crearse dentro de la Comunidad Valenciana' 
    });
  }

  // Validar y establecer radio por defecto según nivel si no se proporciona
  const fallbackRadius = ALERT_DEFAULT_RADIUS_BY_LEVEL[level] || ALERT_DEFAULT_RADIUS_BY_LEVEL.verde;
  const radioFinal = parseInt(radius, 10) || fallbackRadius;
  if (radioFinal < ALERT_RADIUS_MIN || radioFinal > ALERT_RADIUS_MAX) {
    return res.status(400).json({ error: `El radio debe estar entre ${ALERT_RADIUS_MIN} y ${ALERT_RADIUS_MAX} metros` });
  }

  // Validar fechas de mantenimiento si es una alerta de mantenimiento
  let maintenanceStart = null;
  let maintenanceEnd = null;
  if (is_maintenance) {
    if (maintenance_start) {
      maintenanceStart = new Date(maintenance_start);
      if (isNaN(maintenanceStart.getTime())) {
        return res.status(400).json({ error: 'Fecha de inicio de mantenimiento inválida' });
      }
    }
    if (maintenance_end) {
      maintenanceEnd = new Date(maintenance_end);
      if (isNaN(maintenanceEnd.getTime())) {
        return res.status(400).json({ error: 'Fecha de fin de mantenimiento inválida' });
      }
      if (maintenanceStart && maintenanceEnd <= maintenanceStart) {
        return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la de inicio' });
      }
    }
  }

  // Validar categoría
  const categoriaFinal = categoria && VALID_CATEGORIES.includes(categoria) ? categoria : 'otro';
  const estadoFinal = estado && VALID_STATUSES.includes(estado) ? estado : 'activa';

  const imageUrlFinal = image_url && String(image_url).trim().length > 0 ? String(image_url).trim() : null;

  try {
    const [result] = await pool.execute(
      'INSERT INTO alerts_new (titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [title.trim(), description.trim(), imageUrlFinal, level, categoriaFinal, estadoFinal, parseFloat(lat), parseFloat(lng), radioFinal, is_maintenance || false, maintenanceStart, maintenanceEnd]
    );
    
    // Obtener la alerta creada para emitirla
    const [newAlert] = await pool.execute(
      'SELECT id, titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end, created_at FROM alerts_new WHERE id = ?',
      [result.insertId]
    );
    
    // Emitir notificación en tiempo real
    if (newAlert.length > 0) {
      const alertData = {
        id: newAlert[0].id,
        title: newAlert[0].titulo,
        description: newAlert[0].descripcion,
        image_url: newAlert[0].image_url || null,
        level: newAlert[0].nivel,
        categoria: newAlert[0].categoria || 'otro',
        estado: newAlert[0].estado || 'activa',
        lat: newAlert[0].lat,
        lng: newAlert[0].lng,
        radius: newAlert[0].radius,
        is_maintenance: newAlert[0].is_maintenance,
        maintenance_start: newAlert[0].maintenance_start,
        maintenance_end: newAlert[0].maintenance_end,
        created_at: newAlert[0].created_at
      };
      emitNewAlert(alertData);
      notificarUsuariosPorZona(alertData).catch((err) => {
        console.error('Error en cola de notificaciones push:', err.message);
      });
    }
    
    res.json({ message: 'Alerta creada correctamente', id: result.insertId });
  } catch (err) {
    console.error('Error al crear alerta:', err.message);
    res.status(500).json({ error: 'Error al crear alerta' });
  }
});

// Editar alerta (solo admin)
app.put('/api/alerts/:id', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, description, image_url, level, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end } = req.body;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  // Validar datos
  if (!title || !description || !level || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  if (title.trim().length === 0 || title.length > 255) {
    return res.status(400).json({ error: 'Título debe tener entre 1 y 255 caracteres' });
  }
  if (!validarNivel(level)) {
    return res.status(400).json({ error: 'Nivel inválido. Debe ser: verde, amarillo o rojo' });
  }
  if (!validarCoordenadas(lat, lng)) {
    return res.status(400).json({ error: 'Coordenadas inválidas' });
  }
  
  if (!validarComunidadValenciana(lat, lng)) {
    return res.status(400).json({ 
      error: 'Las alertas solo pueden crearse dentro de la Comunidad Valenciana' 
    });
  }

  // Validar radio
  let radioFinal = parseInt(radius, 10) || (level === 'rojo' ? 500 : level === 'amarillo' ? 400 : 300);
  if (radioFinal < ALERT_RADIUS_MIN || radioFinal > ALERT_RADIUS_MAX) {
    return res.status(400).json({ error: `El radio debe estar entre ${ALERT_RADIUS_MIN} y ${ALERT_RADIUS_MAX} metros` });
  }

  // Validar fechas de mantenimiento si es una alerta de mantenimiento
  let maintenanceStart = null;
  let maintenanceEnd = null;
  if (is_maintenance) {
    if (maintenance_start) {
      maintenanceStart = new Date(maintenance_start);
      if (isNaN(maintenanceStart.getTime())) {
        return res.status(400).json({ error: 'Fecha de inicio de mantenimiento inválida' });
      }
    }
    if (maintenance_end) {
      maintenanceEnd = new Date(maintenance_end);
      if (isNaN(maintenanceEnd.getTime())) {
        return res.status(400).json({ error: 'Fecha de fin de mantenimiento inválida' });
      }
      if (maintenanceStart && maintenanceEnd <= maintenanceStart) {
        return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la de inicio' });
      }
    }
  }

  // Validar categoría y estado
  const categoriaFinal = categoria && VALID_CATEGORIES.includes(categoria) ? categoria : undefined;
  const estadoFinal = estado && ['activa', 'resuelta', 'en_revision', 'desmentida'].includes(estado) ? estado : undefined;

  const imageUrlFinal = image_url && String(image_url).trim().length > 0 ? String(image_url).trim() : null;

  try {
    let updateQuery = 'UPDATE alerts_new SET titulo = ?, descripcion = ?, image_url = ?, nivel = ?, lat = ?, lng = ?, radius = ?, is_maintenance = ?, maintenance_start = ?, maintenance_end = ?';
    const updateParams = [title.trim(), description.trim(), imageUrlFinal, level, parseFloat(lat), parseFloat(lng), radioFinal, is_maintenance || false, maintenanceStart, maintenanceEnd];
    
    if (categoriaFinal) {
      updateQuery += ', categoria = ?';
      updateParams.push(categoriaFinal);
    }
    if (estadoFinal) {
      updateQuery += ', estado = ?';
      updateParams.push(estadoFinal);
    }
    
    updateQuery += ' WHERE id = ?';
    updateParams.push(id);
    
    const [result] = await pool.execute(updateQuery, updateParams);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    
    // Obtener la alerta actualizada para emitirla
    const [updatedAlert] = await pool.execute(
      'SELECT id, titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end, created_at FROM alerts_new WHERE id = ?',
      [id]
    );
    
    if (updatedAlert.length > 0) {
      const alertData = {
        id: updatedAlert[0].id,
        title: updatedAlert[0].titulo,
        description: updatedAlert[0].descripcion,
        image_url: updatedAlert[0].image_url || null,
        level: updatedAlert[0].nivel,
        categoria: updatedAlert[0].categoria || 'otro',
        estado: updatedAlert[0].estado || 'activa',
        lat: updatedAlert[0].lat,
        lng: updatedAlert[0].lng,
        radius: updatedAlert[0].radius,
        is_maintenance: updatedAlert[0].is_maintenance,
        maintenance_start: updatedAlert[0].maintenance_start,
        maintenance_end: updatedAlert[0].maintenance_end,
        created_at: updatedAlert[0].created_at
      };
      emitUpdatedAlert(alertData);
    }
    
    res.json({ message: 'Alerta actualizada correctamente' });
  } catch (err) {
    console.error('Error al actualizar alerta:', err.message);
    res.status(500).json({ error: 'Error al actualizar alerta' });
  }
});

// Eliminar alerta (solo admin)
app.delete('/api/alerts/:id', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM alerts_new WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    
    // Emitir notificación de eliminación
    emitDeletedAlert(parseInt(id));
    
    res.json({ message: 'Alerta eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar alerta:', err.message);
    res.status(500).json({ error: 'Error al eliminar alerta' });
  }
});

// Obtener una alerta específica con todos sus datos
app.get('/api/alerts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [alertas] = await pool.execute(
      'SELECT id, titulo, descripcion, image_url, nivel, categoria, estado, lat, lng, radius, is_maintenance, maintenance_start, maintenance_end, created_at FROM alerts_new WHERE id = ?',
      [id]
    );

    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    const alerta = alertas[0];

    // Obtener confirmaciones
    const [confirmaciones] = await pool.execute(
      'SELECT COUNT(*) as total FROM alert_confirmations WHERE alert_id = ? AND confirmed = TRUE',
      [id]
    );

    // Obtener comentarios
    const [comentarios] = await pool.execute(
      'SELECT c.id, c.comentario, c.created_at, u.nombre_usuario FROM alert_comments c JOIN users_new u ON c.user_id = u.id WHERE c.alert_id = ? ORDER BY c.created_at DESC',
      [id]
    );

    // Obtener reportes pendientes
    const [reportes] = await pool.execute(
      'SELECT COUNT(*) as total FROM alert_reports WHERE alert_id = ? AND revisado = FALSE',
      [id]
    );

    res.json({
      id: alerta.id,
      title: alerta.titulo,
      description: alerta.descripcion,
      level: alerta.nivel,
      categoria: alerta.categoria || 'otro',
      estado: alerta.estado || 'activa',
      lat: alerta.lat,
      lng: alerta.lng,
      radius: alerta.radius,
      is_maintenance: alerta.is_maintenance,
      maintenance_start: alerta.maintenance_start,
      maintenance_end: alerta.maintenance_end,
      created_at: alerta.created_at,
      confirmaciones: confirmaciones[0].total,
      reportes_pendientes: reportes[0].total,
      comentarios: comentarios.map(c => ({
        id: c.id,
        comentario: c.comentario,
        usuario: c.nombre_usuario,
        created_at: c.created_at
      }))
    });
  } catch (err) {
    console.error('Error al obtener alerta:', err.message);
    res.status(500).json({ error: 'Error al obtener alerta' });
  }
});

// ============================================
// RUTAS DE CONFIRMACIONES Y REPORTES
// ============================================

// Confirmar alerta (solo administradores)
app.post('/api/alerts/:id/confirm', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verificar que la alerta existe
    const [alertas] = await pool.execute('SELECT id FROM alerts_new WHERE id = ?', [id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    // Insertar o actualizar confirmación
    await pool.execute(
      'INSERT INTO alert_confirmations (alert_id, user_id, confirmed) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE confirmed = TRUE',
      [id, userId]
    );

    res.json({ message: 'Alerta confirmada' });
  } catch (err) {
    console.error('Error al confirmar alerta:', err.message);
    res.status(500).json({ error: 'Error al confirmar alerta' });
  }
});

// Reportar alerta (solo administradores)
app.post('/api/alerts/:id/report', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { tipo, motivo } = req.body;

  if (!tipo || !['falsa', 'desactualizada', 'duplicada', 'inapropiada', 'otro'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de reporte inválido' });
  }

  try {
    // Verificar que la alerta existe
    const [alertas] = await pool.execute('SELECT id FROM alerts_new WHERE id = ?', [id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    // Crear reporte
    await pool.execute(
      'INSERT INTO alert_reports (alert_id, user_id, tipo, motivo) VALUES (?, ?, ?, ?)',
      [id, userId, tipo, motivo || '']
    );

    // Emitir notificación de reporte (solo para admins)
    io.to('alerts').emit('alert_reported', { alertId: parseInt(id), tipo, userId });

    res.json({ message: 'Alerta reportada. Los administradores la revisarán.' });
  } catch (err) {
    console.error('Error al reportar alerta:', err.message);
    res.status(500).json({ error: 'Error al reportar alerta' });
  }
});

// Obtener reportes pendientes (solo admin)
app.get('/api/reports', autenticar, soloAdmin, async (req, res) => {
  try {
    const [reportes] = await pool.execute(`
      SELECT r.id, r.tipo, r.motivo, r.created_at, 
             a.id as alert_id, a.titulo as alert_titulo,
             u.nombre_usuario as reportado_por
      FROM alert_reports r
      JOIN alerts_new a ON r.alert_id = a.id
      JOIN users_new u ON r.user_id = u.id
      WHERE r.revisado = FALSE
      ORDER BY r.created_at DESC
    `);

    res.json(reportes);
  } catch (err) {
    console.error('Error al obtener reportes:', err.message);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// Marcar reporte como revisado (solo admin)
app.put('/api/reports/:id/review', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const { accion } = req.body; // 'descartar' o 'desmentir'

  try {
    // Obtener el reporte
    const [reportes] = await pool.execute(
      'SELECT alert_id FROM alert_reports WHERE id = ?',
      [id]
    );

    if (reportes.length === 0) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    const alertId = reportes[0].alert_id;

    // Marcar reporte como revisado
    await pool.execute(
      'UPDATE alert_reports SET revisado = TRUE, revisado_por = ?, revisado_at = NOW() WHERE id = ?',
      [req.user.id, id]
    );

    // Si la acción es desmentir, cambiar el estado de la alerta
    if (accion === 'desmentir') {
      await pool.execute(
        'UPDATE alerts_new SET estado = "desmentida" WHERE id = ?',
        [alertId]
      );
    }

    res.json({ message: 'Reporte revisado correctamente' });
  } catch (err) {
    console.error('Error al revisar reporte:', err.message);
    res.status(500).json({ error: 'Error al revisar reporte' });
  }
});

// ============================================
// RUTAS DE COMENTARIOS
// ============================================

// Agregar comentario a una alerta
app.post('/api/alerts/:id/comments', autenticar, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { comentario } = req.body;

  if (!comentario || comentario.trim().length === 0) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío' });
  }

  try {
    // Verificar que la alerta existe
    const [alertas] = await pool.execute('SELECT id FROM alerts_new WHERE id = ?', [id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    const [result] = await pool.execute(
      'INSERT INTO alert_comments (alert_id, user_id, comentario) VALUES (?, ?, ?)',
      [id, userId, comentario.trim()]
    );

    // Obtener el comentario con usuario
    const [commentData] = await pool.execute(
      'SELECT c.id, c.comentario, c.created_at, u.nombre_usuario FROM alert_comments c JOIN users_new u ON c.user_id = u.id WHERE c.id = ?',
      [result.insertId]
    );

    // Emitir nuevo comentario
    if (commentData.length > 0) {
      io.to('alerts').emit('new_comment', {
        alertId: parseInt(id),
        comment: {
          id: commentData[0].id,
          comentario: commentData[0].comentario,
          usuario: commentData[0].nombre_usuario,
          created_at: commentData[0].created_at
        }
      });
    }

    res.json({ message: 'Comentario agregado', id: result.insertId });
  } catch (err) {
    console.error('Error al agregar comentario:', err.message);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

// Obtener comentarios de una alerta
app.get('/api/alerts/:id/comments', async (req, res) => {
  const { id } = req.params;

  try {
    const [comentarios] = await pool.execute(
      'SELECT c.id, c.comentario, c.created_at, u.nombre_usuario FROM alert_comments c JOIN users_new u ON c.user_id = u.id WHERE c.alert_id = ? ORDER BY c.created_at DESC',
      [id]
    );

    res.json(comentarios.map(c => ({
      id: c.id,
      comentario: c.comentario,
      usuario: c.nombre_usuario,
      created_at: c.created_at
    })));
  } catch (err) {
    console.error('Error al obtener comentarios:', err.message);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

// ============================================
// RUTAS DE SUSCRIPCIONES
// ============================================

// Crear suscripción a zona
app.post('/api/subscriptions', autenticar, async (req, res) => {
  const userId = req.user.id;
  const { nombre_zona, lat, lng, radius } = req.body;

  if (!nombre_zona || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  if (!validarCoordenadas(lat, lng)) {
    return res.status(400).json({ error: 'Coordenadas inválidas' });
  }

  if (!validarComunidadValenciana(lat, lng)) {
    return res.status(400).json({ error: 'La zona debe estar dentro de la Comunidad Valenciana' });
  }

  const radioFinal = parseInt(radius) || 1000;
  if (radioFinal < 100 || radioFinal > 10000) {
    return res.status(400).json({ error: 'El radio debe estar entre 100 y 10000 metros' });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO zone_subscriptions (user_id, nombre_zona, lat, lng, radius) VALUES (?, ?, ?, ?, ?)',
      [userId, nombre_zona.trim(), parseFloat(lat), parseFloat(lng), radioFinal]
    );
    res.json({ message: 'Suscripción creada', id: result.insertId });
  } catch (err) {
    console.error('Error al crear suscripción:', err.message);
    res.status(500).json({ error: 'Error al crear suscripción' });
  }
});

// Obtener suscripciones del usuario
app.get('/api/subscriptions', autenticar, async (req, res) => {
  const userId = req.user.id;

  try {
    // Verificar conexión a la base de datos
    try {
      const conn = await pool.getConnection();
      conn.release();
    } catch (dbErr) {
      console.error('Error de conexión a la base de datos:', dbErr.message);
      return res.status(503).json({ error: 'Servicio no disponible. La base de datos no está conectada.' });
    }

    const [suscripciones] = await pool.execute(
      'SELECT id, nombre_zona, lat, lng, radius, activa, created_at FROM zone_subscriptions WHERE user_id = ? AND activa = TRUE ORDER BY created_at DESC',
      [userId]
    );
    res.json(suscripciones);
  } catch (err) {
    console.error('Error al obtener suscripciones:', err.message);
    console.error('Stack trace:', err.stack);
    console.error('Error completo:', err);
    res.status(500).json({ error: 'Error al obtener suscripciones', details: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor' });
  }
});

// Obtener todas las suscripciones activas (solo admin)
app.get('/api/subscriptions/all', autenticar, soloAdmin, async (req, res) => {
  try {
    const [suscripciones] = await pool.execute(
      `SELECT zs.id, zs.user_id, zs.nombre_zona, zs.lat, zs.lng, zs.radius, zs.activa, zs.created_at,
              u.nombre_usuario AS owner_name, u.email AS owner_email
       FROM zone_subscriptions zs
       JOIN users_new u ON u.id = zs.user_id
       WHERE zs.activa = TRUE
       ORDER BY zs.created_at DESC`
    );
    res.json(suscripciones);
  } catch (err) {
    console.error('Error al obtener suscripciones globales:', err.message);
    res.status(500).json({ error: 'Error al obtener suscripciones globales' });
  }
});

// Eliminar suscripción
app.delete('/api/subscriptions/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';

  try {
    const query = isAdmin
      ? 'UPDATE zone_subscriptions SET activa = FALSE WHERE id = ?'
      : 'UPDATE zone_subscriptions SET activa = FALSE WHERE id = ? AND user_id = ?';
    const params = isAdmin ? [id] : [id, userId];
    const [result] = await pool.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }
    res.json({ message: 'Suscripción eliminada' });
  } catch (err) {
    console.error('Error al eliminar suscripción:', err.message);
    res.status(500).json({ error: 'Error al eliminar suscripción' });
  }
});

// ============================================
// RUTAS DE PREVISIONES METEOROLÓGICAS
// ============================================

const WEATHER_SYNC_HOURS = parseInt(process.env.WEATHER_SYNC_HOURS || '3', 10);
const WEATHER_DEFAULT_LAT = parseFloat(process.env.WEATHER_LAT || '39.4699'); // Valencia
const WEATHER_DEFAULT_LNG = parseFloat(process.env.WEATHER_LNG || '-0.3763');
const WEATHER_SUPPORTED_MUNICIPALITIES = {
  // Valencia
  valencia: { lat: 39.4699, lng: -0.3763, name: 'Valencia' },
  gandia: { lat: 38.9685, lng: -0.1813, name: 'Gandia' },
  torrent: { lat: 39.4371, lng: -0.4655, name: 'Torrent' },
  paterna: { lat: 39.5020, lng: -0.4406, name: 'Paterna' },
  sagunto: { lat: 39.6794, lng: -0.2733, name: 'Sagunto' },
  'sagunt': { lat: 39.6794, lng: -0.2733, name: 'Sagunto' },
  xativa: { lat: 38.9904, lng: -0.5161, name: 'Xàtiva' },
  'xativa_acentuada': { lat: 38.9904, lng: -0.5161, name: 'Xàtiva' },
  ontinyent: { lat: 38.8210, lng: -0.6064, name: 'Ontinyent' },
  alzira: { lat: 39.1516, lng: -0.4417, name: 'Alzira' },
  cullera: { lat: 39.1652, lng: -0.2527, name: 'Cullera' },
  sueca: { lat: 39.2026, lng: -0.3111, name: 'Sueca' },
  paiporta: { lat: 39.4282, lng: -0.4177, name: 'Paiporta' },
  benetusser: { lat: 39.4248, lng: -0.3978, name: 'Benetússer' },
  mislata: { lat: 39.4765, lng: -0.4195, name: 'Mislata' },

  // Alicante
  alicante: { lat: 38.3452, lng: -0.4810, name: 'Alicante' },
  'alacant': { lat: 38.3452, lng: -0.4810, name: 'Alicante' },
  elche: { lat: 38.2699, lng: -0.7126, name: 'Elche' },
  'elx': { lat: 38.2699, lng: -0.7126, name: 'Elche' },
  benidorm: { lat: 38.5411, lng: -0.1225, name: 'Benidorm' },
  torrevieja: { lat: 37.9779, lng: -0.6830, name: 'Torrevieja' },
  denia: { lat: 38.8408, lng: 0.1057, name: 'Dénia' },
  denia_sin_tilde: { lat: 38.8408, lng: 0.1057, name: 'Dénia' },
  alcoy: { lat: 38.6969, lng: -0.4732, name: 'Alcoy' },
  'alcoi': { lat: 38.6969, lng: -0.4732, name: 'Alcoy' },
  villena: { lat: 38.6370, lng: -0.8657, name: 'Villena' },
  novelda: { lat: 38.3848, lng: -0.7677, name: 'Novelda' },
  calpe: { lat: 38.6447, lng: 0.0445, name: 'Calpe' },
  javea: { lat: 38.7893, lng: 0.1661, name: 'Jávea' },
  'xabia': { lat: 38.7893, lng: 0.1661, name: 'Jávea' },
  orihuela: { lat: 38.0848, lng: -0.9440, name: 'Orihuela' },

  // Castellón
  castellon: { lat: 39.9864, lng: -0.0513, name: 'Castellón de la Plana' },
  'castello': { lat: 39.9864, lng: -0.0513, name: 'Castellón de la Plana' },
  vila_real: { lat: 39.9382, lng: -0.1009, name: 'Vila-real' },
  'villarreal': { lat: 39.9382, lng: -0.1009, name: 'Vila-real' },
  burriana: { lat: 39.8890, lng: -0.0836, name: 'Burriana' },
  vinaros: { lat: 40.4703, lng: 0.4746, name: 'Vinaròs' },
  vinaros_sin_tilde: { lat: 40.4703, lng: 0.4746, name: 'Vinaròs' },
  benicarlo: { lat: 40.4184, lng: 0.4231, name: 'Benicarló' },
  benicarlo_sin_tilde: { lat: 40.4184, lng: 0.4231, name: 'Benicarló' },
  peniscola: { lat: 40.3573, lng: 0.4069, name: 'Peñíscola' },
  'peniscola_sin_tilde': { lat: 40.3573, lng: 0.4069, name: 'Peñíscola' },
  la_vall_duixo: { lat: 39.8242, lng: -0.2326, name: "La Vall d'Uixó" }
};

/** Fecha local YYYY-MM-DD (evita desfases UTC al filtrar semanas en consultas SQL). */
function formatLocalDateYYYYMMDD(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weatherCodeToIcon(code) {
  if ([0].includes(code)) return 'soleado';
  if ([1, 2].includes(code)) return 'parcialmente_nublado';
  if ([3, 45, 48].includes(code)) return 'nublado';
  if ([51, 53, 55, 56, 57, 61, 63, 80].includes(code)) return 'lluvia_ligera';
  if ([65, 81, 82].includes(code)) return 'lluvia';
  if ([95, 96, 99].includes(code)) return 'tormenta';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'nieve';
  return 'nublado';
}

function degreesToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return dirs[index];
}

async function fetchOpenMeteoDailyForecast(lat, lng) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch no está disponible en este entorno de Node');
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    timezone: 'Europe/Madrid',
    daily: [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'windspeed_10m_max',
      'winddirection_10m_dominant'
    ].join(',')
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo respondió HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data?.daily?.time || !Array.isArray(data.daily.time)) {
    throw new Error('Respuesta de Open-Meteo sin bloque daily válido');
  }

  return data.daily;
}

function buildWeatherRowsFromDaily(daily) {
  const rows = [];
  for (let i = 0; i < daily.time.length; i += 1) {
    const fecha = daily.time[i];
    const tempMax = daily.temperature_2m_max?.[i] ?? null;
    const tempMin = daily.temperature_2m_min?.[i] ?? null;
    const probPrecip = daily.precipitation_probability_max?.[i] ?? 0;
    const windSpeed = daily.windspeed_10m_max?.[i] ?? 0;
    const windDirectionDeg = daily.winddirection_10m_dominant?.[i] ?? 0;
    const weatherCode = daily.weathercode?.[i] ?? 3;
    rows.push({
      fecha,
      hora_inicio: '00:00:00',
      hora_fin: '23:59:59',
      temperatura: tempMax !== null && tempMin !== null ? (tempMax + tempMin) / 2 : null,
      probabilidad_precipitacion: probPrecip,
      cota_nieve: null,
      direccion_viento: degreesToCardinal(windDirectionDeg),
      velocidad_viento: Math.round(windSpeed),
      icono_tiempo: weatherCodeToIcon(weatherCode),
      temp_minima: tempMin,
      temp_maxima: tempMax
    });
  }
  return rows;
}

async function upsertWeatherFromProvider() {
  const daily = await fetchOpenMeteoDailyForecast(WEATHER_DEFAULT_LAT, WEATHER_DEFAULT_LNG);
  const rows = buildWeatherRowsFromDaily(daily);

  for (const row of rows) {
    await pool.execute(
      `INSERT INTO weather_forecast
       (fecha, hora_inicio, hora_fin, temperatura, probabilidad_precipitacion, cota_nieve, direccion_viento, velocidad_viento, icono_tiempo, temp_minima, temp_maxima)
       VALUES (?, '00:00:00', '23:59:59', ?, ?, NULL, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       temperatura = VALUES(temperatura),
       probabilidad_precipitacion = VALUES(probabilidad_precipitacion),
       direccion_viento = VALUES(direccion_viento),
       velocidad_viento = VALUES(velocidad_viento),
       icono_tiempo = VALUES(icono_tiempo),
       temp_minima = VALUES(temp_minima),
       temp_maxima = VALUES(temp_maxima),
       updated_at = CURRENT_TIMESTAMP`,
      [
        row.fecha,
        row.temperatura,
        row.probabilidad_precipitacion,
        row.direccion_viento,
        row.velocidad_viento,
        row.icono_tiempo,
        row.temp_minima,
        row.temp_maxima
      ]
    );
  }
}

async function syncWeatherIfNeeded({ force = false } = {}) {
  const [rows] = await pool.execute(
    `SELECT
        COUNT(*) AS total,
        MAX(updated_at) AS last_update,
        SUM(CASE WHEN fecha >= CURDATE() THEN 1 ELSE 0 END) AS future_rows
     FROM weather_forecast`
  );
  const info = rows[0] || {};
  const total = Number(info.total || 0);
  const futureRows = Number(info.future_rows || 0);
  const lastUpdate = info.last_update ? new Date(info.last_update) : null;
  const tooOld = !lastUpdate || ((Date.now() - lastUpdate.getTime()) > WEATHER_SYNC_HOURS * 60 * 60 * 1000);
  const shouldSync = force || total === 0 || futureRows < 5 || tooOld;

  if (!shouldSync) {
    return { synced: false, reason: 'fresh_cache' };
  }

  await upsertWeatherFromProvider();
  return { synced: true, reason: force ? 'forced' : 'stale_or_empty' };
}

// Obtener todas las previsiones meteorológicas
app.get('/api/weather', async (req, res) => {
  try {
    await syncWeatherIfNeeded();
    const [previsiones] = await pool.execute(
      'SELECT * FROM weather_forecast ORDER BY fecha ASC, hora_inicio ASC'
    );
    res.json(previsiones);
  } catch (err) {
    console.error('Error al obtener previsiones:', err.message);
    res.status(500).json({ error: 'Error al obtener previsiones meteorológicas' });
  }
});

// Obtener previsiones meteorológicas de la semana completa
// Query params opcionales:
// - week=current|all (por defecto: all)
// - start_date=YYYY-MM-DD (opcional, se usa para calcular la semana en modo current)
app.get('/api/weather/weekdays', async (req, res) => {
  try {
    const weekMode = String(req.query.week || 'all').toLowerCase();
    const startDateRaw = req.query.start_date;
    const municipalityRaw = String(req.query.municipality || '').trim().toLowerCase();
    const latQuery = req.query.lat !== undefined ? parseFloat(req.query.lat) : null;
    const lngQuery = req.query.lng !== undefined ? parseFloat(req.query.lng) : null;
    const baseDate = startDateRaw ? new Date(startDateRaw) : new Date();

    if (startDateRaw && Number.isNaN(baseDate.getTime())) {
      return res.status(400).json({ error: 'start_date inválida. Usa formato YYYY-MM-DD' });
    }

    const municipality = municipalityRaw ? WEATHER_SUPPORTED_MUNICIPALITIES[municipalityRaw] : null;
    const hasCoords = Number.isFinite(latQuery) && Number.isFinite(lngQuery);
    const useDynamicLocation = Boolean(municipality || hasCoords);
    let weatherRows = [];

    if (useDynamicLocation) {
      let targetLat = WEATHER_DEFAULT_LAT;
      let targetLng = WEATHER_DEFAULT_LNG;

      if (municipality) {
        targetLat = municipality.lat;
        targetLng = municipality.lng;
      } else if (hasCoords) {
        targetLat = latQuery;
        targetLng = lngQuery;
      }

      if (!validarCoordenadas(targetLat, targetLng)) {
        return res.status(400).json({ error: 'lat/lng inválidos para la consulta meteorológica' });
      }
      if (!validarComunidadValenciana(targetLat, targetLng)) {
        return res.status(400).json({ error: 'La consulta meteorológica debe estar dentro de la Comunidad Valenciana' });
      }

      const daily = await fetchOpenMeteoDailyForecast(targetLat, targetLng);
      weatherRows = buildWeatherRowsFromDaily(daily);
    } else {
      await syncWeatherIfNeeded();
    }

    let query = `
      SELECT *
      FROM weather_forecast
      WHERE 1=1
    `;
    const params = [];

    if (weekMode === 'current') {
      // Lunes de la semana actual (en función de baseDate)
      const day = baseDate.getDay(); // 0=Domingo, 1=Lunes...
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(baseDate);
      monday.setDate(baseDate.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      // Usar fecha local para evitar desplazamientos por UTC (que vaciaban el domingo)
      const mondayStr = formatLocalDateYYYYMMDD(monday);
      const sundayStr = formatLocalDateYYYYMMDD(sunday);

      query += ' AND fecha BETWEEN ? AND ?';
      params.push(mondayStr, sundayStr);
    } else if (weekMode !== 'all') {
      return res.status(400).json({ error: 'Parámetro week inválido. Usa "current" o "all".' });
    }

    query += ' ORDER BY fecha ASC, hora_inicio ASC';

    let previsiones = [];
    if (useDynamicLocation) {
      const byDateRange = weatherRows.filter((item) => {
        if (params.length !== 2) return true;
        return item.fecha >= params[0] && item.fecha <= params[1];
      });
      previsiones = byDateRange.sort((a, b) => {
        const byDate = String(a.fecha).localeCompare(String(b.fecha));
        if (byDate !== 0) return byDate;
        return String(a.hora_inicio).localeCompare(String(b.hora_inicio));
      });
    } else {
      const [rows] = await pool.execute(query, params);
      previsiones = rows;
    }

    res.json(previsiones);
  } catch (err) {
    console.error('Error al obtener previsiones de lunes a viernes:', err.message);
    res.status(500).json({ error: 'Error al obtener previsiones de lunes a viernes' });
  }
});

// Obtener municipios soportados para selector frontend
app.get('/api/weather/municipalities', async (_req, res) => {
  try {
    const uniqueByName = new Map();
    Object.entries(WEATHER_SUPPORTED_MUNICIPALITIES).forEach(([key, item]) => {
      if (!item?.name || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
      if (!uniqueByName.has(item.name)) {
        uniqueByName.set(item.name, {
          value: key,
          label: item.name,
          lat: item.lat,
          lng: item.lng
        });
      }
    });

    const municipalities = Array.from(uniqueByName.values())
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));

    res.json({
      total: municipalities.length,
      municipalities
    });
  } catch (err) {
    console.error('Error al obtener municipios meteorológicos:', err.message);
    res.status(500).json({ error: 'Error al obtener municipios meteorológicos' });
  }
});

// Forzar sincronización meteorológica en tiempo real (opcional para admin)
app.post('/api/weather/refresh', autenticar, soloAdmin, async (req, res) => {
  try {
    const result = await syncWeatherIfNeeded({ force: true });
    res.json({ message: 'Sincronización meteorológica completada', ...result });
  } catch (err) {
    console.error('Error al sincronizar previsiones meteorológicas:', err.message);
    res.status(500).json({ error: 'Error al sincronizar previsiones meteorológicas' });
  }
});

// Crear o actualizar previsión meteorológica (solo admin)
app.post('/api/weather', autenticar, soloAdmin, async (req, res) => {
  const { fecha, hora_inicio, hora_fin, temperatura, probabilidad_precipitacion, cota_nieve, direccion_viento, velocidad_viento, icono_tiempo, temp_minima, temp_maxima } = req.body;

  if (!fecha || !hora_inicio || !hora_fin) {
    return res.status(400).json({ error: 'Faltan datos requeridos (fecha, hora_inicio, hora_fin)' });
  }

  try {
    // Intentar insertar, si ya existe actualizar
    await pool.execute(
      `INSERT INTO weather_forecast 
       (fecha, hora_inicio, hora_fin, temperatura, probabilidad_precipitacion, cota_nieve, direccion_viento, velocidad_viento, icono_tiempo, temp_minima, temp_maxima)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       temperatura = VALUES(temperatura),
       probabilidad_precipitacion = VALUES(probabilidad_precipitacion),
       cota_nieve = VALUES(cota_nieve),
       direccion_viento = VALUES(direccion_viento),
       velocidad_viento = VALUES(velocidad_viento),
       icono_tiempo = VALUES(icono_tiempo),
       temp_minima = VALUES(temp_minima),
       temp_maxima = VALUES(temp_maxima),
       updated_at = CURRENT_TIMESTAMP`,
      [fecha, hora_inicio, hora_fin, temperatura || null, probabilidad_precipitacion || 0, cota_nieve || null, direccion_viento || null, velocidad_viento || 0, icono_tiempo || 'soleado', temp_minima || null, temp_maxima || null]
    );
    res.json({ message: 'Previsión meteorológica guardada correctamente' });
  } catch (err) {
    console.error('Error al guardar previsión:', err.message);
    res.status(500).json({ error: 'Error al guardar previsión meteorológica' });
  }
});

// Actualizar previsión meteorológica (solo admin)
app.put('/api/weather/:id', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;
  const { fecha, hora_inicio, hora_fin, temperatura, probabilidad_precipitacion, cota_nieve, direccion_viento, velocidad_viento, icono_tiempo, temp_minima, temp_maxima } = req.body;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE weather_forecast SET
       fecha = ?, hora_inicio = ?, hora_fin = ?, temperatura = ?, 
       probabilidad_precipitacion = ?, cota_nieve = ?, direccion_viento = ?, 
       velocidad_viento = ?, icono_tiempo = ?, temp_minima = ?, temp_maxima = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fecha, hora_inicio, hora_fin, temperatura || null, probabilidad_precipitacion || 0, cota_nieve || null, direccion_viento || null, velocidad_viento || 0, icono_tiempo || 'soleado', temp_minima || null, temp_maxima || null, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Previsión no encontrada' });
    }
    
    res.json({ message: 'Previsión actualizada correctamente' });
  } catch (err) {
    console.error('Error al actualizar previsión:', err.message);
    res.status(500).json({ error: 'Error al actualizar previsión meteorológica' });
  }
});

// Eliminar previsión meteorológica (solo admin)
app.delete('/api/weather/:id', autenticar, soloAdmin, async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM weather_forecast WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Previsión no encontrada' });
    }
    res.json({ message: 'Previsión eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar previsión:', err.message);
    res.status(500).json({ error: 'Error al eliminar previsión meteorológica' });
  }
});

// ============================================
// RUTAS DE ESTADÍSTICAS
// ============================================

// Obtener estadísticas generales
app.get('/api/stats', async (req, res) => {
  try {
    // Total de alertas por nivel
    const [porNivel] = await pool.execute(
      'SELECT nivel, COUNT(*) as total FROM alerts_new WHERE estado = "activa" GROUP BY nivel'
    );

    // Total de alertas por categoría
    const [porCategoria] = await pool.execute(
      'SELECT categoria, COUNT(*) as total FROM alerts_new WHERE estado = "activa" GROUP BY categoria'
    );

    // Total de alertas activas
    const [totalActivas] = await pool.execute(
      'SELECT COUNT(*) as total FROM alerts_new WHERE estado = "activa"'
    );

    // Total de confirmaciones
    const [totalConfirmaciones] = await pool.execute(
      'SELECT COUNT(*) as total FROM alert_confirmations WHERE confirmed = TRUE'
    );

    // Reportes pendientes
    const [reportesPendientes] = await pool.execute(
      'SELECT COUNT(*) as total FROM alert_reports WHERE revisado = FALSE'
    );

    res.json({
      por_nivel: porNivel,
      por_categoria: porCategoria,
      total_activas: totalActivas[0].total,
      total_confirmaciones: totalConfirmaciones[0].total,
      reportes_pendientes: reportesPendientes[0].total
    });
  } catch (err) {
    console.error('Error al obtener estadísticas:', err.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ============================================
// RUTAS DE DEBUG (solo desarrollo)
// ============================================

app.get('/', (req, res) => {
  res.send('🚀 API de Alertas funcionando correctamente');
});

app.get('/api/debug/tables', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Endpoint no disponible en producción' });
  }

  try {
    const [tablas] = await pool.execute('SHOW TABLES LIKE "%_new"');
    const nombresTablas = tablas.map(t => Object.values(t)[0]);

    const datos = {};
    for (const nombreTabla of nombresTablas) {
      const [filas] = await pool.execute(`SELECT * FROM ${nombreTabla}`);
      // Ocultar password_hash de usuarios y mapear nombres
      if (nombreTabla === 'users_new') {
        datos[nombreTabla] = filas.map(u => ({
          id: u.id,
          nombre_usuario: u.nombre_usuario,
          username: u.nombre_usuario, // Compatibilidad
          email: u.email,
          role: u.role,
          created_at: u.created_at
        }));
      } else if (nombreTabla === 'alerts_new') {
        datos[nombreTabla] = filas.map(a => ({
          id: a.id,
          titulo: a.titulo,
          title: a.titulo, // Compatibilidad
          descripcion: a.descripcion,
          description: a.descripcion, // Compatibilidad
          nivel: a.nivel,
          level: a.nivel, // Compatibilidad
          lat: a.lat,
          lng: a.lng,
          radius: a.radius,
          is_maintenance: a.is_maintenance,
          maintenance_start: a.maintenance_start,
          maintenance_end: a.maintenance_end,
          created_at: a.created_at
        }));
      } else {
        datos[nombreTabla] = filas;
      }
    }

    res.json({ tables: nombresTablas, data: datos });
  } catch (err) {
    console.error('Error al obtener tablas:', err.message);
    res.status(500).json({ error: 'Error al obtener tablas' });
  }
});

// ============================================
// CONFIGURACIÓN DEL FRONTEND
// ============================================

const rutasFrontend = [
  path.join(__dirname, '../alertas-frontend/build'),
  path.join(__dirname, 'alertas-frontend/build'),
  path.join(__dirname, '../frontend/build'),
  path.join(__dirname, 'frontend/build')
];

let rutaFrontend = null;
for (const ruta of rutasFrontend) {
  if (fs.existsSync(ruta) && fs.existsSync(path.join(ruta, 'index.html'))) {
    rutaFrontend = ruta;
    console.log(`Frontend encontrado en: ${rutaFrontend}`);
    break;
  }
}

if (rutaFrontend) {
  app.use(express.static(rutaFrontend));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(rutaFrontend, 'index.html'));
  });
} else {
  console.log('Frontend no encontrado. Ejecuta: npm run build en la carpeta del frontend');
  app.get('*', (req, res) => {
    res.send(`
      <html>
        <head><title>Alertas Backend</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>🚀 Backend funcionando correctamente</h1>
          <p>El frontend no está disponible.</p>
          <p><strong>Endpoints disponibles:</strong></p>
          <ul>
            <li><a href="/api/debug/tables">/api/debug/tables</a> - Ver tablas</li>
            <li><a href="/api/alerts">/api/alerts</a> - Obtener alertas</li>
          </ul>
        </body>
      </html>
    `);
  });
}

// ============================================
// NOTIFICACIONES (SIN WEBSOCKETS - USAR POLLING)
// ============================================

// Funciones de notificación vacías (el frontend usará polling)
function emitNewAlert(_alert) {
  // Sin WebSockets - el frontend recargará automáticamente
}

function emitUpdatedAlert(_alert) {
  // Sin WebSockets - el frontend recargará automáticamente
}

function emitDeletedAlert(_alertId) {
  // Sin WebSockets - el frontend recargará automáticamente
}

// ============================================
// INICIAR SERVIDOR
// ============================================

const puerto = process.env.PORT || 4000;
app.listen(puerto, () => {
  console.log(`Servidor escuchando en http://localhost:${puerto}`);
  console.log(`Endpoints:`);
  console.log(`   POST /api/register - Registrar usuario`);
  console.log(`   POST /api/login - Login`);
  console.log(`   GET  /api/alerts - Obtener alertas`);
  console.log(`   POST /api/alerts - Crear alerta (admin)`);
  console.log(`   PUT  /api/alerts/:id - Editar alerta (admin)`);
  console.log(`   DELETE /api/alerts/:id - Eliminar alerta (admin)`);
});
