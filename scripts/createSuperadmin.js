/* ===========================================
   Crea la ÚNICA cuenta de super admin (se ejecuta una sola vez).
   Uso:  node scripts/crear-superadmin.js correo@dominio.com "ContraseñaSegura123" Nombre Apellido
   Si el correo ya existe, esa cuenta se asciende y se le fija la contraseña.
   Requiere haber corrido sql/migracion-superadmin.sql.
   =========================================== */
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const ID_ROL_SUPERADMIN = 3;

(async () => {
  const [correo, clave, nombre = 'Super', apellido = 'Admin'] = process.argv.slice(2);
  if (!correo || !clave || clave.length < 10) {
    console.error('Uso: node scripts/crear-superadmin.js <correo> <contraseña (mín. 10)> [nombre] [apellido]');
    process.exit(1);
  }

  try {
    const [existentes] = await pool.query('SELECT id_usuario, correo FROM usuarios WHERE id_rol = ?', [ID_ROL_SUPERADMIN]);
    const hash = await bcrypt.hash(clave, 10);
    const email = correo.trim().toLowerCase();
    const [filas] = await pool.query('SELECT id_usuario FROM usuarios WHERE correo = ?', [email]);
    const usuario = filas[0];

    if (existentes.length && (!usuario || existentes[0].id_usuario !== usuario.id_usuario)) {
      console.error(`Ya existe un super admin (${existentes[0].correo}). Solo se permite una cuenta.`);
      process.exit(1);
    }

    if (usuario) {
      await pool.query(
        "UPDATE usuarios SET id_rol = ?, contrasena_hash = ?, usuario_proveedor = 'local', estado = 'Activo' WHERE id_usuario = ?",
        [ID_ROL_SUPERADMIN, hash, usuario.id_usuario]
      );
      console.log(`Cuenta ${email} ascendida a super admin.`);
    } else {
      await pool.query(
        `INSERT INTO usuarios (id_rol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario, usuario_proveedor)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'local')`,
        [ID_ROL_SUPERADMIN, nombre, apellido, email, hash, `SA${Date.now()}`.slice(0, 20), 'superadmin']
      );
      console.log(`Super admin creado: ${email}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();