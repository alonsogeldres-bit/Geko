const pool = require('../config/db');

const ID_ROL_ADMIN = 1;
const ID_ROL_CLIENTE = 2;
const ID_ROL_SUPERADMIN = 3;

const findByEmail = async (correo) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
  return rows[0] || null;
};

const findById = async (id_usuario) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id_usuario]);
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

/* ---------- Datos de cuenta (configuración) ---------- */

// dateStrings evita el corrimiento de zona horaria en fecha_nacimiento (DATE).
const getAccountById = async (id_usuario) => {
  const [rows] = await pool.query(
    {
      sql: `SELECT id_usuario, nombre, apellido, correo, numero, nombre_usuario,
                   sexo, fecha_nacimiento, usuario_proveedor, id_rol
              FROM usuarios
             WHERE id_usuario = ?`,
      dateStrings: true,
    },
    [id_usuario]
  );
  return rows[0] || null;
};

const updateAccount = async (id_usuario, { nombre, apellido, correo, numero, nombre_usuario, fecha_nacimiento }) => {
  const [result] = await pool.query(
    `UPDATE usuarios
        SET nombre = ?, apellido = ?, correo = ?, numero = ?,
            nombre_usuario = ?, fecha_nacimiento = ?
      WHERE id_usuario = ?`,
    [nombre, apellido, correo, numero, nombre_usuario, fecha_nacimiento, id_usuario]
  );
  return result.affectedRows;
};

// Variantes "excepto yo": al editar, el valor actual del propio usuario no cuenta como duplicado.
const existsByEmailExcept = async (correo, id_usuario) => {
  const [rows] = await pool.query(
    'SELECT id_usuario FROM usuarios WHERE correo = ? AND id_usuario <> ?',
    [correo, id_usuario]
  );
  return rows.length > 0;
};

const existsByUsernameExcept = async (nombre_usuario, id_usuario) => {
  const [rows] = await pool.query(
    'SELECT id_usuario FROM usuarios WHERE nombre_usuario = ? AND id_usuario <> ?',
    [nombre_usuario, id_usuario]
  );
  return rows.length > 0;
};

const existsByPhoneExcept = async (numero, id_usuario) => {
  const [rows] = await pool.query(
    'SELECT id_usuario FROM usuarios WHERE numero = ? AND id_usuario <> ?',
    [numero, id_usuario]
  );
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
  ID_ROL_SUPERADMIN,
  findByEmail,
  findById,
  existsByEmail,
  existsByUsername,
  existsByPhone,
  getAccountById,
  updateAccount,
  existsByEmailExcept,
  existsByUsernameExcept,
  existsByPhoneExcept,
  create,
  updatePassword,
};