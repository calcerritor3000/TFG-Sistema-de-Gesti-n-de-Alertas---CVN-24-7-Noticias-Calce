# Desplegar Alertas CVN en internet

Guía para sacar MySQL del PC y publicar el proyecto. El backend ya crea las tablas solo al arrancar (`inicializarBaseDatos`).

## Arquitectura recomendada

| Pieza | Dónde | Notas |
|-------|--------|--------|
| **MySQL** | Servicio en la nube | Railway, Aiven, PlanetScale, etc. |
| **Backend + frontend** | Mismo servidor Node | Express sirve el `build` de React |
| **Imágenes** | Carpeta `uploads/` en el servidor | En Render/Railway usa disco persistente o S3 más adelante |

Opción más sencilla para un TFG: **Render** (API + React) + **Aiven** (MySQL). Guía detallada: **[RENDER.md](./RENDER.md)**.

---

## Paso 1 — Crear MySQL en la nube

### Opción A: Railway (recomendada, todo junto)

1. Cuenta en [https://railway.app](https://railway.app)
2. **New Project** → **Provision MySQL**
3. Abre el servicio MySQL → pestaña **Variables** o **Connect**
4. Anota: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` (o equivalentes)

### Opción B: Aiven (solo base de datos)

1. [https://aiven.io](https://aiven.io) → servicio **MySQL** (plan free/trial)
2. Crea la base y usuario
3. En **Connection information** copia host, puerto, usuario, contraseña y nombre de BD
4. Activa acceso desde cualquier IP si el panel lo permite (o añade la IP de tu hosting)

### Opción C: Otro proveedor

Cualquier MySQL 8.x compatible sirve. Necesitas:

- Host público (no `127.0.0.1`)
- Puerto (suele ser `3306`)
- Usuario, contraseña y nombre de base de datos
- SSL: en la mayoría `DB_SSL=true` en el `.env`

---

## Paso 2 — Variables de entorno en producción

Copia `.env.example` a `.env` en el servidor (o configúralas en el panel del hosting).

Ejemplo con MySQL en Railway:

```env
PORT=4000
JWT_SECRET=un_secreto_muy_largo_y_unico_minimo_32_caracteres

DB_HOST=containers-us-west-xxx.railway.app
DB_PORT=3306
DB_USER=root
DB_PASSWORD=la_contraseña_del_panel
DB_NAME=railway
DB_SSL=true

FRONTEND_URL=https://tu-app.up.railway.app
API_PUBLIC_URL=https://tu-app.up.railway.app

ADMIN_DEFAULT_PASSWORD=cambia_esto_en_produccion
```

**Importante:** genera un `JWT_SECRET` nuevo para producción (no reutilices el de tu PC).

---

## Paso 3 — Migrar datos desde tu PC (opcional)

Si ya tienes alertas y usuarios en local:

```bash
# En tu PC, con MySQL local corriendo
mysqldump -u root -p alertas_db > backup_alertas.sql
```

En el MySQL de la nube (cliente web del proveedor o `mysql` CLI):

```bash
mysql -h HOST_REMOTO -P 3306 -u USUARIO -p NOMBRE_BD < backup_alertas.sql
```

Si empiezas de cero, **no hace falta dump**: al arrancar el servidor se crean tablas y el usuario `admin` por defecto.

---

## Paso 4 — Subir el código

1. Repositorio en **GitHub** (sin `.env`, sin `node_modules`)
2. En Railway/Render: **Deploy from GitHub** → carpeta raíz del repo (`AlertasBackend`)

### Build del frontend en el deploy

En Railway, variables de build:

```env
REACT_APP_API_URL=
```

(Vacío = el navegador llama al mismo dominio `/api/...`.)

Comando de build sugerido:

```bash
cd alertas-frontend && npm ci && npm run build && cd .. && npm ci
```

Comando de arranque:

```bash
npm start
```

También puedes construir en tu PC antes de subir:

```bash
cd alertas-frontend
npm run build
cd ..
```

El `app.js` busca `alertas-frontend/build` y sirve la web desde el mismo puerto que el API.

---

## Paso 5 — Comprobar que funciona

1. Logs del servidor: `Conexión a MySQL correcta` y `Tabla users_new lista`
2. Abre la URL pública → pantalla de login
3. Entra con `admin` / contraseña del `.env` (o la que migraste)
4. Crea una alerta de prueba

---

## Desarrollo local vs producción

| Entorno | `alertas-frontend/.env` |
|---------|-------------------------|
| Local | `REACT_APP_API_URL=http://localhost:4000` |
| Producción (mismo dominio) | `REACT_APP_API_URL=` (vacío) o no definir |

---

## Problemas frecuentes

**`ECONNREFUSED` o timeout a MySQL**  
- Host/puerto incorrectos  
- Firewall del proveedor: permite conexiones desde el hosting  
- Prueba `DB_SSL=true`

**CORS / no carga el login**  
- `FRONTEND_URL` debe ser exactamente la URL del navegador (con `https://`)

**Las imágenes desaparecen al redesplegar**  
- En PaaS el disco es efímero; para producción seria conviene almacenamiento externo (S3, Cloudinary). De momento las imágenes viven en `uploads/alerts/`.

**Certificado SSL de la base de datos**  
- Prueba `DB_SSL_REJECT_UNAUTHORIZED=false` solo si el proveedor lo indica.

---

## Resumen rápido

1. Crear MySQL en Railway o Aiven  
2. Poner credenciales en variables de entorno (`DB_*`, `JWT_SECRET`)  
3. `DB_SSL=true` si el proveedor lo exige  
4. Desplegar Node desde GitHub con `npm run build` en el frontend  
5. Abrir la URL y verificar login + mapa  

Si me dices qué servicio prefieres (Railway, Render, VPS propio), puedo dejarte los clics exactos para ese panel.
