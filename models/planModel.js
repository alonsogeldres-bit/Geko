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

/** Un plan por id, o null. */
const getPlanById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id_tipo_plan, nombre_plan, valor FROM tipo_plan WHERE id_tipo_plan = ?',
    [id]
  );
  if (!rows.length) return null;
  return { id: rows[0].id_tipo_plan, nombre: rows[0].nombre_plan, valor: Number(rows[0].valor) };
};

/** Suscripción por id (cualquier estado), o null. */
const getSubscriptionById = async (idSuscripcion) => {
  const [rows] = await pool.query(
    'SELECT id_suscripcion, id_cliente, id_tipo_plan, estado FROM suscripcion WHERE id_suscripcion = ?',
    [idSuscripcion]
  );
  return rows.length ? rows[0] : null;
};

/** Suscripción pendiente (en checkout) de un plan, o null. */
const getPendingSubscription = async (idCliente, idPlan) => {
  const [rows] = await pool.query(
    `SELECT id_suscripcion, id_tipo_plan, estado
       FROM suscripcion
      WHERE id_cliente = ? AND id_tipo_plan = ? AND estado = 'Pendiente'
      ORDER BY id_suscripcion DESC
      LIMIT 1`,
    [idCliente, idPlan]
  );
  return rows.length ? rows[0] : null;
};

/**
 * Crea la suscripción pendiente + su pago pendiente (transaccional).
 * Idempotente: si ya existe un pendiente del mismo plan lo reutiliza.
 * Requiere la migración sql/migracion-plan-premium.sql (estado 'Pendiente').
 */
const createPendingSubscription = async (idCliente, idPlan, monto) => {
  const existente = await getPendingSubscription(idCliente, idPlan);
  if (existente) return { id: existente.id_suscripcion };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO suscripcion (id_cliente, id_tipo_plan, fecha_inicio, fecha_termino, estado)
       VALUES (?, ?, NULL, NULL, 'Pendiente')`,
      [idCliente, idPlan]
    );
    const idSuscripcion = result.insertId;

    await conn.query(
      `INSERT INTO pago (id_suscripcion, monto, fecha_pago, estado)
       VALUES (?, ?, CURDATE(), 'Pendiente')`,
      [idSuscripcion, monto]
    );

    await conn.commit();
    return { id: idSuscripcion };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Activa la suscripción una vez aprobado el pago (transaccional).
 * Idempotente: solo activa si está 'Pendiente'; si ya está activa no
 * extiende fechas (evita que reintentos de webhook alarguen el plan).
 * Cancela otras suscripciones activas del mismo cliente.
 */
const activateSubscription = async (idSuscripcion, idCliente) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE suscripcion
          SET estado = 'Activa',
              fecha_inicio = CURDATE(),
              fecha_termino = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
        WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
      [idSuscripcion]
    );

    if (result.affectedRows > 0) {
      await conn.query(
        `UPDATE pago SET estado = 'Pagado'
          WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
        [idSuscripcion]
      );
      if (idCliente) {
        await conn.query(
          `UPDATE suscripcion SET estado = 'Cancelada'
            WHERE id_cliente = ? AND id_suscripcion <> ? AND estado = 'Activa'`,
          [idCliente, idSuscripcion]
        );
      }
    }

    await conn.commit();
    return result.affectedRows > 0;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  getPlanById,
  getSubscriptionById,
  getPendingSubscription,
  createPendingSubscription,
  activateSubscription,
  getActiveSubscription,
  getEffectivePlan,
  activateFree,
  debeMostrarPlanes,
};
