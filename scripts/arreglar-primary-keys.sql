-- =============================================================================
-- PEGAR Y EJECUTAR EN phpMyAdmin (XAMPP) → base alertas_db
-- Luego: Exportar de nuevo → Importar en Aiven
-- Si una línea falla ("Duplicate column" / "Multiple primary key"), ignórala.
-- =============================================================================

-- 1) Ver qué tablas NO tienen clave primaria (revisa el resultado)
SELECT t.TABLE_NAME AS tabla_sin_primary_key
FROM information_schema.TABLES t
LEFT JOIN information_schema.TABLE_CONSTRAINTS tc
  ON t.TABLE_SCHEMA = tc.TABLE_SCHEMA
  AND t.TABLE_NAME = tc.TABLE_NAME
  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_TYPE = 'BASE TABLE'
  AND tc.CONSTRAINT_NAME IS NULL;

-- 2) Añadir id AUTO_INCREMENT como PRIMARY KEY (tablas del TFG)
ALTER TABLE alert_confirmations
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alert_reports
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alert_comments
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE zone_subscriptions
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE notifications
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE push_subscriptions
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE weather_forecast
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE users_new
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alerts_new
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

-- 3) Nombres viejos por si aún existen en tu XAMPP
ALTER TABLE users
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alerts
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alertas
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE user_alerts
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE usuarios_alertas
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

-- 4) Si ya existe columna id pero sin PRIMARY KEY, descomenta y ejecuta solo esa tabla:
-- ALTER TABLE alert_confirmations ADD PRIMARY KEY (id);

-- 5) Comprobar de nuevo (debe devolver 0 filas)
SELECT t.TABLE_NAME AS tabla_sin_primary_key
FROM information_schema.TABLES t
LEFT JOIN information_schema.TABLE_CONSTRAINTS tc
  ON t.TABLE_SCHEMA = tc.TABLE_SCHEMA
  AND t.TABLE_NAME = tc.TABLE_NAME
  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_TYPE = 'BASE TABLE'
  AND tc.CONSTRAINT_NAME IS NULL;
