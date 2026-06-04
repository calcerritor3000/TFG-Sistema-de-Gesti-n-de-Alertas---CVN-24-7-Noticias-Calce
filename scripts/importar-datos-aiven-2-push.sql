-- Parte 2/3 — OPCIONAL (notificaciones push). Si falla, puedes saltarla.
SET FOREIGN_KEY_CHECKS=0;

INSERT INTO `push_subscriptions` (`id`, `user_id`, `endpoint`, `p256dh`, `auth`, `activa`, `created_at`, `updated_at`) VALUES
(1, 1, 'https://fcm.googleapis.com/fcm/send/cpvaduGr0C4:APA91bE8QBoTLpv4P7e0lP4qgSX0H4AYOFG4AU_FkzzLRynP12-_zjWfjvSbw2AuqPef1vMvAUugm2DUAl9dizFiNMJluhZ25vtppESn5M3ObPSOHhEIKSFX7olvLsfgKG1_aTOR-1zY', 'BPzKaohmwfwpXjfcoErSxAfN1gKBL_RMduNb-uV3PZb9oZoAEHdYmsHZEBfcTe56s1n0EQI4aZIhTnoWRVbAQdA', '4-gZ6TqPcnXrUq2JLFQdNw', 1, '2026-04-25 12:07:08', '2026-06-01 23:05:28');

SET FOREIGN_KEY_CHECKS=1;
