/* ===========================================
   MODELO DEL DASHBOARD
   Solo LEE. No escribe, no altera el esquema.
   Lee las tablas que ya existen y que llena el
   wizard de /profile: clientes, objetivo,
   preferencia_entrenamiento, mediciones,
   ficha_antecedente y cliente_equipamiento.
   =========================================== */

const pool = require('../config/db');

/* Cache de los nombres de tabla existentes.
   Sirve para trabajar de forma tolerante: si una tabla opcional todavía
   no está creada en la base, el dashboard degrada a estado vacío en vez
   de romperse. Se refresca una vez por minuto, así una tabla creada más
   tarde se empieza a usar sin necesidad de reiniciar el servidor. */
const CACHE_TTL_MS = 60 * 1000;
let cacheTablas = { set: null, cuando: 0 };

const tablaExiste = async (nombre) => {
  const ahora = Date.now();

  if (!cacheTablas.set || ahora - cacheTablas.cuando > CACHE_TTL_MS) {
    const [rows] = await pool.query('SHOW TABLES');
    cacheTablas = {
      set: new Set(rows.map((r) => Object.values(r)[0])),
      cuando: ahora,
    };
  }

  return cacheTablas.set.has(nombre);
};

/**
 * Perfil de entrenamiento del cliente.
 * Devuelve `null` si el usuario todavía no completó el wizard de /profile.
 */
const getPerfil = async (idUsuario) => {
  const [clientes] = await pool.query(
    `SELECT c.id_cliente,
            c.observacion_objetivo,
            o.nombre_objetivo
       FROM clientes c
       LEFT JOIN objetivo o ON o.id_objetivo = c.id_objetivo
      WHERE c.id_usuario = ?`,
    [idUsuario]
  );

  if (!clientes.length) return null;

  const cliente = clientes[0];
  const idCliente = cliente.id_cliente;

  const [preferencias] = await pool.query(
    `SELECT entorno, dias_semana, minutos_sesion
       FROM preferencia_entrenamiento
      WHERE id_cliente = ?`,
    [idCliente]
  );

  // Solo la medición más reciente: es la que describe cómo está hoy.
  const [mediciones] = await pool.query(
    `SELECT nivel_fisico, altura_cm, peso_kg
       FROM mediciones
      WHERE id_ficha = (SELECT id_ficha FROM ficha_medica WHERE id_cliente = ?)
      ORDER BY fecha_medicion DESC, id_medicion DESC
      LIMIT 1`,
    [idCliente]
  );

  const [lesiones] = await pool.query(
    `SELECT a.nombre
       FROM ficha_antecedente fa
       INNER JOIN antecedente a ON a.id_antecedente = fa.id_antecedente
      WHERE fa.id_ficha = (SELECT id_ficha FROM ficha_medica WHERE id_cliente = ?)
      ORDER BY a.nombre`,
    [idCliente]
  );

  const [equipamiento] = await pool.query(
    `SELECT e.nombre
       FROM cliente_equipamiento ce
       INNER JOIN equipamiento e ON e.id_equipamiento = ce.id_equipamiento
      WHERE ce.id_cliente = ?
      ORDER BY e.nombre`,
    [idCliente]
  );

  const pref = preferencias[0] || null;
  const med = mediciones[0] || null;

  return {
    idCliente,
    objetivo: cliente.nombre_objetivo || null,
    observacionObjetivo: cliente.observacion_objetivo || null,
    entorno: pref ? pref.entorno : null,
    diasSemana: pref ? pref.dias_semana : null,
    minutosSesion: pref ? pref.minutos_sesion : null,
    nivelFisico: med ? med.nivel_fisico : null,
    alturaCm: med ? Number(med.altura_cm) : null,
    pesoKg: med ? Number(med.peso_kg) : null,
    lesiones: lesiones.map((l) => l.nombre),
    equipamiento: equipamiento.map((e) => e.nombre),
  };
};

/**
 * Historial de entrenamientos del cliente.
 * La tabla que lo guarda todavía no existe en la base, así que por ahora
 * devuelve el arreglo vacío. Cuando exista, esta función la usa tal cual.
 */
const getSesiones = async (idCliente) => {
  if (!(await tablaExiste('sesion_entrenamiento'))) return [];

  const [rows] = await pool.query(
    `SELECT id_sesion, fecha, titulo, duracion_segundos, ejercicios_completados
       FROM sesion_entrenamiento
      WHERE id_cliente = ?
      ORDER BY fecha DESC
      LIMIT 60`,
    [idCliente]
  );

  return rows;
};

module.exports = {
  getPerfil,
  getSesiones,
};
