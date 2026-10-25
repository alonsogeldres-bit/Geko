/* ===========================================
   MODELO DE PLANES Y PAGOS (PayPal — pago único)
   - Lee el catálogo `tipo_plan` y las suscripciones del cliente.
   - Crea el checkout pendiente y lo vincula a la orden de PayPal.
   - Activa, rechaza y expira suscripciones de forma idempotente.
   Requiere que la base tenga aplicado el esquema de sql/schema.sql.
   =========================================== */

const pool = require('../config/db');

const PLAN_GRATIS = 'Gratis';

/* Un pendiente sin orden se reutiliza durante 24 h. */
const VENTANA_REUTILIZACION_MIN = 24 * 60;
/* Una orden en vuelo bloquea un checkout nuevo durante 15 min. */
const VENTANA_CHECKOUT_MIN = 15;
/* Los pendientes viejos se cancelan automáticamente. */
const VENTANA_ABANDONO_HORAS = 24;

/* La limpieza diferida corre como máximo una vez por minuto. */
const LIMPIEZA_MS = 60 * 1000;
let ultimaLimpieza = 0;

const mapPlan = (r) => ({
  id: r.id_tipo_plan,
  nombre: r.nombre_plan,
  valor: Number(r.valor),
  precioUsd: r.precio_usd === null || r.precio_usd === undefined ? null : Number(r.precio_usd),
});

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
    `SELECT id_tipo_plan, nombre_plan, valor, precio_usd
       FROM tipo_plan
      ORDER BY valor ASC, id_tipo_plan ASC`
  );
  return rows.map(mapPlan);
};

/** Un plan por nombre, o null. */
const getPlanByName = async (nombre) => {
  const [rows] = await pool.query(
    `SELECT id_tipo_plan, nombre_plan, valor, precio_usd
       FROM tipo_plan
      WHERE nombre_plan = ?`,
    [nombre]
  );
  return rows.length ? mapPlan(rows[0]) : null;
};

/** Un plan por id, o null. */
const getPlanById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id_tipo_plan, nombre_plan, valor, precio_usd
       FROM tipo_plan
      WHERE id_tipo_plan = ?`,
    [id]
  );
  return rows.length ? mapPlan(rows[0]) : null;
};

/** Suscripción por id (cualquier estado), o null. */
const getSubscriptionById = async (idSuscripcion) => {
  const [rows] = await pool.query(
    `SELECT id_suscripcion, id_cliente, id_tipo_plan, estado,
            fecha_inicio, fecha_termino
       FROM suscripcion
      WHERE id_suscripcion = ?`,
    [idSuscripcion]
  );
  return rows.length ? rows[0] : null;
};

/** Último pago de una suscripción (con datos del cliente), o null. */
const getPaymentBySubscription = async (idSuscripcion) => {
  const [rows] = await pool.query(
    `SELECT p.id_pago, p.id_suscripcion, p.paypal_order_id,
            p.monto, p.moneda, p.estado,
            s.id_cliente, s.id_tipo_plan, s.estado AS estado_suscripcion
       FROM pago p
       INNER JOIN suscripcion s ON s.id_suscripcion = p.id_suscripcion
      WHERE p.id_suscripcion = ?
      ORDER BY p.id_pago DESC
      LIMIT 1`,
    [idSuscripcion]
  );
  return rows.length ? rows[0] : null;
};

/** Pago (y suscripción) asociado a una orden de PayPal, o null. */
const getByPaypalOrderId = async (orderId) => {
  const [rows] = await pool.query(
    `SELECT p.id_pago, p.id_suscripcion, p.paypal_order_id,
            p.monto, p.moneda, p.estado, p.estado AS estado_pago,
            s.id_cliente, s.id_tipo_plan, s.estado AS estado_suscripcion
       FROM pago p
       INNER JOIN suscripcion s ON s.id_suscripcion = p.id_suscripcion
      WHERE p.paypal_order_id = ?
      LIMIT 1`,
    [orderId]
  );
  return rows.length ? rows[0] : null;
};

/**
 * Prepara el checkout de un plan de pago (transaccional).
 *
 * - Si hay una orden de PayPal creada hace < 15 min, no deja abrir otra
 *   (evita el doble cobro con dos pestañas).
 * - Si hay un pendiente sin orden y reciente, lo reutiliza.
 * - En cualquier otro caso cancela los pendientes viejos y crea uno nuevo.
 *
 * Devuelve { id, reutilizada }.
 */
const createPendingCheckout = async (idCliente, idPlan, monto, moneda) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Serializa los checkouts del mismo cliente (evita órdenes duplicadas).
    const [cliente] = await conn.query(
      'SELECT id_cliente FROM clientes WHERE id_cliente = ? FOR UPDATE',
      [idCliente]
    );

    if (!cliente.length) {
      throw new Error('El cliente no existe.');
    }

    const [enVuelo] = await conn.query(
      `SELECT s.id_suscripcion
         FROM suscripcion s
         INNER JOIN pago p ON p.id_suscripcion = s.id_suscripcion
        WHERE s.id_cliente = ?
          AND s.estado = 'Pendiente'
          AND p.paypal_order_id IS NOT NULL
          AND s.creado_en >= DATE_SUB(NOW(), INTERVAL ${VENTANA_CHECKOUT_MIN} MINUTE)
        LIMIT 1`,
      [idCliente]
    );

    if (enVuelo.length) {
      const err = new Error('CHECKOUT_EN_PROCESO');
      err.code = 'CHECKOUT_EN_PROCESO';
      throw err;
    }

    const [reutilizable] = await conn.query(
      `SELECT s.id_suscripcion
         FROM suscripcion s
         INNER JOIN pago p ON p.id_suscripcion = s.id_suscripcion
        WHERE s.id_cliente = ?
          AND s.id_tipo_plan = ?
          AND s.estado = 'Pendiente'
          AND p.paypal_order_id IS NULL
          AND s.creado_en >= DATE_SUB(NOW(), INTERVAL ${VENTANA_REUTILIZACION_MIN} MINUTE)
        ORDER BY s.id_suscripcion DESC
        LIMIT 1`,
      [idCliente, idPlan]
    );

    if (reutilizable.length) {
      // Si cambió el precio, el pendiente se actualiza antes de cobrar.
      await conn.query(
        `UPDATE pago
            SET monto = ?, moneda = ?
          WHERE id_suscripcion = ?
            AND estado = 'Pendiente'
            AND paypal_order_id IS NULL`,
        [monto, moneda, reutilizable[0].id_suscripcion]
      );

      await conn.commit();
      return { id: reutilizable[0].id_suscripcion, reutilizada: true };
    }

    // Pendientes viejos: se cancelan antes de abrir un checkout nuevo.
    await conn.query(
      `UPDATE suscripcion
          SET estado = 'Cancelada'
        WHERE id_cliente = ?
          AND estado = 'Pendiente'`,
      [idCliente]
    );

    const [result] = await conn.query(
      `INSERT INTO suscripcion (id_cliente, id_tipo_plan, fecha_inicio, fecha_termino, estado)
       VALUES (?, ?, NULL, NULL, 'Pendiente')`,
      [idCliente, idPlan]
    );
    const idSuscripcion = result.insertId;

    await conn.query(
      `INSERT INTO pago (id_suscripcion, paypal_order_id, monto, moneda, fecha_pago, estado)
       VALUES (?, NULL, ?, ?, CURDATE(), 'Pendiente')`,
      [idSuscripcion, monto, moneda]
    );

    await conn.commit();
    return { id: idSuscripcion, reutilizada: false };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Asocia la orden de PayPal al pago pendiente de la suscripción.
 * Devuelve true si la orden quedó asociada (o ya lo estaba) y false si
 * otra petición ganó la carrera y el pago ya tiene otra orden.
 */
const attachPaypalOrder = async (idSuscripcion, orderId) => {
  const [result] = await pool.query(
    `UPDATE pago
        SET paypal_order_id = ?
      WHERE id_suscripcion = ?
        AND paypal_order_id IS NULL
        AND estado = 'Pendiente'`,
    [orderId, idSuscripcion]
  );

  if (result.affectedRows > 0) return true;

  const pago = await getPaymentBySubscription(idSuscripcion);
  return Boolean(pago && pago.paypal_order_id === orderId);
};

/** Cancela un checkout que no llegó a generar orden de PayPal. */
const cancelPendingCheckout = async (idSuscripcion) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE pago SET estado = 'Rechazado'
        WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
      [idSuscripcion]
    );
    await conn.query(
      `UPDATE suscripcion SET estado = 'Cancelada'
        WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
      [idSuscripcion]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Activa la suscripción cuando el pago ya está confirmado (transaccional).
 *
 * Idempotente: solo actúa si la suscripción tiene un pago 'Pendiente'.
 * Admite reactivar una suscripción cancelada por abandono (si el pago
 * finalmente se completó), pero nunca una con pago 'Rechazado'.
 * Cancela otras suscripciones activas o pendientes del mismo cliente.
 */
const activateSubscription = async (idSuscripcion) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [pagos] = await conn.query(
      `SELECT id_pago
         FROM pago
        WHERE id_suscripcion = ? AND estado = 'Pendiente'
        FOR UPDATE`,
      [idSuscripcion]
    );

    if (!pagos.length) {
      await conn.commit();
      return false;
    }

    const [suscripciones] = await conn.query(
      'SELECT id_cliente FROM suscripcion WHERE id_suscripcion = ? LIMIT 1',
      [idSuscripcion]
    );

    if (!suscripciones.length) {
      await conn.rollback();
      return false;
    }

    const idCliente = suscripciones[0].id_cliente;

    await conn.query(
      `UPDATE suscripcion
          SET estado = 'Activa',
              fecha_inicio = CURDATE(),
              fecha_termino = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
        WHERE id_suscripcion = ?`,
      [idSuscripcion]
    );

    await conn.query(
      `UPDATE pago
          SET estado = 'Pagado'
        WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
      [idSuscripcion]
    );

    await conn.query(
      `UPDATE suscripcion
          SET estado = 'Cancelada'
        WHERE id_cliente = ?
          AND id_suscripcion <> ?
          AND estado IN ('Activa', 'Pendiente')`,
      [idCliente, idSuscripcion]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/** Marca un pago como rechazado/cancelado a partir de la orden de PayPal. */
const markPaymentFailed = async (orderId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id_pago, id_suscripcion
         FROM pago
        WHERE paypal_order_id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderId]
    );

    if (!rows.length) {
      await conn.commit();
      return false;
    }

    await conn.query(
      `UPDATE pago SET estado = 'Rechazado'
        WHERE id_pago = ? AND estado = 'Pendiente'`,
      [rows[0].id_pago]
    );

    await conn.query(
      `UPDATE suscripcion SET estado = 'Cancelada'
        WHERE id_suscripcion = ? AND estado = 'Pendiente'`,
      [rows[0].id_suscripcion]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Revierte una suscripción por un reembolso de PayPal.
 * A diferencia de markPaymentFailed, aplica aunque el pago ya esté 'Pagado'.
 */
const markRefunded = async (orderId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id_pago, id_suscripcion
         FROM pago
        WHERE paypal_order_id = ?
        LIMIT 1
        FOR UPDATE`,
      [orderId]
    );

    if (!rows.length) {
      await conn.commit();
      return false;
    }

    await conn.query(
      `UPDATE pago SET estado = 'Rechazado' WHERE id_pago = ?`,
      [rows[0].id_pago]
    );

    await conn.query(
      `UPDATE suscripcion SET estado = 'Cancelada'
        WHERE id_suscripcion = ? AND estado IN ('Activa', 'Pendiente')`,
      [rows[0].id_suscripcion]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Limpieza de estados:
 * - Activas con fecha_termino pasada → 'Vencida'.
 * - Pendientes abandonados (> 24 h) → 'Cancelada'.
 */
const expireSubscriptions = async () => {
  const [vencidas] = await pool.query(
    `UPDATE suscripcion
        SET estado = 'Vencida'
      WHERE estado = 'Activa'
        AND fecha_termino IS NOT NULL
        AND fecha_termino < CURDATE()`
  );

  const [abandonadas] = await pool.query(
    `UPDATE suscripcion
        SET estado = 'Cancelada'
      WHERE estado = 'Pendiente'
        AND creado_en < DATE_SUB(NOW(), INTERVAL ${VENTANA_ABANDONO_HORAS} HOUR)`
  );

  return { vencidas: vencidas.affectedRows, abandonadas: abandonadas.affectedRows };
};

/** Ejecuta la limpieza como máximo una vez por minuto. */
const maybeExpire = async () => {
  if (Date.now() - ultimaLimpieza < LIMPIEZA_MS) return;
  ultimaLimpieza = Date.now();
  try {
    await expireSubscriptions();
  } catch (err) {
    console.error('[planes] error en la limpieza de suscripciones:', err.message);
  }
};

/** Suscripción activa (vigente) del cliente, o null. */
const getActiveSubscription = async (idCliente) => {
  await maybeExpire();

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

/** Checkout pendiente del cliente (para avisar en la vista), o null. */
const getLatestPending = async (idCliente) => {
  await maybeExpire();

  const [rows] = await pool.query(
    `SELECT s.id_suscripcion, s.fecha_inicio, s.fecha_termino, s.estado,
            tp.nombre_plan, tp.valor, p.paypal_order_id
       FROM suscripcion s
       INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
       LEFT JOIN pago p ON p.id_suscripcion = s.id_suscripcion
      WHERE s.id_cliente = ? AND s.estado = 'Pendiente'
      ORDER BY s.id_suscripcion DESC
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
    paypalOrderId: r.paypal_order_id,
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
 * Activa el plan Gratis para el cliente (transaccional).
 * Idempotente: si ya tiene una suscripción activa, no crea otra.
 * Cancela cualquier checkout premium que estuviera pendiente.
 */
const activateFree = async (idCliente) => {
  const existente = await getActiveSubscription(idCliente);
  if (existente) return existente;

  const plan = await getPlanByName(PLAN_GRATIS);
  if (!plan) {
    throw new Error(`El plan "${PLAN_GRATIS}" no está configurado en tipo_plan.`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE suscripcion SET estado = 'Cancelada'
        WHERE id_cliente = ? AND estado = 'Pendiente'`,
      [idCliente]
    );

    const [result] = await conn.query(
      `INSERT INTO suscripcion (id_cliente, id_tipo_plan, fecha_inicio, fecha_termino, estado)
       VALUES (?, ?, CURDATE(), NULL, 'Activa')`,
      [idCliente, plan.id]
    );

    await conn.commit();

    return {
      id: result.insertId,
      nombre: plan.nombre,
      valor: plan.valor,
      fechaInicio: null,
      fechaTermino: null,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Registra un evento de webhook. Devuelve false si ya estaba procesado
 * (idempotencia ante reintentos de PayPal).
 */
const registrarEventoWebhook = async (idEvento, tipo) => {
  try {
    await pool.query(
      'INSERT INTO webhook_evento (id_evento, tipo) VALUES (?, ?)',
      [idEvento, tipo]
    );
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
};

/** Borra un evento para permitir el reintento si el procesamiento falló. */
const eliminarEventoWebhook = async (idEvento) => {
  await pool.query('DELETE FROM webhook_evento WHERE id_evento = ?', [idEvento]);
};

/**
 * Trigger diferido de la pantalla de planes. HOY desactivado por decisión
 * de producto: el usuario no debe verse forzado a elegir.
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
  getPaymentBySubscription,
  getByPaypalOrderId,
  createPendingCheckout,
  attachPaypalOrder,
  cancelPendingCheckout,
  activateSubscription,
  markPaymentFailed,
  markRefunded,
  expireSubscriptions,
  getActiveSubscription,
  getLatestPending,
  getEffectivePlan,
  activateFree,
  registrarEventoWebhook,
  eliminarEventoWebhook,
  debeMostrarPlanes,
};
