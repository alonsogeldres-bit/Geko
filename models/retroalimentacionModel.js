/* ===========================================
   MODELO DE RETROALIMENTACIÓN DE SESIONES
   Cuestionario post-entrenamiento: esfuerzo, molestias, satisfacción
   y la recomendación que el sistema genera con esas respuestas.

   Escribe en `retroalimentacion_sesion` (UNIQUE id_cliente + fecha).
   Las LECTURAS son tolerantes: si la tabla todavía no existe (base sin
   migrar), devuelven null / [] en vez de romper la página que las usa.
   Las ESCRITURAS sí lanzan el error para que el controlador responda.
   =========================================== */

const pool = require('../config/db');

const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const dias = (v, porDefecto = 7) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : porDefecto;
};

/** mysql2 devuelve JSON como objeto o como texto, según la versión. */
const parsearJson = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch (err) {
    return null;
  }
};

/** Zonas válidas del catálogo (rodilla, espalda...), sin repeticiones. */
const limpiarMolestias = (valor) => {
  const lista = Array.isArray(valor) ? valor : parsearJson(valor) || [];
  const zonas = lista.map((z) => String(z || '').trim().toLowerCase()).filter(Boolean);
  return [...new Set(zonas)].slice(0, 8);
};

/** Fila cruda -> objeto listo para las vistas y los servicios. */
const mapear = (fila) => ({
  id: fila.id_retroalimentacion,
  idCliente: fila.id_cliente,
  fecha: fila.fecha instanceof Date ? fila.fecha.toISOString().slice(0, 10) : String(fila.fecha || ''),
  estado: fila.estado,
  esfuerzo: fila.esfuerzo,
  satisfaccion: fila.satisfaccion,
  molestias: limpiarMolestias(fila.molestias_json),
  comentario: fila.comentario || null,
  recomendacion: fila.recomendacion || null,
  origen: fila.origen || null,
  aplicada: Boolean(fila.aplicada),
  ajustes: parsearJson(fila.ajustes_json) || [],
  respondidaEn: fila.respondida_en || null,
});

/**
 * Guarda (o actualiza) las respuestas del cuestionario de un día.
 * Si ese día se había omitido el cuestionario, pasa a Respondida.
 */
const guardarRespuestas = async ({
  idCliente,
  fecha,
  esfuerzo,
  satisfaccion,
  molestias,
  comentario,
  recomendacion,
  origen,
}) => {
  const valores = [
    idCliente,
    fecha || hoyISO(),
    'Respondida',
    esfuerzo,
    satisfaccion,
    molestias && molestias.length ? JSON.stringify(molestias) : null,
    comentario,
    recomendacion,
    origen || 'respaldo',
  ];

  const [res] = await pool.query(
    `INSERT INTO retroalimentacion_sesion
       (id_cliente, fecha, estado, esfuerzo, satisfaccion, molestias_json,
        comentario, recomendacion, origen, respondida_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       estado = 'Respondida',
       esfuerzo = VALUES(esfuerzo),
       satisfaccion = VALUES(satisfaccion),
       molestias_json = VALUES(molestias_json),
       comentario = VALUES(comentario),
       recomendacion = VALUES(recomendacion),
       origen = VALUES(origen),
       respondida_en = CURRENT_TIMESTAMP,
       aplicada = 0,
       ajustes_json = NULL`,
    valores
  );

  return res.insertId || res.affectedRows;
};

/** Marca el cuestionario de un día como omitido (no obliga a responderlo). */
const marcarOmitida = async (idCliente, fecha) => {
  const [res] = await pool.query(
    `INSERT INTO retroalimentacion_sesion (id_cliente, fecha, estado)
     VALUES (?, ?, 'Omitida')
     ON DUPLICATE KEY UPDATE estado = 'Omitida'`,
    [idCliente, fecha || hoyISO()]
  );
  return res.insertId || res.affectedRows;
};

/** ¿Ya existe un cuestionario (respondido u omitido) para hoy? */
const getDeHoy = async (idCliente) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM retroalimentacion_sesion
       WHERE id_cliente = ? AND fecha = ? LIMIT 1`,
      [idCliente, hoyISO()]
    );
    return rows.length ? mapear(rows[0]) : null;
  } catch (err) {
    console.error('[retro] no se pudo leer el cuestionario de hoy:', err.message);
    return null;
  }
};

/**
 * Última sesión que quedó SIN contestar (ni respondida ni omitida) dentro
 * de la ventana. Es el aviso "tienes un cuestionario pendiente" del
 * dashboard: si el usuario lo omitió, ya no se lo recordamos ahí.
 * Devuelve { fecha, titulo } o null.
 */
const getPendiente = async (idCliente, ventanaDias = 7) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.fecha, s.titulo
         FROM sesion_entrenamiento s
         LEFT JOIN retroalimentacion_sesion r
           ON r.id_cliente = s.id_cliente AND r.fecha = s.fecha
        WHERE s.id_cliente = ?
          AND s.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND r.id_retroalimentacion IS NULL
        ORDER BY s.fecha DESC, s.id_sesion DESC
        LIMIT 1`,
      [idCliente, dias(ventanaDias)]
    );
    return rows.length
      ? {
          fecha: rows[0].fecha instanceof Date ? rows[0].fecha.toISOString().slice(0, 10) : String(rows[0].fecha),
          titulo: rows[0].titulo || 'Entrenamiento',
        }
      : null;
  } catch (err) {
    console.error('[retro] no se pudo leer el cuestionario pendiente:', err.message);
    return null;
  }
};

/**
 * Última sesión que todavía SE PUEDE contestar: sin fila, o marcada como
 * Omitida (el usuario dijo "más tarde"). Lo usa la página
 * /entrenamiento/retroalimentacion y el acceso desde Mi progreso.
 * Devuelve { fecha, titulo } o null.
 */
const getRespondible = async (idCliente, ventanaDias = 7) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.fecha, s.titulo
         FROM sesion_entrenamiento s
         LEFT JOIN retroalimentacion_sesion r
           ON r.id_cliente = s.id_cliente AND r.fecha = s.fecha
        WHERE s.id_cliente = ?
          AND s.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND (r.id_retroalimentacion IS NULL OR r.estado = 'Omitida')
        ORDER BY s.fecha DESC, s.id_sesion DESC
        LIMIT 1`,
      [idCliente, dias(ventanaDias)]
    );
    return rows.length
      ? {
          fecha: rows[0].fecha instanceof Date ? rows[0].fecha.toISOString().slice(0, 10) : String(rows[0].fecha),
          titulo: rows[0].titulo || 'Entrenamiento',
        }
      : null;
  } catch (err) {
    console.error('[retro] no se pudo leer el cuestionario respondible:', err.message);
    return null;
  }
};

/**
 * Retroalimentación respondida más reciente que todavía no ajustó ninguna
 * rutina (aplicada = 0). La busca la generación de la próxima rutina para
 * aplicar los ajustes sugeridos (esfuerzo, molestias) una sola vez.
 */
const getPendienteAplicar = async (idCliente, ventanaDias = 14) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM retroalimentacion_sesion
       WHERE id_cliente = ?
         AND estado = 'Respondida'
         AND aplicada = 0
         AND fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY fecha DESC, id_retroalimentacion DESC
       LIMIT 1`,
      [idCliente, dias(ventanaDias, 14)]
    );
    return rows.length ? mapear(rows[0]) : null;
  } catch (err) {
    console.error('[retro] no se pudo leer la retroalimentación por aplicar:', err.message);
    return null;
  }
};

/** Marca una retroalimentación como aplicada, junto con el resumen de ajustes. */
const marcarAplicada = async (id, ajustes) => {
  const [res] = await pool.query(
    `UPDATE retroalimentacion_sesion
        SET aplicada = 1, ajustes_json = ?
      WHERE id_retroalimentacion = ?`,
    [ajustes && ajustes.length ? JSON.stringify(ajustes) : null, id]
  );
  return res.affectedRows;
};

/**
 * Última recomendación generada (para la tarjeta "Consejo de Geko" de
 * /entrenamiento). Solo filas respondidas con recomendación.
 */
const getUltimaRecomendacion = async (idCliente, ventanaDias = 14) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM retroalimentacion_sesion
       WHERE id_cliente = ?
         AND estado = 'Respondida'
         AND recomendacion IS NOT NULL
         AND fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY fecha DESC, id_retroalimentacion DESC
       LIMIT 1`,
      [idCliente, dias(ventanaDias, 14)]
    );
    return rows.length ? mapear(rows[0]) : null;
  } catch (err) {
    console.error('[retro] no se pudo leer la última recomendación:', err.message);
    return null;
  }
};

/** Historial de retroalimentaciones respondidas, para /progreso. */
const getHistorial = async (idCliente, limite = 10) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM retroalimentacion_sesion
       WHERE id_cliente = ? AND estado = 'Respondida'
       ORDER BY fecha DESC, id_retroalimentacion DESC
       LIMIT ?`,
      [idCliente, Math.max(1, Math.min(50, Math.round(Number(limite) || 10)))]
    );
    return rows.map(mapear);
  } catch (err) {
    console.error('[retro] no se pudo leer el historial:', err.message);
    return [];
  }
};

module.exports = {
  guardarRespuestas,
  marcarOmitida,
  getDeHoy,
  getPendiente,
  getRespondible,
  getPendienteAplicar,
  marcarAplicada,
  getUltimaRecomendacion,
  getHistorial,
  limpiarMolestias,
};
