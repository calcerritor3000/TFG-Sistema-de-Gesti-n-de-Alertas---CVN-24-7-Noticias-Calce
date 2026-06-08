/**
 * Genera claves VAPID para notificaciones push.
 * Ejecutar: node scripts/generate-vapid-keys.js
 * Copia el resultado a Render → Environment (y a tu .env local).
 */
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('Añade estas variables en Render y en .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_EMAIL=calcerradasanchezjorge@gmail.com');
