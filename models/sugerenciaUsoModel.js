/* ===========================================
   MODELO DE USO SEMANAL DE SUGERENCIAS
   - El plan Gratis ve 3 variantes de la sugerencia del día por semana.
   - La semana empieza el lunes (00:00); no hace falta reiniciar nada:
     las filas de semanas anteriores simplemente dejan de consultarse.
   - El plan de pago (Premium) no usa este modelo: es ilimitado.
   =========================================== */

const pool = require('../config/db');

/* Variantes que puede ver el plan Gratis cada semana (1/3, 2/3, 3/3). */
const LIMITE_SEMANAL = 3;

/* Lunes de la semana actual, calculado en MySQL para usar su fecha. */
const SEMANA_INICIO_SQL = 'DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)';

/* Las filas de más de 8 semanas ya no aportan nada. */
const SEMANAS_HISTORIAL = 8;
const LIMPIEZA_MS = 60 * 60 * 1000;
let ultimaLimpieza = 0;

/** Deja el índice dentro del rango válido (1..3). */
const limitar = (valor) => {
  const n = Number(valor) || 1;
  return Math.min(LIMITE_SEMANAL, Math.max(1, n));
};

/** Forma común de respuesta para el controlador. */
const mapUso = (indice) => {
  const actual = limitar(indice);
  return {
    indice: actual,
    limite: LIMITE_SEMANAL,
    restantes: Math.max(0, LIMITE_SEMANAL - actual),
  };
};

/**
 * Uso de la semana actual: { indice, limite, restantes }.
 * Sin fila (primera visita de la semana) el índice es 1: se muestra 1/3.
 */
const getUso = async (idCliente) => {
  const [rows] = await pool.query(
    `SELECT ultimo_indice
       FROM uso_sugerencia
      WHERE id_cliente = ?
        AND semana_inicio = ${SEMANA_INICIO_SQL}
      LIMIT 1`,
    [idCliente]
  );

  return mapUso(rows.length ? rows[0].ultimo_indice : 1);
};

/** Borra el historial viejo como máximo una vez por hora (no bloquea). */
const limpiarSemanasAntiguas = async () => {
  if (Date.now() - ultimaLimpieza < LIMPIEZA_MS) return;
  ultimaLimpieza = Date.now();

  try {
    await pool.query(
      `DELETE FROM uso_sugerencia
        WHERE semana_inicio < DATE_SUB(CURDATE(), INTERVAL ${SEMANAS_HISTORIAL} WEEK)`
    );
  } catch (err) {
    console.error('[sugerencia] no se pudo limpiar el historial:', err.message);
  }
};

/**
 * Avanza a la siguiente variante de la semana (transaccional).
 *
 * Devuelve { existe, indice, limite, restantes, alcanzado }:
 * - existe = false    → el cliente no existe.
 * - alcanzado = false → ya se puede mostrar la variante `indice`.
 * - alcanzado = true  → ya estaba en 3/3; no se consume nada más.
 *
 * El bloqueo sobre `clientes` serializa los clics del mismo usuario,
 * así dos pestañas no pueden pasar del límite.
 */
const avanzarUso = async (idCliente) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [clientes] = await conn.query(
      'SELECT id_cliente FROM clientes WHERE id_cliente = ? FOR UPDATE',
      [idCliente]
    );

    if (!clientes.length) {
      await conn.rollback();
      return { existe: false };
    }

    const [rows] = await conn.query(
      `SELECT id_uso, ultimo_indice
         FROM uso_sugerencia
        WHERE id_cliente = ?
          AND semana_inicio = ${SEMANA_INICIO_SQL}
        FOR UPDATE`,
      [idCliente]
    );

    // Primera visita de la semana: ya se mostró la variante 1.
    const actual = rows.length ? limitar(rows[0].ultimo_indice) : 1;

    if (actual >= LIMITE_SEMANAL) {
      await conn.commit();
      return { existe: true, ...mapUso(actual), alcanzado: true };
    }

    const nuevo = actual + 1;

    if (rows.length) {
      await conn.query(
        'UPDATE uso_sugerencia SET ultimo_indice = ? WHERE id_uso = ?',
        [nuevo, rows[0].id_uso]
      );
    } else {
      await conn.query(
        `INSERT INTO uso_sugerencia (id_cliente, semana_inicio, ultimo_indice)
         VALUES (?, ${SEMANA_INICIO_SQL}, ?)`,
        [idCliente, nuevo]
      );
    }

    await conn.commit();
    await limpiarSemanasAntiguas();

    return { existe: true, ...mapUso(nuevo), alcanzado: false };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  LIMITE_SEMANAL,
  getUso,
  avanzarUso,
};
