/* ===========================================
   MODELO DE SESIONES DE ENTRENAMIENTO
   Escribe en `sesion_entrenamiento`, la misma tabla que lee el
   dashboard (DashboardModel.getSesiones) y /progreso.
   Una fila = un día de entrenamiento (UNIQUE id_cliente+fecha).
   Si se registra más de una sesión el mismo día, se acumulan.
   =========================================== */

const pool = require('../config/db');

const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const entero = (v, max, fallback = 0) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const esfuerzoValido = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : null;
};

/**
 * Registra un entrenamiento terminado. Todos los datos salvo idCliente son
 * opcionales. Si ya existe una fila para hoy, acumula duración y ejercicios
 * en vez de fallar por la restricción UNIQUE.
 */
const registrar = async ({ idCliente, titulo, duracionSegundos, ejerciciosCompletados, ejerciciosTotal, esfuerzo }) => {
  const [res] = await pool.query(
    `INSERT INTO sesion_entrenamiento
       (id_cliente, fecha, titulo, duracion_segundos, ejercicios_completados, ejercicios_total, esfuerzo_percibido)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       titulo = COALESCE(VALUES(titulo), titulo),
       duracion_segundos = duracion_segundos + VALUES(duracion_segundos),
       ejercicios_completados = ejercicios_completados + VALUES(ejercicios_completados),
       ejercicios_total = GREATEST(ejercicios_total, VALUES(ejercicios_total)),
       esfuerzo_percibido = COALESCE(VALUES(esfuerzo_percibido), esfuerzo_percibido),
       actualizado_en = CURRENT_TIMESTAMP`,
    [
      idCliente,
      hoyISO(),
      titulo ? String(titulo).slice(0, 120) : null,
      entero(duracionSegundos, 86400, 0),
      entero(ejerciciosCompletados, 500, 0),
      entero(ejerciciosTotal, 500, 0),
      esfuerzoValido(esfuerzo),
    ]
  );
  return res.insertId || res.affectedRows;
};

/**
 * Guarda (o actualiza) el esfuerzo percibido de la sesión de hoy.
 */
const actualizarEsfuerzoHoy = async (idCliente, esfuerzo) => {
  const valor = esfuerzoValido(esfuerzo);
  if (!valor) return 0;
  const [res] = await pool.query(
    `UPDATE sesion_entrenamiento
        SET esfuerzo_percibido = ?, actualizado_en = CURRENT_TIMESTAMP
      WHERE id_cliente = ? AND fecha = ?`,
    [valor, idCliente, hoyISO()]
  );
  return res.affectedRows;
};

module.exports = { registrar, actualizarEsfuerzoHoy, esfuerzoValido };
