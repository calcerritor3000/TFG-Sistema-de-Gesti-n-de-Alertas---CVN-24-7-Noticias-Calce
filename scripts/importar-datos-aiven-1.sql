-- Parte 1/3 — Ejecutar en Aiven DESPUÉS de schema-aiven.sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

INSERT INTO `users_new` (`id`, `nombre_usuario`, `email`, `password_hash`, `role`, `created_at`) VALUES
(1, 'admin', 'admin@example.com', '$2b$10$bZaU5TInWgFkcircg9Le9eUpC1UlhlaIZq66oll/nUbDygCt5Tg7.', 'admin', '2026-02-26 15:42:46'),
(2, 'calce123', 'calcerradasanchezjorge@gmail.com', '$2b$10$mYb6QZztJ5/gHwvBkDR/yuHV5f545K6AEbS2afG3HLft98oO/RjmC', 'user', '2026-03-09 17:32:20');

INSERT INTO `alerts_new` (`id`, `titulo`, `descripcion`, `nivel`, `categoria`, `estado`, `lat`, `lng`, `radius`, `is_maintenance`, `maintenance_start`, `maintenance_end`, `created_at`, `polygon`, `image_url`) VALUES
(1, 'LLuvia', 'lluvias torrenciales', 'amarillo', 'meteorologia', 'activa', 39.47545200, -0.36821400, 5200, 0, NULL, NULL, '2026-03-04 17:59:13', NULL, '/uploads/alerts/1776692120330_lluvias-en-la-zona-del-barranco-de-catar.jpg'),
(2, 'Incendio', 'Varias zonas de Paiporta ha habido un incencendio forestal.', 'rojo', 'incendio', 'activa', 39.42706800, -0.41679400, 650, 0, NULL, NULL, '2026-03-09 17:34:39', NULL, '/uploads/alerts/1776692048460_conectaincendio_reportaje.jpg'),
(3, 'Obras', 'Obras molestas a los ciudadanos', 'verde', 'obras', 'activa', 39.41969600, -0.38872700, 50, 0, NULL, NULL, '2026-03-09 17:36:13', NULL, '/uploads/alerts/1776691787733_images.jpg'),
(5, 'Inundaciones en Manises', 'Pequeñas inundaciones en valles en manises', 'amarillo', 'inundacion', 'activa', 39.49135800, -0.45215600, 600, 0, NULL, NULL, '2026-04-16 16:01:07', NULL, '/uploads/alerts/1776691843740_descarga.jpg'),
(7, 'Lluvia extrema', 'Intensas precipitaciones que hay en este temporal  en la provincia de Castellón', 'rojo', 'meteorologia', 'activa', 40.01550900, -0.13698600, 25000, 0, NULL, NULL, '2026-05-11 14:49:04', NULL, '/uploads/alerts/1778531277987_d83229ff-15a0-47d4-a374-2feed8b0a2f3.png');

INSERT INTO `alert_confirmations` (`id`, `alert_id`, `user_id`, `confirmed`, `created_at`) VALUES
(1, 1, 1, 1, '2026-03-04 18:01:29'),
(2, 2, 2, 1, '2026-04-25 11:57:56');

INSERT INTO `alert_comments` (`id`, `alert_id`, `user_id`, `comentario`, `created_at`, `updated_at`) VALUES
(1, 3, 1, 'es real', '2026-05-05 19:07:32', '2026-05-05 19:07:32'),
(2, 3, 1, 'es real', '2026-05-05 19:07:36', '2026-05-05 19:07:36');

INSERT INTO `zone_subscriptions` (`id`, `user_id`, `nombre_zona`, `lat`, `lng`, `radius`, `activa`, `created_at`) VALUES
(1, 1, 'MI casa', 39.43012800, -0.41662800, 1000, 1, '2026-04-03 09:31:20'),
(2, 2, 'Mi casa', 39.43017000, -0.41662500, 1000, 0, '2026-04-25 12:13:27'),
(3, 1, 'Escuela', 39.50145800, -0.41012000, 1000, 1, '2026-06-02 10:12:36');
