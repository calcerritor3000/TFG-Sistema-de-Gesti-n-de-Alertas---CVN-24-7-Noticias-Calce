const fs = require('fs');
const path = require('path');

const dumpPath = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', '127_0_0_1.sql');
const outPath = path.join(__dirname, 'importar-datos-aiven.sql');

const sql = fs.readFileSync(dumpPath, 'utf8');
const start = sql.indexOf('USE `alertas_db`');
const end = sql.indexOf('-- Base de datos: `phpmyadmin`', start);
if (start < 0 || end < 0) {
  console.error('No se encontró la sección alertas_db en el dump');
  process.exit(1);
}

const chunk = sql.slice(start, end);
const header = `-- =============================================================================
-- PASO 2 en Aiven: importar SOLO datos (después de schema-aiven.sql)
-- Generado desde: ${path.basename(dumpPath)}
-- =============================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

`;

const order = [
  'users_new',
  'alerts_new',
  'alert_confirmations',
  'alert_comments',
  'alert_reports',
  'notifications',
  'push_subscriptions',
  'zone_subscriptions',
  'weather_forecast'
];

let out = header;
for (const table of order) {
  const re = new RegExp(`INSERT INTO \\\`${table}\\\`[\\s\\S]*?;\\s*`, 'g');
  const matches = chunk.match(re);
  if (matches) {
    out += `-- ${table}\n` + matches.join('\n') + '\n\n';
  }
}
out += 'SET FOREIGN_KEY_CHECKS=1;\n';

fs.writeFileSync(outPath, out);
console.log('Creado:', outPath, '(' + out.length + ' bytes)');
console.log('Tablas con datos:', order.filter((t) => out.includes('INSERT INTO `' + t + '`')));
