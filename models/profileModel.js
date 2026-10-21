const pool = require('../config/db');

/* ===========================================
   Valores permitidos del wizard de /profile.
   Los nombres en español son los que se guardan en la BD
   (catálogos `objetivo`, `antecedente` y `equipamiento`).
   =========================================== */

const GOALS = {
  perder_grasa: 'Perder grasa',
  ganar_musculo: 'Ganar músculo',
  mejorar_condicion: 'Mejorar condición',
  mantener_forma: 'Mantener forma',
};

const LEVELS = { principiante: 'Bajo', intermedio: 'Medio', avanzado: 'Alto' };

const SEX = { masculino: 'M', femenino: 'F', otro: null };

const ENVIRONMENTS = {
  gimnasio: 'Gimnasio',
  casa: 'Casa',
  aire_libre: 'Aire libre',
  mixto: 'Mixto',
};

// "Ninguna" / "Ninguno" no se guardan: significan cero filas.
const INJURIES = ['Rodilla', 'Espalda', 'Hombro', 'Cuello', 'Muñeca', 'Codo'];
const EQUIPMENT = [
  'Mancuernas',
  'Barra',
  'Máquinas',
  'Peso corporal',
  'Bandas elásticas',
  'Cuerda',
  'Banco',
];

const MINUTES_ALLOWED = [15, 30, 45, 60, 75, 90];

// Mismos textos que muestra la página (sin tilde en Miercoles y Sabado).
// En la BD se guardan separados por coma: 'Lunes,Jueves'.
const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

/** Busca el id de un catálogo por nombre; si no existe, lo crea (valor ya validado). */
const findOrCreate = async (conn, table, idColumn, nameColumn, name) => {
  const [rows] = await conn.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE ${nameColumn} = ?`,
    [name]
  );
  if (rows.length) return rows[0].id;

  const [result] = await conn.query(
    `INSERT INTO ${table} (${nameColumn}) VALUES (?)`,
    [name]
  );
  return result.insertId;
};

/**
 * Guarda el perfil completo en una sola transacción:
 * clientes, ficha_medica, mediciones, ficha_antecedente,
 * preferencia_entrenamiento y cliente_equipamiento.
 * `data` ya viene validado por validateProfile.
 */
const saveProfile = async (idUsuario, data) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Objetivo principal: el primero que eligió el usuario
    const idObjetivo = await findOrCreate(
      conn, 'objetivo', 'id_objetivo', 'nombre_objetivo', GOALS[data.goals[0]]
    );

    const observacion = data.injuriesText ? data.injuriesText.slice(0, 250) : null;

    // --- clientes (uno por usuario) ---
    let idCliente;
    const [clientes] = await conn.query(
      'SELECT id_cliente FROM clientes WHERE id_usuario = ?', [idUsuario]
    );
    if (clientes.length) {
      idCliente = clientes[0].id_cliente;
      await conn.query(
        'UPDATE clientes SET id_objetivo = ?, observacion_objetivo = ? WHERE id_cliente = ?',
        [idObjetivo, observacion, idCliente]
      );
    } else {
      const [r] = await conn.query(
        'INSERT INTO clientes (id_usuario, id_objetivo, observacion_objetivo) VALUES (?, ?, ?)',
        [idUsuario, idObjetivo, observacion]
      );
      idCliente = r.insertId;
    }

    // --- sexo (usuarios.sexo es ENUM F/M, nullable) ---
    await conn.query('UPDATE usuarios SET sexo = ? WHERE id_usuario = ?', [SEX[data.sex], idUsuario]);

    // --- ficha_medica (una por cliente) ---
    let idFicha;
    const [fichas] = await conn.query(
      'SELECT id_ficha FROM ficha_medica WHERE id_cliente = ?', [idCliente]
    );
    if (fichas.length) {
      idFicha = fichas[0].id_ficha;
    } else {
      const [r] = await conn.query('INSERT INTO ficha_medica (id_cliente) VALUES (?)', [idCliente]);
      idFicha = r.insertId;
    }

    // --- mediciones: cada guardado agrega una medición nueva (historial) ---
    await conn.query(
      `INSERT INTO mediciones (id_ficha, nivel_fisico, altura_cm, peso_kg, fecha_medicion)
       VALUES (?, ?, ?, ?, NOW())`,
      [idFicha, LEVELS[data.level], data.heightCm, data.weightKg]
    );

    // --- lesiones: se reemplaza el conjunto completo ---
    await conn.query('DELETE FROM ficha_antecedente WHERE id_ficha = ?', [idFicha]);
    for (const injury of data.injuries) {
      const idAntecedente = await findOrCreate(conn, 'antecedente', 'id_antecedente', 'nombre', injury);
      await conn.query(
        'INSERT INTO ficha_antecedente (id_ficha, id_antecedente) VALUES (?, ?)',
        [idFicha, idAntecedente]
      );
    }

    // --- cirugías: se reemplaza el conjunto completo ---
    await conn.query('DELETE FROM cirugia WHERE id_ficha = ?', [idFicha]);
    for (const surgery of data.surgeries) {
      await conn.query(
        'INSERT INTO cirugia (id_ficha, descripcion, fecha_cirugia, observaciones) VALUES (?, ?, ?, ?)',
        [idFicha, surgery.descripcion, surgery.fecha, surgery.observaciones]
      );
    }

    // --- preferencia_entrenamiento (una por cliente) ---
    // Orden fijo de la semana y sin repetidos: 'Lunes,Jueves'
    const dias = DAYS.filter((d) => (data.days || []).includes(d)).join(',');

    await conn.query(
      `INSERT INTO preferencia_entrenamiento (id_cliente, entorno, dias_semana, minutos_sesion)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entorno = VALUES(entorno),
         dias_semana = VALUES(dias_semana),
         minutos_sesion = VALUES(minutos_sesion)`,
      [idCliente, ENVIRONMENTS[data.environment], dias, data.minutesPerSession]
    );

    // --- equipamiento: se reemplaza el conjunto completo ---
    await conn.query('DELETE FROM cliente_equipamiento WHERE id_cliente = ?', [idCliente]);
    for (const item of data.equipment) {
      const idEquipamiento = await findOrCreate(conn, 'equipamiento', 'id_equipamiento', 'nombre', item);
      await conn.query(
        'INSERT INTO cliente_equipamiento (id_cliente, id_equipamiento) VALUES (?, ?)',
        [idCliente, idEquipamiento]
      );
    }

    await conn.commit();
    return { idCliente, idFicha };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Devuelve el id_cliente del usuario, o null si aún no completó su perfil.
 * Una fila en `clientes` equivale a "wizard completado" (id_usuario es UNIQUE).
 */
const hasProfile = async (idUsuario) => {
  const [rows] = await pool.query('SELECT id_cliente FROM clientes WHERE id_usuario = ?', [idUsuario]);
  return rows.length ? rows[0].id_cliente : null;
};

/* ---------- Claves inversas (BD -> formulario) ---------- */

const SEX_INV = { M: 'masculino', F: 'femenino' };
const invertir = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const LEVELS_INV = invertir(LEVELS);
const GOALS_INV = invertir(GOALS);
const ENVIRONMENTS_INV = invertir(ENVIRONMENTS);

/**
 * Lee el perfil completo del usuario y lo devuelve con el MISMO formato
 * que espera el formulario del wizard (claves invertidas: 'M' -> 'masculino',
 * 'Bajo' -> 'principiante', sexo NULL -> 'otro', etc.).
 * Devuelve null si el usuario todavía no tiene perfil (sin fila en clientes).
 */
const getProfileByUser = async (idUsuario) => {
  const conn = await pool.getConnection();

  try {
    const [filas] = await conn.query(
      `SELECT u.sexo, c.id_cliente, o.nombre_objetivo, c.observacion_objetivo
         FROM usuarios u
         LEFT JOIN clientes c ON c.id_usuario = u.id_usuario
         LEFT JOIN objetivo o ON o.id_objetivo = c.id_objetivo
        WHERE u.id_usuario = ?`,
      [idUsuario]
    );

    if (!filas.length || !filas[0].id_cliente) return null;

    const fila = filas[0];
    const idCliente = fila.id_cliente;

    const [fichas] = await conn.query('SELECT id_ficha FROM ficha_medica WHERE id_cliente = ?', [idCliente]);
    const idFicha = fichas.length ? fichas[0].id_ficha : null;

    let medicion = null;
    let antecedentes = [];
    let cirugias = [];

    if (idFicha) {
      // Última medición (historial): la más reciente define altura/peso/nivel.
      const [meds] = await conn.query(
        `SELECT nivel_fisico, altura_cm, peso_kg
           FROM mediciones
          WHERE id_ficha = ?
          ORDER BY fecha_medicion DESC, id_medicion DESC
          LIMIT 1`,
        [idFicha]
      );
      medicion = meds[0] || null;

      const [ants] = await conn.query(
        `SELECT a.nombre
           FROM ficha_antecedente fa
           INNER JOIN antecedente a ON a.id_antecedente = fa.id_antecedente
          WHERE fa.id_ficha = ?`,
        [idFicha]
      );
      antecedentes = ants.map((r) => r.nombre);

      // dateStrings: los DATE llegan como 'YYYY-MM-DD' sin corrimiento por zona horaria.
      const [cirs] = await conn.query(
        {
          sql: 'SELECT descripcion, fecha_cirugia, observaciones FROM cirugia WHERE id_ficha = ? ORDER BY fecha_cirugia',
          dateStrings: true,
        },
        [idFicha]
      );
      cirugias = cirs.map((c) => ({
        descripcion: c.descripcion || '',
        fecha: c.fecha_cirugia || '',
        observaciones: c.observaciones || '',
      }));
    }

    const [prefs] = await conn.query(
      'SELECT entorno, dias_semana, minutos_sesion FROM preferencia_entrenamiento WHERE id_cliente = ?',
      [idCliente]
    );

    const [equips] = await conn.query(
      `SELECT e.nombre
         FROM cliente_equipamiento ce
         INNER JOIN equipamiento e ON e.id_equipamiento = ce.id_equipamiento
        WHERE ce.id_cliente = ?`,
      [idCliente]
    );

    // La BD guarda un solo objetivo por cliente (clientes.id_objetivo).
    const objetivo = fila.nombre_objetivo ? GOALS_INV[fila.nombre_objetivo] : null;

    // 'Lunes,Jueves' -> ['Lunes', 'Jueves']
    const days = prefs.length && prefs[0].dias_semana
      ? String(prefs[0].dias_semana).split(',').filter((d) => DAYS.includes(d))
      : [];

    return {
      sex: SEX_INV[fila.sexo] || 'otro',
      heightCm: medicion ? Number(medicion.altura_cm) : null,
      weightKg: medicion ? Number(medicion.peso_kg) : null,
      level: medicion && LEVELS_INV[medicion.nivel_fisico] ? LEVELS_INV[medicion.nivel_fisico] : 'principiante',
      goals: objetivo ? [objetivo] : [],
      // "Ninguna"/"Ninguno" no se guardan: equivalen a cero filas en la BD.
      // Si no hay elementos, la única selección posible que el usuario hizo
      // fue esa, y hay que devolverla explícita para que el formulario la
      // muestre marcada (si no, el chip aparece sin seleccionar y el
      // guardado se bloquea con "Selecciona el equipamiento").
      injuries: antecedentes.length ? antecedentes : ['Ninguna'],
      injuriesText: fila.observacion_objetivo || '',
      surgeries: cirugias,
      environment: prefs.length && ENVIRONMENTS_INV[prefs[0].entorno] ? ENVIRONMENTS_INV[prefs[0].entorno] : 'gimnasio',
      equipment: equips.length ? equips.map((r) => r.nombre) : ['Ninguno'],
      days,                       // ['Lunes', 'Jueves']
      daysPerWeek: days.length,   // compatibilidad con dashboard / generador de rutina
      minutesPerSession: prefs.length ? Number(prefs[0].minutos_sesion) : 45,
    };
  } finally {
    conn.release();
  }
};

module.exports = {
  GOALS,
  LEVELS,
  SEX,
  ENVIRONMENTS,
  INJURIES,
  EQUIPMENT,
  MINUTES_ALLOWED,
  DAYS,
  hasProfile,
  getProfileByUser,
  saveProfile,
};