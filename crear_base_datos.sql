-- =============================================================================
-- Script inicial de base de datos (MySQL)
-- Crea solo la base `alertas_db`. Las tablas (`users_new`, `alerts_new`, etc.)
-- las genera o altera el servidor Node al arrancar (`inicializarBaseDatos` en app.js).
-- Ejecutar una vez en el cliente mysql o phpMyAdmin antes de levantar el API.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS alertas_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE alertas_db;

-- El resto de las tablas se crearán automáticamente cuando inicies el servidor Node.js
