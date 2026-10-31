/* ===========================================
   MODELO DE PROGRESO
   Solo LEE y escribe mediciones nuevas. No altera
   el esquema ni las sesiones existentes.
   =========================================== */

const pool = require('../config/db');

const TABLA_SESIONES = 'sesion_entrenamiento';

const getSesiones = async (idCliente, limite = 500) => {
  if (!idCliente) return [];
  const [rows] = await pool.query(
    {
      sql: `SELECT id_sesion, id_cliente, fecha, titulo, duracion_segundos,
                   ejercicios_completados, ejercicios_total, detalle_json, creado_en
              FROM ${TABLA_SESIONES}
             WHERE id_cliente = ?
             ORDER BY fecha DESC, id_sesion DESC
             LIMIT ?`,
      dateStrings: true,
    },
    [idCliente, Math.max(1, Math.min(Number(limite) || 500, 2000))]
  );
  return rows;
};

const getMediciones = async (idCliente, limite = 100) => {
  if (!idCliente) return [];
  const [rows] = await pool.query(
    {
      sql: `SELECT m.id_medicion, m.id_ficha, m.nivel_fisico, m.altura_cm,
                   m.peso_kg, m.fecha_medicion, m.creado_en
              FROM mediciones m
             INNER JOIN ficha_medica f ON f.id_ficha = m.id_ficha
             WHERE f.id_cliente = ?
             ORDER BY m.fecha_medicion DESC, m.id_medicion DESC
             LIMIT ?`,
      dateStrings: true,
    },
    [idCliente, Math.max(1, Math.min(Number(limite) || 100, 500))]
  );
  return rows;
};

const getFichaByCliente = async (idCliente) => {
  if (!idCliente) return null;
  const [rows] = await pool.query(
    'SELECT id_ficha FROM ficha_medica WHERE id_cliente = ? LIMIT 1',
    [idCliente]
  );
  return rows.length ? rows[0].id_ficha : null;
};

const ensureFicha = async (idCliente) => {
  let idFicha = await getFichaByCliente(idCliente);
  if (idFicha) return idFicha;
  const [res] = await pool.query(
    'INSERT INTO ficha_medica (id_cliente) VALUES (?)',
    [idCliente]
  );
  return res.insertId;
};

const registrarMedicion = async (idCliente, { nivelFisico, alturaCm, pesoKg }) => {
  const idFicha = await ensureFicha(idCliente);
  const [res] = await pool.query(
    `INSERT INTO mediciones (id_ficha, nivel_fisico, altura_cm, peso_kg, fecha_medicion)
     VALUES (?, ?, ?, ?, NOW())`,
    [idFicha, nivelFisico, alturaCm, pesoKg]
  );
  return res.insertId;
};

module.exports = {
  getSesiones,
  getMediciones,
  getFichaByCliente,
  ensureFicha,
  registrarMedicion,
};
