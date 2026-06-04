-- =============================================================================
-- Reparar tablas SIN clave primaria (típico en dumps de XAMPP)
-- Ejecutar en phpMyAdmin / MySQL local ANTES de exportar el .sql para Aiven.
-- Si una línea falla con "Duplicate column", esa tabla ya está bien: sigue con la siguiente.
-- =============================================================================

-- Confirmaciones usuario-alerta (a veces solo tenían UNIQUE sin id)
ALTER TABLE alert_confirmations
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

-- Nombres antiguos del proyecto (por si aún existen en tu XAMPP)
ALTER TABLE alert_confirmations_old
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE user_alerts
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE usuarios_alertas
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE users
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alerts
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE alertas
  ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

-- Si la tabla solo tenía UNIQUE(alert_id, user_id) y ya existe columna id sin PK:
-- ALTER TABLE alert_confirmations ADD PRIMARY KEY (id);
