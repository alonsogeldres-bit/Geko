
/* ===========================================
   Modelo de usuarios.
   NOTA DE CONVENCION: los identificadores de este archivo
   (nombre, apellido, numero, nombre_usuario, contrasena_hash,
   id_usuario, id_rol...) son NOMBRES DE COLUMNA de la tabla
   `usuarios`, que esta en espanol en el esquema. Se mantienen
   tal cual a proposito: renombrarlos aqui dejaria el SQL sin
   coincidencia con la tabla y la aplicacion caeria.
   Todo lo demas del proyecto esta en ingles.
   =========================================== */

const pool = require('../config/db');

const ID_ROL_ADMIN = 1;
const ID_ROL_CLIENTE = 2;

const findByEmail = async (correo) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
  return rows[0] || null;
};

const existsByEmail = async (correo) => {
  const [rows] = await pool.query('SELECT id_usuario FROM usuarios WHERE correo = ?', [correo]);
  return rows.length > 0;
};

const existsByUsername = async (nombre_usuario) => {
  const [rows] = await pool.query('SELECT id_usuario FROM usuarios WHERE nombre_usuario = ?', [nombre_usuario]);
  return rows.length > 0;
};

const existsByPhone = async (numero) => {
  const [rows] = await pool.query('SELECT id_usuario FROM usuarios WHERE numero = ?', [numero]);
  return rows.length > 0;
};

const create = async ({ nombre, apellido, nombre_usuario, correo, numero, contrasena_hash }) => {
  const [result] = await pool.query(
    `INSERT INTO usuarios (id_rol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ID_ROL_CLIENTE, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario]
  );
  return result;
};

/** Updates contrasena_hash for one user. Used by password recovery. */
const updatePassword = async (id_usuario, contrasena_hash) => {
  const [result] = await pool.query(
    'UPDATE usuarios SET contrasena_hash = ? WHERE id_usuario = ?',
    [contrasena_hash, id_usuario]
  );
  return result.affectedRows;
};

module.exports = {
  ID_ROL_ADMIN,
  ID_ROL_CLIENTE,
  findByEmail,
  existsByEmail,
  existsByUsername,
  existsByPhone,
  create,
  updatePassword,
};