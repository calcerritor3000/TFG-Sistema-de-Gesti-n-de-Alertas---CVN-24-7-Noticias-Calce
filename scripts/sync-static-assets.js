/**
 * Copia imágenes de alertas a public/ para que el build de React las incluya.
 * El logo CVN_Noticias.png debe vivir siempre en alertas-frontend/public/
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcAlerts = path.join(root, 'uploads', 'alerts');
const destAlerts = path.join(root, 'alertas-frontend', 'public', 'uploads', 'alerts');
const logoPublic = path.join(root, 'alertas-frontend', 'public', 'CVN_Noticias.png');

if (!fs.existsSync(logoPublic)) {
  console.error('Falta el logo:', logoPublic);
  process.exit(1);
}

fs.mkdirSync(destAlerts, { recursive: true });

if (!fs.existsSync(srcAlerts)) {
  console.warn('No existe uploads/alerts; solo se usará public/uploads/alerts si ya hay archivos.');
} else {
  let n = 0;
  for (const name of fs.readdirSync(srcAlerts)) {
    if (name === '.gitkeep' || !/\.(png|jpe?g|webp|gif)$/i.test(name)) continue;
    fs.copyFileSync(path.join(srcAlerts, name), path.join(destAlerts, name));
    n += 1;
  }
  console.log(`sync-static-assets: ${n} imagen(es) de alertas → public/uploads/alerts/`);
}

const inPublic = fs.existsSync(destAlerts)
  ? fs.readdirSync(destAlerts).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).length
  : 0;
console.log(`Logo OK: public/CVN_Noticias.png | Imágenes en public/uploads/alerts: ${inPublic}`);
