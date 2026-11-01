/* ===========================================
   MODELO DE PLAN DE ENTRENAMIENTO (rutinas con IA)
   Guarda la rutina que genera la IA en las tablas que ya existen:

     ejercicios                   catálogo (se reutiliza por nombre o se crea)
     plan_entrenamiento           cabecera de la rutina
     detalle_plan_entrenamiento   una fila por ejercicio de la rutina

   No altera el esquema. Regla: UN solo plan de IA por cliente.
   Cuando la IA genera una rutina nueva, se MODIFICA ese plan:
     - la cabecera se actualiza (fecha, objetivo, observaciones, estado);
     - los ejercicios se actualizan por posición: los nuevos ocupan las
       filas existentes, las que sobran se borran y las que faltan se insertan.
   Solo se crea un plan nuevo la primera vez que el cliente genera una rutina.
   =========================================== */

const pool = require('../config/db');

/* Todo plan creado por la IA empieza con esta marca en `observaciones`. */
const MARCA = 'Rutina IA';

/* Categoría con la que se crean los ejercicios nuevos que inventa la IA,
   para distinguirlos del catálogo curado. */
const CATEGORIA_IA = 'IA';

const COMPLEJIDAD = { Bajo: 'Facil', Medio: 'Medio', Alto: 'Dificil' };
const INTENSIDAD = { Bajo: 'Baja', Medio: 'Media', Alto: 'Alta' };

const BLOQUES = [
  { clave: 'calentamiento', etiqueta: 'Calentamiento', principal: false },
  { clave: 'rutinaPrincipal', etiqueta: 'Principal', principal: true },
  { clave: 'estiramiento', etiqueta: 'Estiramiento', principal: false },
];

const recortar = (texto, max) => String(texto ?? '').trim().slice(0, max);

/**
 * "12" / "10-12" / "12 por lado" -> { repeticiones: 12 }
 * "30 s" / "45 seg" / "1 min"    -> { duracionSeg: 30 | 45 | 60 }
 * La columna `repeticiones` es INT, por eso el texto del modelo se interpreta.
 */
const interpretarRepeticiones = (valor) => {
  const t = String(valor ?? '').toLowerCase();

  const tiempo = t.match(/(\d+)\s*(min(?:utos?)?|seg(?:undos?)?|s)\b/);
  if (tiempo) {
    const n = parseInt(tiempo[1], 10);
    const seg = tiempo[2].startsWith('min') ? n * 60 : n;
    return seg > 0 ? { repeticiones: null, duracionSeg: seg } : { repeticiones: null, duracionSeg: null };
  }

  const n = parseInt((t.match(/\d+/) || [])[0], 10);
  return { repeticiones: n > 0 ? n : null, duracionSeg: null };
};

/** Reutiliza un ejercicio del catálogo por nombre o crea uno nuevo. */
const buscarOCrearEjercicio = async (conn, { nombre, descripcion, complejidad }) => {
  const [rows] = await conn.query(
    'SELECT id_ejercicio FROM ejercicios WHERE LOWER(nombre) = LOWER(?) ORDER BY id_ejercicio LIMIT 1',
    [nombre]
  );
  if (rows.length) return rows[0].id_ejercicio;

  const [r] = await conn.query(
    'INSERT INTO ejercicios (nombre, descripcion, categoria, complejidad) VALUES (?, ?, ?, ?)',
    [nombre, descripcion || null, CATEGORIA_IA, complejidad]
  );
  return r.insertId;
};

/**
 * Guarda la rutina en una sola transacción, modificando el plan IA existente
 * del cliente (o creándolo si es la primera vez).
 * @param {Object} datos
 * @param {number} datos.idCliente
 * @param {Object} datos.rutina       salida de generarRutinaPersonalizada
 * @param {string} [datos.nivelFisico] 'Bajo' | 'Medio' | 'Alto'
 * @param {string} datos.fecha        YYYY-MM-DD (hoy)
 * @param {string} datos.diaSemana    'Lunes'..'Domingo' (sin tilde, igual que el ENUM)
 * @returns {Promise<number>} id_plan_entrenamiento
 */
const guardarRutinaIA = async ({ idCliente, rutina, nivelFisico, fecha, diaSemana }) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [clientes] = await conn.query(
      'SELECT id_objetivo FROM clientes WHERE id_cliente = ?',
      [idCliente]
    );
    if (!clientes.length) throw new Error('El cliente no existe.');

    // 1) Se arma el detalle completo antes de tocar el plan, así una rutina
    //    vacía no deja el plan existente a medias.
    const complejidad = COMPLEJIDAD[nivelFisico] || 'Medio';
    const intensidad = INTENSIDAD[nivelFisico] || 'Media';
    const filas = [];
    let orden = 0;

    for (const bloque of BLOQUES) {
      const items = Array.isArray(rutina[bloque.clave]) ? rutina[bloque.clave] : [];

      for (const e of items) {
        const nombre = recortar(e.nombre, 50);
        if (!nombre) continue;

        const idEjercicio = await buscarOCrearEjercicio(conn, {
          nombre,
          descripcion: e.descripcion,
          complejidad,
        });

        let series = null;
        let repeticiones = null;
        let duracionSeg = null;
        let descansoSeg = null;

        if (bloque.principal) {
          series = Math.max(1, parseInt(e.series, 10) || 1);
          ({ repeticiones, duracionSeg } = interpretarRepeticiones(e.repeticiones));
          descansoSeg = Math.max(0, parseInt(e.descansoSeg, 10) || 0);
        } else {
          duracionSeg = Math.max(1, Math.round(Number(e.duracionMin) || 1)) * 60;
        }

        orden += 1;
        filas.push({
          idEjercicio,
          orden,
          series,
          repeticiones,
          duracionSeg,
          descansoSeg,
          // La descripción propia de ESTA rutina (puede decir "adaptado por la rodilla")
          // va en la observación, no en el catálogo compartido.
          observacion: `[${bloque.etiqueta}] ${String(e.descripcion || '').trim()}`.trim(),
        });
      }
    }

    if (!filas.length) throw new Error('La rutina no tiene ejercicios para guardar.');

    // 2) Cabecera: se modifica el plan IA más reciente del cliente; si no hay, se crea.
    const observaciones = recortar(
      `${MARCA} · ${rutina.fuente || 'local'} · ${rutina.tiempoTotalMin || '?'} min · ${rutina.lugar || rutina.lugarEntrenamiento || ''}`,
      255
    );

    const [planes] = await conn.query(
      `SELECT id_plan_entrenamiento FROM plan_entrenamiento
        WHERE id_cliente = ? AND observaciones LIKE ?
        ORDER BY id_plan_entrenamiento DESC
        LIMIT 1`,
      [idCliente, `${MARCA}%`]
    );

    let idPlan;
    if (planes.length) {
      idPlan = planes[0].id_plan_entrenamiento;
      await conn.query(
        `UPDATE plan_entrenamiento
            SET id_objetivo = ?, fecha_inicio = ?, fecha_termino = ?,
                estado = 'Activo', observaciones = ?
          WHERE id_plan_entrenamiento = ?`,
        [clientes[0].id_objetivo, fecha, fecha, observaciones, idPlan]
      );
    } else {
      const [plan] = await conn.query(
        `INSERT INTO plan_entrenamiento
           (id_cliente, id_objetivo, fecha_inicio, fecha_termino, estado, observaciones)
         VALUES (?, ?, ?, ?, 'Activo', ?)`,
        [idCliente, clientes[0].id_objetivo, fecha, fecha, observaciones]
      );
      idPlan = plan.insertId;
    }

    // 3) Detalle: se actualiza por posición (orden de las filas existentes).
    const [existentes] = await conn.query(
      `SELECT id_detalle_plan_entrenamiento AS id
         FROM detalle_plan_entrenamiento
        WHERE id_plan_entrenamiento = ?
        ORDER BY orden, id_detalle_plan_entrenamiento`,
      [idPlan]
    );

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      if (i < existentes.length) {
        await conn.query(
          `UPDATE detalle_plan_entrenamiento
              SET id_ejercicio = ?, dia_semana = ?, orden = ?, series = ?, repeticiones = ?,
                  duracion_segundos = ?, descanso_segundos = ?, intensidad = ?, observacion = ?
            WHERE id_detalle_plan_entrenamiento = ?`,
          [
            f.idEjercicio, diaSemana, f.orden, f.series, f.repeticiones,
            f.duracionSeg, f.descansoSeg, intensidad, f.observacion,
            existentes[i].id,
          ]
        );
      } else {
        await conn.query(
          `INSERT INTO detalle_plan_entrenamiento
             (id_plan_entrenamiento, id_ejercicio, dia_semana, orden, series, repeticiones,
              duracion_segundos, descanso_segundos, intensidad, observacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idPlan, f.idEjercicio, diaSemana, f.orden, f.series, f.repeticiones,
            f.duracionSeg, f.descansoSeg, intensidad, f.observacion,
          ]
        );
      }
    }

    // Si la rutina nueva tiene menos ejercicios, se borran las filas que sobran.
    for (let i = filas.length; i < existentes.length; i++) {
      await conn.query(
        'DELETE FROM detalle_plan_entrenamiento WHERE id_detalle_plan_entrenamiento = ?',
        [existentes[i].id]
      );
    }

    await conn.commit();
    return idPlan;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ---------- Historial de sesiones con detalle ---------- */

const MAX_DETALLE_EJERCICIOS = 200;
const MAX_DURACION_DIA_SEG = 24 * 60 * 60;
const MAX_EJERCICIOS_DIA = 60000;

/** Lee un JSON venga como objeto (MySQL JSON) o como texto. */
const parsearJson = (valor) => {
  if (!valor) return null;
  if (typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor);
  } catch (err) {
    return null;
  }
};

/**
 * Combina el detalle de una sesión nueva con el que ya tenía el día.
 * Se guarda una fila por cliente y fecha, así que las sesiones del mismo día
 * se acumulan: series sumadas y ejercicios concatenados.
 */
const combinarDetalle = (anterior, nuevo) => {
  if (!nuevo) return anterior || null;
  if (!anterior) return nuevo;

  const ejercicios = [
    ...(Array.isArray(anterior.ejercicios) ? anterior.ejercicios : []),
    ...(Array.isArray(nuevo.ejercicios) ? nuevo.ejercicios : []),
  ].slice(0, MAX_DETALLE_EJERCICIOS);

  return {
    seriesCompletadas:
      Math.max(0, Number(anterior.seriesCompletadas) || 0) +
      Math.max(0, Number(nuevo.seriesCompletadas) || 0),
    sesiones:
      Math.max(1, Number(anterior.sesiones) || 1) +
      Math.max(1, Number(nuevo.sesiones) || 1),
    ejercicios,
  };
};

/**
 * Guarda una sesión terminada en el historial del dashboard.
 * Respeta la fila única por cliente y fecha que usa /progreso: si ya hay una
 * sesión hoy, acumula duración, ejercicios y detalle en vez de duplicar filas.
 *
 * El esfuerzo percibido (RPE) se guarda aparte con /entrenamiento/esfuerzo,
 * así que este UPDATE no lo toca.
 *
 * @param {Object} datos
 * @param {number} datos.idCliente
 * @param {string} datos.fecha            YYYY-MM-DD (fecha local)
 * @param {string} [datos.titulo]
 * @param {number} [datos.duracionSegundos]
 * @param {number} [datos.ejerciciosCompletados]
 * @param {number} [datos.ejerciciosTotal]
 * @param {{seriesCompletadas: number, sesiones?: number, ejercicios: Array<{nombre: string, bloque: string, completado: boolean}>}|null} [datos.detalle]
 * @returns {Promise<number>} id_sesion
 */
const guardarSesion = async ({
  idCliente,
  fecha,
  titulo,
  duracionSegundos,
  ejerciciosCompletados,
  ejerciciosTotal,
  detalle,
}) => {
  const duracion = Math.max(0, Math.round(Number(duracionSegundos) || 0));
  const completados = Math.max(0, Math.round(Number(ejerciciosCompletados) || 0));
  const total = Math.max(0, Math.round(Number(ejerciciosTotal) || 0));
  const tituloFinal = recortar(titulo, 150) || 'Entrenamiento completado';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [filas] = await conn.query(
      `SELECT id_sesion, duracion_segundos, ejercicios_completados, ejercicios_total, detalle_json
         FROM sesion_entrenamiento
        WHERE id_cliente = ? AND fecha = ?
        FOR UPDATE`,
      [idCliente, fecha]
    );

    if (filas.length) {
      const actual = filas[0];
      const detalleFinal = combinarDetalle(parsearJson(actual.detalle_json), detalle);

      await conn.query(
        `UPDATE sesion_entrenamiento
            SET titulo = ?,
                duracion_segundos = ?,
                ejercicios_completados = ?,
                ejercicios_total = ?,
                detalle_json = ?,
                actualizado_en = CURRENT_TIMESTAMP
          WHERE id_sesion = ?`,
        [
          tituloFinal,
          Math.min(MAX_DURACION_DIA_SEG, (Number(actual.duracion_segundos) || 0) + duracion),
          Math.min(MAX_EJERCICIOS_DIA, (Number(actual.ejercicios_completados) || 0) + completados),
          // Se suman ambos para que dos sesiones de 5/5 queden 10/10, no 10/5.
          Math.min(MAX_EJERCICIOS_DIA, (Number(actual.ejercicios_total) || 0) + total),
          detalleFinal ? JSON.stringify(detalleFinal) : null,
          actual.id_sesion,
        ]
      );

      await conn.commit();
      return actual.id_sesion;
    }

    const [resultado] = await conn.query(
      `INSERT INTO sesion_entrenamiento
         (id_cliente, fecha, titulo, duracion_segundos, ejercicios_completados,
          ejercicios_total, detalle_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        idCliente,
        fecha,
        tituloFinal,
        Math.min(MAX_DURACION_DIA_SEG, duracion),
        Math.min(MAX_EJERCICIOS_DIA, completados),
        Math.min(MAX_EJERCICIOS_DIA, total),
        detalle ? JSON.stringify(detalle) : null,
      ]
    );

    await conn.commit();
    return resultado.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  guardarRutinaIA,
  guardarSesion,
  interpretarRepeticiones,
  MARCA,
  CATEGORIA_IA,
};