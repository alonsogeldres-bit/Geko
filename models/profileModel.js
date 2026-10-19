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
    await conn.query(
      `INSERT INTO preferencia_entrenamiento (id_cliente, entorno, dias_semana, minutos_sesion)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         entorno = VALUES(entorno),
         dias_semana = VALUES(dias_semana),
         minutos_sesion = VALUES(minutos_sesion)`,
      [idCliente, ENVIRONMENTS[data.environment], data.daysPerWeek, data.minutesPerSession]
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

module.exports = {
  GOALS,
  LEVELS,
  SEX,
  ENVIRONMENTS,
  INJURIES,
  EQUIPMENT,
  MINUTES_ALLOWED,
  hasProfile,
  saveProfile,
};