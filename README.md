# CVN 24/7 — Sistema de Gestión de Alertas

Aplicación web para la **Comunidad Valenciana** que centraliza alertas ciudadanas (incendios, inundaciones, meteorología, obras, etc.) con mapa interactivo, noticias, previsión meteorológica y panel de administración.

**TFG** — Backend monolítico (Node.js + Express) + frontend React servido desde el mismo servidor en producción.

**Producción:** [https://cvnalertas.onrender.com](https://cvnalertas.onrender.com)

---

## Características

- **Mapa** con alertas geolocalizadas (Leaflet / OpenStreetMap)
- **Noticias** — listado de alertas activas con filtros por categoría
- **Tiempo** — previsión semanal (Open-Meteo + caché en MySQL)
- **Roles** — usuario y administrador (crear/editar/eliminar alertas)
- **PWA** — service worker para uso parcial sin conexión
- **Notificaciones push** (opcional, VAPID)
- **Base de datos** MySQL con tablas `*_new`

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 18+, Express, JWT, bcrypt |
| Base de datos | MySQL (XAMPP local / Aiven en producción) |
| Frontend | React, React Router, Leaflet |
| Despliegue | Render (Web Service) + Aiven (MySQL) |

---

## Estructura del proyecto

```
AlertasBackend/
├── app.js                 # API REST + servidor estático del React build
├── alertas-frontend/      # Aplicación React (mapa, login, noticias, tiempo)
├── scripts/               # SQL Aiven, importación de datos, utilidades
├── uploads/alerts/        # Imágenes de alertas (rutas en BD)
├── render.yaml            # Blueprint Render
├── RENDER.md              # Guía de despliegue paso a paso
└── .env.example           # Plantilla de variables (copiar a .env)
```

---

## Requisitos

- **Node.js** ≥ 18
- **MySQL** (XAMPP u otro)
- **npm**

---

## Instalación en local

### 1. Clonar e instalar dependencias

```powershell
git clone https://github.com/calcerritor3000/TFG-Sistema-de-Gesti-n-de-Alertas---CVN-24-7-Noticias-Calce.git
cd AlertasBackend
npm install
cd alertas-frontend
npm install
cd ..
```

### 2. Base de datos (XAMPP)

1. Crea la base `alertas_db` en phpMyAdmin.
2. Importa `scripts/alertas_db-completo.sql` (esquema + datos de ejemplo).

### 3. Variables de entorno

```powershell
copy .env.example .env
```

Edita `.env` con tu MySQL local:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=alertas_db
JWT_SECRET=un_secreto_largo_y_aleatorio
```

### 4. Arrancar en desarrollo

**Terminal 1 — Backend:**

```powershell
npm run dev
```

**Terminal 2 — Frontend (hot reload):**

```powershell
cd alertas-frontend
npm start
```

- Frontend: http://localhost:3000  
- API: http://localhost:4000  

### 5. Usuario por defecto (local)

| Usuario | Contraseña |
|---------|------------|
| `admin` | `admin123` |

---

## Producción (Render + Aiven)

1. MySQL en [Aiven](https://aiven.io) — importa `scripts/schema-aiven.sql` y datos (`scripts/AIVEN-IMPORTAR.md`).
2. Web Service en [Render](https://render.com) conectado a este repo.
3. Variables obligatorias: `DB_*`, `DB_SSL=true`, `JWT_SECRET`, `ADMIN_DEFAULT_PASSWORD`, `FRONTEND_URL`, `API_PUBLIC_URL`.

Guía detallada: **[RENDER.md](RENDER.md)**

**Build en Render:** `npm install && npm run build`  
**Start:** `npm start`

---

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm start` | Arranca el servidor (producción) |
| `npm run dev` | Backend con nodemon |
| `npm run build` | Compila React a `alertas-frontend/build` |
| `npm run sync:assets` | Copia imágenes de alertas a `public/` |

---

## API principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/login` | Inicio de sesión |
| `POST` | `/api/register` | Registro |
| `GET` | `/api/alerts` | Listar alertas |
| `POST` | `/api/alerts` | Crear alerta (admin) |
| `GET` | `/api/weather/weekdays` | Previsión meteorológica |
| `GET` | `/api/health` | Estado del API |

---

## Imágenes y logo

- **Logo:** `alertas-frontend/public/CVN_Noticias.png`
- **Fotos de alertas:** `uploads/alerts/` (la BD guarda solo la ruta `/uploads/alerts/...`)

Más información: **[scripts/IMAGENES.md](scripts/IMAGENES.md)**

---

## Solución de problemas frecuentes

| Problema | Qué revisar |
|----------|-------------|
| `ENOTFOUND` en logs | `DB_HOST` en Render no coincide con Aiven → copia el host actual en Connection information |
| Login falla en producción | Contraseña = `ADMIN_DEFAULT_PASSWORD` en Render (usuario `admin`) |
| Plan free lento | Render “despierta” en 30–60 s la primera petición |
| Error SSL MySQL | `DB_SSL=true` en Render (ya configurado en código) |

---

## Licencia y autor

Proyecto académico (TFG). CVN 24/7 Noticias — Sistema de Gestión de Alertas.
