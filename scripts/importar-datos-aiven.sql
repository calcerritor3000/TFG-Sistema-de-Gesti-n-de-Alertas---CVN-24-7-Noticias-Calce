-- =============================================================================
-- PASO 2 en Aiven: importar SOLO datos (después de schema-aiven.sql)
-- Generado desde: 127_0_0_1.sql
-- =============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- users_new
INSERT INTO `users_new` (`id`, `nombre_usuario`, `email`, `password_hash`, `role`, `created_at`) VALUES
(1, 'admin', 'admin@example.com', '$2b$10$bZaU5TInWgFkcircg9Le9eUpC1UlhlaIZq66oll/nUbDygCt5Tg7.', 'admin', '2026-02-26 15:42:46'),
(2, 'calce123', 'calcerradasanchezjorge@gmail.com', '$2b$10$mYb6QZztJ5/gHwvBkDR/yuHV5f545K6AEbS2afG3HLft98oO/RjmC', 'user', '2026-03-09 17:32:20');



-- alerts_new
INSERT INTO `alerts_new` (`id`, `titulo`, `descripcion`, `nivel`, `categoria`, `estado`, `lat`, `lng`, `radius`, `is_maintenance`, `maintenance_start`, `maintenance_end`, `created_at`, `polygon`, `image_url`) VALUES
(1, 'LLuvia', 'lluvias torrenciales', 'amarillo', 'meteorologia', 'activa', 39.47545200, -0.36821400, 5200, 0, NULL, NULL, '2026-03-04 17:59:13', NULL, '/uploads/alerts/1776692120330_lluvias-en-la-zona-del-barranco-de-catar.jpg'),
(2, 'Incendio', 'Varias zonas de Paiporta ha habido un incencendio forestal.', 'rojo', 'incendio', 'activa', 39.42706800, -0.41679400, 650, 0, NULL, NULL, '2026-03-09 17:34:39', NULL, '/uploads/alerts/1776692048460_conectaincendio_reportaje.jpg'),
(3, 'Obras', 'Obras molestas a los ciudadanos', 'verde', 'obras', 'activa', 39.41969600, -0.38872700, 50, 0, NULL, NULL, '2026-03-09 17:36:13', NULL, '/uploads/alerts/1776691787733_images.jpg'),
(5, 'Inundaciones en Manises', 'Pequeñas inundaciones en valles en manises', 'amarillo', 'inundacion', 'activa', 39.49135800, -0.45215600, 600, 0, NULL, NULL, '2026-04-16 16:01:07', NULL, '/uploads/alerts/1776691843740_descarga.jpg'),
(7, 'Lluvia extrema', 'Intensas precipitaciones que hay en este temporal  en la provincia de Castellón', 'rojo', 'meteorologia', 'activa', 40.01550900, -0.13698600, 25000, 0, NULL, NULL, '2026-05-11 14:49:04', NULL, '/uploads/alerts/1778531277987_d83229ff-15a0-47d4-a374-2feed8b0a2f3.png');



-- alert_confirmations
INSERT INTO `alert_confirmations` (`id`, `alert_id`, `user_id`, `confirmed`, `created_at`) VALUES
(1, 1, 1, 1, '2026-03-04 18:01:29'),
(2, 2, 2, 1, '2026-04-25 11:57:56');



-- alert_comments
INSERT INTO `alert_comments` (`id`, `alert_id`, `user_id`, `comentario`, `created_at`, `updated_at`) VALUES
(1, 3, 1, 'es real', '2026-05-05 19:07:32', '2026-05-05 19:07:32'),
(2, 3, 1, 'es real', '2026-05-05 19:07:36', '2026-05-05 19:07:36');



-- push_subscriptions
INSERT INTO `push_subscriptions` (`id`, `user_id`, `endpoint`, `p256dh`, `auth`, `activa`, `created_at`, `updated_at`) VALUES
(1, 1, 'https://fcm.googleapis.com/fcm/send/cpvaduGr0C4:APA91bE8QBoTLpv4P7e0lP4qgSX0H4AYOFG4AU_FkzzLRynP12-_zjWfjvSbw2AuqPef1vMvAUugm2DUAl9dizFiNMJluhZ25vtppESn5M3ObPSOHhEIKSFX7olvLsfgKG1_aTOR-1zY', 'BPzKaohmwfwpXjfcoErSxAfN1gKBL_RMduNb-uV3PZb9oZoAEHdYmsHZEBfcTe56s1n0EQI4aZIhTnoWRVbAQdA', '4-gZ6TqPcnXrUq2JLFQdNw', 1, '2026-04-25 12:07:08', '2026-06-01 23:05:28'),
(682, 1, 'https://fcm.googleapis.com/fcm/send/dBuxq713188:APA91bF5vl--VX68Mt7Z1H6dudQpcVbu0kM202Nhti0D2eop2Jt-SahWrbSEFfwsc_9rEAjK-pSCNLOaOMP_PKCzSv4xakFBoeMzBMsrKrNRyJebnGXn0tIt9sexCAvnuq_OQW9nOm5c', 'BDEHOToL1BGAaT027k0Pk2qc0MhHU7UZQCm8vUNghJkKaG929bmSXJkrGlwWWYHZsumIFGR8v0NIR9jo_OnyO8A', 'iH785qZxj16vtTpYCMeFTQ', 1, '2026-06-01 23:06:11', '2026-06-01 23:06:11'),
(683, 1, 'https://fcm.googleapis.com/fcm/send/et2SyV4bs2c:APA91bHF-y5LWyFaBJPKVSIVPUq3MQxwkM0Uss1iEKi77x9Q-tMYKixoOVxoZUP7o0VQZQ4nUe3Qt6kV6DftFFILwb9EeHPWoHNAbKvzLbQmdh1DQAuTa5oBmOuwp3UN04wnUzvwAIRp', 'BO4UdMWAUEIH5jansmZc7u2doPX0oj_ZsmvE85Pp0-8QzW-Ih_TfUE4WQp1aEMoMg5A4z6Sz0z2jc7GVyon_dpM', '7_0ccWLC6NdQEFepM2ydfA', 1, '2026-06-01 23:06:11', '2026-06-01 23:06:11'),
(684, 1, 'https://fcm.googleapis.com/fcm/send/ctNvh0TfH60:APA91bFKjT1DWDK3muASBvt498Kw8oUNYQIhIhrUZtWBnLII102UhJhYnVgp-fwDqHj4WBlVrniHxsUdeG4lr8OOlkkjYf6O4vbaRA-tKMvNVC7jkwlDoyzfttR25PFbN1lcszGtBoYC', 'BOM1IJfNJfwhnvSlU81xDRUruRmdHba3ln1oEnySU6FwL2fDEwc6GtIW8KaJEokUqA863__a0rDS6ikSKIi5hsw', 'EGkHckHDdipqBrDUPMzVQg', 1, '2026-06-01 23:06:11', '2026-06-01 23:06:11'),
(685, 1, 'https://fcm.googleapis.com/fcm/send/exQaYRAn81s:APA91bGPUOokzmFEzzXuMzMjG5o-yKzhiIBiTVVa3dTJUyofSgTAdTcBIdX3LXHjCz0G5cHE17_e35qq-vyDDHDIg2a27JGpC0qKGZhuYnGtGDr-wppRIsCJj-ScYn_75FJ_9XwrnsRd', 'BBm5IndSl07DLximXR8_nmiKEKtsnF0i38ISzlfIi2K32DXoo0R7cJg5qgyfuHs-2mSxTPUwTXO4wQyN8EWm1Jg', 'x94ReBGK6jiZBEuZhHl3aw', 1, '2026-06-01 23:06:11', '2026-06-02 17:12:47');



-- zone_subscriptions
INSERT INTO `zone_subscriptions` (`id`, `user_id`, `nombre_zona`, `lat`, `lng`, `radius`, `activa`, `created_at`) VALUES
(1, 1, 'MI casa', 39.43012800, -0.41662800, 1000, 1, '2026-04-03 09:31:20'),
(2, 2, 'Mi casa', 39.43017000, -0.41662500, 1000, 0, '2026-04-25 12:13:27'),
(3, 1, 'Escuela', 39.50145800, -0.41012000, 1000, 1, '2026-06-02 10:12:36');



-- weather_forecast
INSERT INTO `weather_forecast` (`id`, `fecha`, `hora_inicio`, `hora_fin`, `temperatura`, `probabilidad_precipitacion`, `cota_nieve`, `direccion_viento`, `velocidad_viento`, `icono_tiempo`, `temp_minima`, `temp_maxima`, `created_at`, `updated_at`) VALUES
(1, '2026-03-10', '00:00:00', '06:00:00', NULL, 0, NULL, 'N', 0, 'soleado', NULL, NULL, '2026-03-10 14:17:46', '2026-03-10 14:25:01'),
(3, '2026-04-20', '00:00:00', '12:00:00', 22.0, 0, NULL, 'O', 3, 'soleado', 12.0, 23.0, '2026-04-16 15:47:31', '2026-04-16 15:47:31'),
(4, '2026-04-16', '00:00:00', '12:00:00', 23.0, 0, NULL, 'E', 4, 'soleado', 12.0, 25.0, '2026-04-16 16:03:51', '2026-04-16 16:03:51'),
(5, '2026-04-20', '00:00:00', '23:59:59', 18.6, 0, NULL, 'E', 13, 'nublado', 12.7, 24.5, '2026-04-20 13:43:50', '2026-04-20 13:43:50'),
(6, '2026-04-21', '00:00:00', '23:59:59', 17.1, 0, NULL, 'NE', 13, 'nublado', 12.9, 21.3, '2026-04-20 13:43:50', '2026-04-20 13:43:50'),
(7, '2026-04-22', '00:00:00', '23:59:59', 19.0, 0, NULL, 'E', 12, 'nublado', 14.2, 23.9, '2026-04-20 13:43:50', '2026-04-20 13:43:50'),
(8, '2026-04-23', '00:00:00', '23:59:59', 18.1, 3, NULL, 'NE', 19, 'nublado', 15.9, 20.2, '2026-04-20 13:43:50', '2026-04-20 13:43:50'),
(9, '2026-04-24', '00:00:00', '23:59:59', 16.9, 13, NULL, 'E', 11, 'nublado', 14.4, 19.4, '2026-04-20 13:43:50', '2026-04-20 13:43:50'),
(10, '2026-04-25', '00:00:00', '23:59:59', 18.0, 25, NULL, 'SE', 14, 'nublado', 15.0, 21.0, '2026-04-20 13:43:50', '2026-04-25 11:27:42'),
(11, '2026-04-26', '00:00:00', '23:59:59', 16.4, 0, NULL, 'SE', 14, 'parcialmente_nublado', 11.4, 21.4, '2026-04-20 13:43:50', '2026-04-26 14:24:54'),
(14, '2026-04-27', '00:00:00', '23:59:59', 16.2, 0, NULL, 'E', 13, 'parcialmente_nublado', 10.4, 22.0, '2026-04-25 11:27:42', '2026-04-26 14:24:54'),
(15, '2026-04-28', '00:00:00', '23:59:59', 16.0, 5, NULL, 'E', 12, 'nublado', 11.2, 20.8, '2026-04-25 11:27:42', '2026-04-26 14:24:54'),
(16, '2026-04-29', '00:00:00', '23:59:59', 17.1, 28, NULL, 'NE', 11, 'nublado', 14.9, 19.2, '2026-04-25 11:27:42', '2026-04-26 14:24:54'),
(17, '2026-04-30', '00:00:00', '23:59:59', 19.4, 0, NULL, 'E', 15, 'nublado', 16.1, 22.7, '2026-04-25 11:27:42', '2026-04-30 16:25:14'),
(18, '2026-05-01', '00:00:00', '23:59:59', 18.7, 60, NULL, 'NE', 15, 'lluvia_ligera', 17.3, 20.0, '2026-04-25 11:27:42', '2026-04-30 16:25:14'),
(25, '2026-05-02', '00:00:00', '23:59:59', 18.6, 53, NULL, 'E', 14, 'nublado', 16.2, 21.0, '2026-04-26 14:24:54', '2026-04-30 16:25:14'),
(29, '2026-05-03', '00:00:00', '23:59:59', 19.7, 28, NULL, 'E', 13, 'lluvia_ligera', 17.0, 22.4, '2026-04-30 16:25:14', '2026-04-30 16:25:14'),
(30, '2026-05-04', '00:00:00', '23:59:59', 22.3, 24, NULL, 'NO', 16, 'lluvia_ligera', 17.0, 27.6, '2026-04-30 16:25:14', '2026-04-30 16:25:14'),
(31, '2026-05-05', '00:00:00', '23:59:59', 19.1, 34, NULL, 'E', 12, 'parcialmente_nublado', 15.7, 22.5, '2026-04-30 16:25:14', '2026-04-30 16:25:14'),
(32, '2026-05-06', '00:00:00', '23:59:59', 17.7, 5, NULL, 'E', 15, 'nublado', 13.9, 21.4, '2026-04-30 16:25:14', '2026-05-06 14:33:13'),
(34, '2026-05-07', '00:00:00', '23:59:59', 16.1, 78, NULL, 'NE', 12, 'tormenta', 13.1, 19.1, '2026-05-06 14:33:13', '2026-05-06 14:33:13'),
(35, '2026-05-08', '00:00:00', '23:59:59', 16.6, 15, NULL, 'E', 16, 'nublado', 12.3, 20.8, '2026-05-06 14:33:13', '2026-05-08 15:02:08'),
(36, '2026-05-09', '00:00:00', '23:59:59', 17.8, 98, NULL, 'NE', 12, 'lluvia_ligera', 16.0, 19.6, '2026-05-06 14:33:13', '2026-05-08 15:02:08'),
(37, '2026-05-10', '00:00:00', '23:59:59', 20.2, 5, NULL, 'O', 20, 'nublado', 14.4, 25.9, '2026-05-06 14:33:13', '2026-05-08 15:02:08'),
(38, '2026-05-11', '00:00:00', '23:59:59', 21.3, 2, NULL, 'O', 16, 'nublado', 15.9, 26.7, '2026-05-06 14:33:13', '2026-05-08 15:02:08'),
(39, '2026-05-12', '00:00:00', '23:59:59', 19.6, 6, NULL, 'NO', 14, 'parcialmente_nublado', 14.0, 25.1, '2026-05-06 14:33:13', '2026-05-08 15:02:08'),
(45, '2026-05-13', '00:00:00', '23:59:59', 21.3, 6, NULL, 'NO', 13, 'parcialmente_nublado', 15.4, 27.2, '2026-05-08 15:02:08', '2026-05-08 15:02:08'),
(46, '2026-05-14', '00:00:00', '23:59:59', 21.1, 18, NULL, 'NO', 17, 'nublado', 14.0, 28.1, '2026-05-08 15:02:08', '2026-05-08 15:02:08'),
(47, '2026-05-31', '00:00:00', '23:59:59', 23.7, 0, NULL, 'E', 13, 'nublado', 19.7, 27.6, '2026-05-31 17:36:02', '2026-05-31 17:36:02'),
(48, '2026-06-01', '00:00:00', '23:59:59', 23.0, 0, NULL, 'E', 14, 'nublado', 19.5, 26.5, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(49, '2026-06-02', '00:00:00', '23:59:59', 23.5, 0, NULL, 'E', 15, 'nublado', 19.8, 27.2, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(50, '2026-06-03', '00:00:00', '23:59:59', 23.8, 0, NULL, 'SE', 21, 'parcialmente_nublado', 20.7, 26.9, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(51, '2026-06-04', '00:00:00', '23:59:59', 25.2, 1, NULL, 'E', 26, 'nublado', 19.1, 31.2, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(52, '2026-06-05', '00:00:00', '23:59:59', 22.5, 12, NULL, 'NE', 21, 'nublado', 20.9, 24.1, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(53, '2026-06-06', '00:00:00', '23:59:59', 23.2, 20, NULL, 'E', 18, 'lluvia_ligera', 20.3, 26.1, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(54, '2026-06-07', '00:00:00', '23:59:59', 24.2, 7, NULL, 'E', 18, 'nublado', 19.7, 28.6, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(55, '2026-06-08', '00:00:00', '23:59:59', 24.1, 2, NULL, 'E', 17, 'nublado', 19.5, 28.7, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(56, '2026-06-09', '00:00:00', '23:59:59', 23.7, 2, NULL, 'E', 13, 'parcialmente_nublado', 21.4, 26.0, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(57, '2026-06-10', '00:00:00', '23:59:59', 25.0, 2, NULL, 'E', 12, 'parcialmente_nublado', 21.1, 28.9, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(58, '2026-06-11', '00:00:00', '23:59:59', 25.3, 1, NULL, 'E', 15, 'parcialmente_nublado', 22.2, 28.4, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(59, '2026-06-12', '00:00:00', '23:59:59', 26.0, 2, NULL, 'E', 15, 'parcialmente_nublado', 22.9, 29.0, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(60, '2026-06-13', '00:00:00', '23:59:59', 26.2, 6, NULL, 'SE', 14, 'parcialmente_nublado', 23.0, 29.3, '2026-05-31 17:36:02', '2026-06-01 20:59:42'),
(74, '2026-06-14', '00:00:00', '23:59:59', 25.6, 7, NULL, 'E', 14, 'soleado', 23.1, 28.1, '2026-06-01 11:27:11', '2026-06-01 20:59:42');



SET FOREIGN_KEY_CHECKS=1;
