/* ===========================================
   MODELO DE PLANES
   Lee el catálogo `tipo_plan` y las suscripciones del cliente,
   y activa el plan gratuito. Todo con las tablas que ya existen.
   =========================================== */

const pool = require('../config/db');

const PLAN_GRATIS = 'Gratis';

/** id_cliente del usuario, o null si todavía no completó el perfil. */
const getClienteByUser = async (idUsuario) => {
  const [rows] = await pool.query(
    'SELECT id_cliente FROM clientes WHERE id_usuario = ?',
    [idUsuario]
  );
  return rows.length ? rows[0].id_cliente : null;
};

/** Catálogo de planes, del más barato al más caro. */
const listPlans = async () => {
  const [rows] = await pool.query(
    'SELECT id_tipo_plan, nombre_plan, valor FROM tipo_plan ORDER BY valor ASC, id_tipo_plan ASC'
  );
  return rows.map((r) => ({
    id: r.id_tipo_plan,
    nombre: r.nombre_plan,
    valor: Number(r.valor),
  }));
};

/** Un plan por nombre, o null. */
const getPlanByName = async (nombre) => {
  const [rows] = await pool.query(
    'SELECT id_tipo_plan, nombre_plan, valor FROM tipo_plan WHERE nombre_plan = ?',
    [nombre]
  );
  if (!rows.length) return null;
  return { id: rows[0].id_tipo_plan, nombre: rows[0].nombre_plan, valor: Number(rows[0].valor) };
};

/** Suscripción activa (vigente) del cliente, o null. */
const getActiveSubscription = async (idCliente) => {
  const [rows] = await pool.query(
    `SELECT s.id_suscripcion, s.fecha_inicio, s.fecha_termino,
            tp.id_tipo_plan, tp.nombre_plan, tp.valor
       FROM suscripcion s
       INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
      WHERE s.id_cliente = ?
        AND s.estado = 'Activa'
        AND (s.fecha_termino IS NULL OR s.fecha_termino >= CURDATE())
      ORDER BY s.fecha_inicio DESC, s.id_suscripcion DESC
      LIMIT 1`,
    [idCliente]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id_suscripcion,
    nombre: r.nombre_plan,
    valor: Number(r.valor),
    fechaInicio: r.fecha_inicio,
    fechaTermino: r.fecha_termino,
  };
};

/** Plan efectivo del cliente: su suscripción activa o Gratis por defecto. */
const getEffectivePlan = async (idCliente) => {
  const suscripcion = await getActiveSubscription(idCliente);
  if (suscripcion) {
    return { nombre: suscripcion.nombre, valor: suscripcion.valor, esDePago: suscripcion.valor > 0 };
  }
  return { nombre: PLAN_GRATIS, valor: 0, esDePago: false };
};

/**
 * Activa el plan Gratis para el cliente. Idempotente: si ya tiene una
 * suscripción activa, no crea otra y la devuelve.
 */
const activateFree = async (idCliente) => {
  const existente = await getActiveSubscription(idCliente);
  if (existente) return existente;

  const plan = await getPlanByName(PLAN_GRATIS);
  if (!plan) {
    throw new Error(`El plan "${PLAN_GRATIS}" no está configurado en tipo_plan.`);
  }

  const [result] = await pool.query(
    `INSERT INTO suscripcion (id_cliente, id_tipo_plan, fecha_inicio, fecha_termino, estado)
     VALUES (?, ?, CURDATE(), NULL, 'Activa')`,
    [idCliente, plan.id]
  );

  return {
    id: result.insertId,
    nombre: plan.nombre,
    valor: plan.valor,
    fechaInicio: null,
    fechaTermino: null,
  };
};

/**
 * Trigger diferido de la pantalla de planes. HOY desactivado por decisión
 * de producto: el usuario no debe verse forzado a elegir.
 *
 * Cuando se defina el umbral, evaluar aquí (sin cambiar el esquema):
 *   - tiempo de uso: clientes.creado_en + N días <= NOW()
 *   - primera rutina: exista una fila en sesion_entrenamiento (EP-011)
 * Debe devolver true solo si NO hay suscripción activa y se cumplió el trigger.
 */
const debeMostrarPlanes = async (idCliente) => {
  const suscripcion = await getActiveSubscription(idCliente);
  if (suscripcion) return false;
  return false;
};

module.exports = {
  PLAN_GRATIS,
  getClienteByUser,
  listPlans,
  getPlanByName,
  getActiveSubscription,
  getEffectivePlan,
  activateFree,
  debeMostrarPlanes,
};
