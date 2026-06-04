# Importar la base de datos en Aiven (error `sql_require_primary_key`)

Aiven **exige** que cada tabla tenga **PRIMARY KEY** en el momento del `CREATE TABLE`.

## Por qué falla `127_0_0_1.sql` (exportación phpMyAdmin)

Ese archivo:

1. Crea tablas **sin** `PRIMARY KEY` en el `CREATE` (la clave va al **final** con `ALTER TABLE ... ADD PRIMARY KEY`).
2. Aiven **rechaza** el `CREATE` antes de llegar al `ALTER`.
3. Incluye **varias bases** (`alertasdb` vieja, `phpmyadmin`, etc.) que no necesitas.

**No importes el `.sql` completo en Aiven.** Usa los dos pasos de abajo.

---

Tienes **dos caminos**. El **A** es el más fiable.

---

## Camino A — Base vacía + esquema correcto (recomendado)

No importes el `.sql` viejo de XAMPP.

1. En Aiven, crea el servicio MySQL y una base vacía.
2. Abre la consola SQL de Aiven (o MySQL Workbench con SSL).
3. Ejecuta el archivo **`scripts/schema-aiven.sql`** (copia y pega o importa el archivo).
4. Configura Render con las variables `DB_*` de Aiven y `DB_SSL=true`.
5. Arranca la app: creará el usuario `admin` en desarrollo o regístrate en producción.

Si necesitas **tus datos** del dump `127_0_0_1.sql`:

1. En Aiven (consola SQL), ejecuta **`scripts/schema-aiven.sql`** (estructura con PK).
2. En tu PC: `node scripts/extraer-datos-aiven.js C:\Users\PC\Downloads\127_0_0_1.sql`
3. Importa en Aiven los datos (solo INSERT, sin CREATE).

Orden: **schema primero**, **datos después**.

### Si no puedes abrir `importar-datos-aiven.sql` (Cursor, Bloc de notas o Aiven)

El archivo completo pesa ~11 KB; aun así a veces el editor o la consola de Aiven fallan al pegar todo de golpe. Usa **tres archivos pequeños** en este orden:

| Orden | Archivo | Contenido |
|-------|---------|-----------|
| 1 | `scripts/importar-datos-aiven-1.sql` | Usuarios, alertas, confirmaciones, comentarios, zonas |
| 2 | `scripts/importar-datos-aiven-2-push.sql` | Push (opcional; si falla, sáltalo) |
| 3 | `scripts/importar-datos-aiven-3-tiempo.sql` | Previsión meteorológica |

**Abrir en Windows (fuera de Cursor):**

```powershell
notepad "C:\Users\PC\Desktop\AlertasBackend\scripts\importar-datos-aiven-1.sql"
```

O clic derecho en el archivo → **Abrir con** → Bloc de notas / Notepad++.

**En Aiven:** consola SQL → copia **todo** el contenido de la parte 1 → Ejecutar → repite con 2 y 3.

Alternativa: importa el archivo completo `importar-datos-aiven.sql` si tu cliente lo permite (MySQL Workbench con SSL, o `mysql` en terminal).

---

## Camino B — Arreglar XAMPP y volver a exportar todo

1. En **phpMyAdmin (XAMPP)** → pestaña SQL.
2. Ejecuta **`scripts/fix-missing-primary-keys.sql`**.
3. Comprueba la tabla que daba error (suele ser `alert_confirmations`):

```sql
SHOW CREATE TABLE alert_confirmations;
```

Debe verse algo como: `PRIMARY KEY (id)` o `id` con `AUTO_INCREMENT`.

4. Vuelve a exportar la base (`mysqldump` o Exportar de phpMyAdmin).
5. Importa el nuevo `.sql` en Aiven.

---

## Cómo saber qué tabla falla

El mensaje de Aiven suele indicar la tabla. Si no:

```sql
SELECT t.TABLE_NAME
FROM information_schema.TABLES t
LEFT JOIN information_schema.TABLE_CONSTRAINTS tc
  ON t.TABLE_SCHEMA = tc.TABLE_SCHEMA
  AND t.TABLE_NAME = tc.TABLE_NAME
  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_TYPE = 'BASE TABLE'
  AND tc.CONSTRAINT_NAME IS NULL;
```

Para esa tabla, en XAMPP:

```sql
ALTER TABLE nombre_tabla
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;
```

*(Solo si no tiene ya columna `id`.)*

---

## Tablas oficiales del proyecto (todas con `id` PRIMARY KEY)

| Tabla | Uso |
|-------|-----|
| `users_new` | Usuarios |
| `alerts_new` | Alertas |
| `alert_confirmations` | Usuario confirma alerta |
| `alert_reports` | Reportes |
| `alert_comments` | Comentarios |
| `zone_subscriptions` | Zonas de interés |
| `notifications` | Avisos |
| `push_subscriptions` | Push web |
| `weather_forecast` | Tiempo |

**No importes** tablas viejas que no use `app.js` (`users`, `alerts` sin `_new`, etc.) salvo que las migres a mano.

---

## No desactives `sql_require_primary_key` en Aiven

Aunque se pueda en algunos entornos, Aiven lo mantiene por seguridad y rendimiento. Mejor arreglar las tablas.

---

## Resumen

1. **Más fácil:** `schema-aiven.sql` en Aiven vacío → conectar Render → listo.
2. **Con datos viejos:** `fix-missing-primary-keys.sql` en XAMPP → reexportar → importar en Aiven.
3. La app en `app.js` ya define todas las tablas con `id PRIMARY KEY`; el problema casi siempre es el **dump antiguo**.
