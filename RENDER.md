# Desplegar en Render (paso a paso)

Tu app = **Node (Express)** + **React** + **MySQL**.  
Render aloja el servidor; la base de datos MySQL va en **otro sitio** (Render solo ofrece PostgreSQL nativo).

---

## Resumen en 4 pasos

1. MySQL en la nube (Aiven trial o MySQL de Railway solo para BD).
2. Código en GitHub (sin `.env`, sin `node_modules`).
3. Web Service en Render conectado al repo.
4. Variables de entorno en Render (BD + JWT + URLs).

---

## Paso 1 — MySQL en la nube

Elige **una** opción:

### Aiven (recomendado si no quieres pagar Railway)

1. [https://aiven.io](https://aiven.io) → registro.
2. **Create service** → **MySQL**.
3. Plan free/trial si aparece.
4. Copia en **Connection info**:
   - Host
   - Port
   - User
   - Password
   - Database name
5. Activa conexiones desde **cualquier IP** (o 0.0.0.0/0) para que Render pueda entrar.

### Railway solo para la base (alternativa)

1. Proyecto nuevo → **MySQL** (usa el trial de $5).
2. Copia variables `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`.

### Migrar datos desde tu PC (opcional)

Aiven **no acepta tablas sin PRIMARY KEY**. Lee **`scripts/AIVEN-IMPORTAR.md`**.

Lo más fiable:

1. En Aiven (base vacía), ejecuta **`scripts/schema-aiven.sql`**.
2. Conecta Render con `DB_*` y `DB_SSL=true`.
3. Arranca la app (crea `admin` en desarrollo).

Si importas un dump de XAMPP y falla, antes en local ejecuta **`scripts/fix-missing-primary-keys.sql`** y vuelve a exportar.

---

## Paso 2 — Subir el código a GitHub

En la carpeta del proyecto (sin subir secretos):

```powershell
git add .
git commit -m "Preparar despliegue Render"
git push origin main
```

Comprueba que **no** estén en el repo: `.env`, `node_modules`, `uploads/` con datos privados.

---

## Paso 3 — Crear el Web Service en Render

1. [https://dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**.
2. Conecta tu cuenta de **GitHub** y elige el repo `AlertasBackend`.
3. Configuración:

| Campo | Valor |
|--------|--------|
| **Name** | `alertas-cvn` (o el que quieras) |
| **Region** | Frankfurt o la más cercana |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance type** | Free |

4. **Advanced** → Health Check Path: `/api/alerts` (opcional).

También puedes usar el archivo `render.yaml` del repo: **New +** → **Blueprint** y seleccionar el repo.

---

## Paso 4 — Variables de entorno en Render

En el servicio → **Environment** → añade:

| Variable | Valor | Obligatorio |
|----------|--------|-------------|
| `JWT_SECRET` | Cadena larga aleatoria (32+ caracteres) | Sí |
| `DB_HOST` | Host del MySQL (Aiven/Railway) | Sí |
| `DB_PORT` | `3306` | Sí |
| `DB_USER` | Usuario MySQL | Sí |
| `DB_PASSWORD` | Contraseña | Sí |
| `DB_NAME` | Nombre de la base | Sí |
| `DB_SSL` | `true` | Sí (casi siempre en la nube) |
| `FRONTEND_URL` | `https://alertascvn.onrender.com` (tu URL exacta de Render) | Sí |
| `API_PUBLIC_URL` | Igual que `FRONTEND_URL` | Sí |
| `REACT_APP_API_URL` | *(vacío)* | Sí (build) |
| `ADMIN_DEFAULT_PASSWORD` | Contraseña del usuario `admin` (obligatoria en producción; se sincroniza al arrancar) | **Sí** |
| `VAPID_PUBLIC_KEY` | Clave pública push (generar con `node scripts/generate-vapid-keys.js`) | **Sí** (notificaciones móvil) |
| `VAPID_PRIVATE_KEY` | Clave privada push (misma pareja que la pública) | **Sí** (notificaciones móvil) |
| `VAPID_EMAIL` | `mailto:tu@email.com` (contacto VAPID) | Recomendado |

`PORT` lo asigna Render solo; no hace falta ponerlo.

Con `DB_SSL=true`, la app ya usa `rejectUnauthorized: false` por defecto (certificados Aiven).
Si aún falla el login con error de certificado, añade en Render: `DB_SSL_REJECT_UNAUTHORIZED` = `false`

### Error `ENOTFOUND mysql-....aivencloud.com`

Significa que **el host en `DB_HOST` no existe** (servicio Aiven borrado, pausado o hostname viejo).

1. [Aiven Console](https://console.aiven.io) → tu servicio **MySQL** → **Connection information**.
2. Copia de nuevo **Host**, **Port**, **User**, **Password**, **Database**.
3. En Render → **Environment** → actualiza `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
4. **Sin comillas** ni espacios al pegar. El host suele ser tipo `mysql-xxxxx-nombre.l.aivencloud.com`.
5. **Save** → **Manual Deploy**.

Si recreaste el servicio MySQL en Aiven, el host **cambia** aunque el nombre del proyecto sea el mismo.

---

## Paso 5 — Deploy

1. **Create Web Service** / **Deploy**.
2. Espera el build (5–15 min la primera vez).
3. En **Logs** debe salir:
   - `Conexión a MySQL correcta`
   - `Tabla users_new lista`
   - `Frontend encontrado en: .../alertas-frontend/build`
4. Abre la URL: `https://alertascvn.onrender.com` (o la que te asigne Render al crear el servicio).

**Si cambias el nombre del servicio en Render:** la URL cambia, pero el código es el mismo. Actualiza `FRONTEND_URL` y `API_PUBLIC_URL` con la URL nueva y haz **Manual Deploy** del último commit de `main`.

Login por defecto (si no migraste datos): usuario `admin` y la contraseña de `ADMIN_DEFAULT_PASSWORD` o `admin123` si no la cambiaste.

---

## Plan Free de Render (importante)

- El servicio **se duerme** tras ~15 min sin visitas.
- La **primera petición** puede tardar **30–60 segundos** (normal en demo del TFG).
- El disco es **efímero**: imágenes en `uploads/` pueden **perderse** al redesplegar. Para producción real conviene Supabase Storage / S3 más adelante.

---

## Comprobar que todo va bien

- [ ] Login funciona.
- [ ] Mapa carga alertas.
- [ ] Crear alerta (admin).
- [ ] Noticias y tiempo abren.

Si falla MySQL en logs: revisa host, `DB_SSL=true` y firewall del proveedor de BD.

---

## Desarrollo local (sin cambiar)

Sigue usando en `alertas-frontend/.env.local`:

```env
REACT_APP_API_URL=http://localhost:4000
```

En Render el build usa `.env.production` con URL vacía (mismo dominio).

---

## Ayuda rápida

| Error | Qué hacer |
|-------|-----------|
| Build falla en `npm install` | Revisa que `package-lock.json` esté en GitHub |
| `JWT_SECRET es requerido` | Añade `JWT_SECRET` en Environment |
| `Error al conectar a MySQL` | Revisa `DB_*` y `DB_SSL` |
| Pantalla en blanco | Mira Logs; suele faltar build del frontend |
| CORS | `FRONTEND_URL` = URL exacta con `https://` |

Cuando tengas la URL de Render y las credenciales de Aiven, si algo falla en el deploy pégame el **log de Render** (últimas 30 líneas) y lo vemos.
