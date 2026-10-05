/**
 * Diagnostico del entorno - ejecuta: npm run doctor
 * No modifica nada. Solo informa si el proyecto puede arrancar y que falta.
 */

require('dotenv').config();

const ok = (t) => console.log(`  [OK]     ${t}`);
const warn = (t) => console.log(`  [AVISO]  ${t}`);
const fail = (t) => console.log(`  [FALTA]  ${t}`);
const line = () => console.log('-'.repeat(58));

const ocultado = (v) => (v ? `${String(v).slice(0, 6)}...(${String(v).length} chars)` : '(vacio)');

(async () => {
  console.log('\n=== 1. Variables de entorno ===');

  process.env.PORT ? ok(`PORT = ${process.env.PORT}`) : fail('PORT no definido');
  process.env.SESSION_SECRET
    ? ok(`SESSION_SECRET = ${ocultado(process.env.SESSION_SECRET)}`)
    : fail('SESSION_SECRET no definido');

  const dbVars = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_NAME', 'MYSQL_PORT'];
  const faltan = dbVars.filter((v) => !process.env[v]);
  faltan.length === 0 ? ok('MYSQL_* completos') : fail(`Faltan: ${faltan.join(', ')}`);
  line();

  console.log('\n=== 2. Conexion a MySQL ===');
  let dbOk = false;
  try {
    const pool = require('../config/db');
    const [rows] = await pool.query('SELECT 1 AS prueba');
    dbOk = rows.length === 1;
    ok(`Conectado a ${process.env.MYSQL_NAME}`);

    const [u] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    ok(`Tabla usuarios accesible (${u[0].total} registros)`);
    await pool.end();
  } catch (e) {
    fail(`No se pudo conectar: ${e.code || e.message}`);
    console.log('           Revisa que MySQL este corriendo y que .env tenga los datos correctos.');
  }
  line();

  console.log('\n=== 3. Autenticacion social ===');
  const sso = require('../config/sso');

  if (sso.isGoogleConfigured()) {
    ok('Google configurado');
    console.log(`           redirect_uri: ${sso.google.redirectUri}`);
  } else {
    fail('Google NOT configured -> /auth/google returns error=sso_not_configured');
    console.log('           Pasos: https://console.cloud.google.com');
    console.log('           1) Crear proyecto  2) APIs y servicios > Credentials');
    console.log('           3) Create Credentials > OAuth client ID > Web application');
    console.log(`           4) Redirect URI: ${sso.google.redirectUri}`);
  }

  const appleNotice = sso.appleNotice();
  appleNotice ? warn(`Apple ID: ${appleNotice}`) : ok('Apple configurado');
  line();

  console.log('\n=== 4. Resultado ===');
  const listo = dbOk && process.env.SESSION_SECRET && sso.isGoogleConfigured();
  if (listo) {
    console.log('  Todo listo. Arranca con: npm run dev\n');
  } else {
    console.log('  Faltan pasos. Lista de pendientes:\n');
    if (!dbOk) console.log('    - Levantar MySQL y revisar credenciales en .env');
    if (!process.env.SESSION_SECRET) console.log('    - Definir SESSION_SECRET en .env');
    if (!sso.isGoogleConfigured()) console.log('    - Crear credenciales OAuth de Google y pegarlas en .env');
    console.log('');
  }
  process.exit(0);
})();