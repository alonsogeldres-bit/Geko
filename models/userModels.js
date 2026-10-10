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

const create = async ({
  nombre,
  apellido,
  nombre_usuario,
  correo,
  numero,
  contrasena_hash,
  fecha_nacimiento,
  usuario_proveedor = 'local',
}) => {
  const [result] = await pool.query(
    `INSERT INTO usuarios
       (id_rol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario, fecha_nacimiento, usuario_proveedor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ID_ROL_CLIENTE, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario, fecha_nacimiento, usuario_proveedor]
  );
  return result;
};


const updatePassword = async (id_usuario, contrasena_hash) => {
  const [result] = await pool.query(
    "UPDATE usuarios SET contrasena_hash = ? WHERE id_usuario = ? AND usuario_proveedor = 'local'",
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