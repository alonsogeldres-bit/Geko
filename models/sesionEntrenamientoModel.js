/* ===========================================
   MODELO DE SESIONES DE ENTRENAMIENTO
   Escribe en `sesion_entrenamiento`, la misma tabla que lee el
   dashboard (DashboardModel.getSesiones) para calcular la racha.
   Una fila = un entrenamiento terminado.
   =========================================== */

const pool = require('../config/db');

/* Misma lógica de fecha local que usa RoutineModel.aFechaISO. */
const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const entero = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};

/**
 * Registra un entrenamiento terminado. Todos los datos salvo idCliente son
 * opcionales: con solo el idCliente ya suma el día a la racha.
 */
const registrar = async ({ idCliente, titulo, duracionSegundos, ejerciciosCompletados }) => {
  const [res] = await pool.query(
    `INSERT INTO sesion_entrenamiento
       (id_cliente, fecha, titulo, duracion_segundos, ejercicios_completados)
     VALUES (?, ?, ?, ?, ?)`,
    [
      idCliente,
      hoyISO(),
      titulo ? String(titulo).slice(0, 120) : null,
      entero(duracionSegundos, 86400),
      entero(ejerciciosCompletados, 500),
    ]
  );
  return res.insertId;
};

module.exports = { registrar };