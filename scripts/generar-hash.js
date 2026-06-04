const bcrypt = require('bcrypt');

async function generarHash() {
  const password = process.argv[2] || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  console.log('🔑 COPIA ESTE HASH:');
  console.log(hash);
  console.log('');
  console.log('📋 SQL (con nombre_usuario en español):');
  console.log(`INSERT INTO users_new (nombre_usuario, email, password_hash, role) VALUES ('admin', 'admin@example.com', '${hash}', 'admin');`);
}

generarHash();
