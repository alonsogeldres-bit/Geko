/* ===========================================
   MODELO DE RUTINA Y RESUMEN
   Funciones puras: no tocan la base de datos.
   Construyen la sugerencia del día y el resumen
   (racha, semana, actividad) a partir del perfil.
   =========================================== */

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

/* Traducción de las etiquetas del wizard /profile a lo que se muestra. */
const NIVEL_INTENSIDAD = { Bajo: 'Baja', Medio: 'Media', Alto: 'Alta' };
const NIVEL_ETIQUETA = { Bajo: 'principiante', Medio: 'intermedio', Alto: 'avanzado' };
const OBJETIVO_POR_DEFECTO = 'Mejorar condición';

/* Rutinas disponibles por objetivo.
   La primera es la de hoy; el botón "Cambiar sugerencia" rota con ?alt=N. */
const RUTINAS = {
  'Ganar músculo': [
    { tipo: 'Fuerza', grupo: 'Tren superior', detalle: 'pecho, espalda y hombros' },
    { tipo: 'Fuerza', grupo: 'Tren inferior', detalle: 'piernas y glúteos' },
    { tipo: 'Fuerza', grupo: 'Full body', detalle: 'cuerpo completo' },
  ],
  'Perder grasa': [
    { tipo: 'Cardio', grupo: 'Intervalos', detalle: 'alta intensidad' },
    { tipo: 'Cardio', grupo: 'Circuito', detalle: 'fuerza y cardio' },
    { tipo: 'Cardio', grupo: 'Cardio suave', detalle: 'ritmo constante' },
  ],
  'Mejorar condición': [
    { tipo: 'Cardio', grupo: 'Resistencia', detalle: 'ritmo constante' },
    { tipo: 'Cardio', grupo: 'Intervalos', detalle: 'alta intensidad' },
    { tipo: 'Movilidad', grupo: 'Movilidad', detalle: 'flexibilidad y core' },
  ],
  'Mantener forma': [
    { tipo: 'Fuerza', grupo: 'Full body', detalle: 'cuerpo completo' },
    { tipo: 'Cardio', grupo: 'Circuito', detalle: 'fuerza y cardio' },
    { tipo: 'Movilidad', grupo: 'Movilidad', detalle: 'flexibilidad y core' },
  ],
};

/* Distribución de los días de entrenamiento según los días por semana.
   Lunes primero, para que coincida con la tira de la semana. */
const DIAS_PLAN = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

/** Fecha local en formato YYYY-MM-DD (sin el corrimiento de zona de `toISOString`). */
const aFechaISO = (fecha) => {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** Índice del día de la semana con lunes = 0. */
const indiceHoy = (fecha = new Date()) => (fecha.getDay() + 6) % 7;

/** Lunes 00:00 de la semana a la que pertenece `fecha`. */
const inicioDeSemana = (fecha = new Date()) => {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  inicio.setDate(inicio.getDate() - indiceHoy(inicio));
  return inicio;
};

/** Días de la semana en que el usuario planifica entrenar. */
const diasPlanificados = (diasSemana) => {
  const total = limitar(Number(diasSemana) || 3, 1, 7);
  return DIAS_PLAN[total] || DIAS_PLAN[3];
};

/**
 * Sugerencia del día, construida con el perfil real del usuario.
 * `alt` rota entre las variantes del objetivo.
 */
const construirSugerencia = (perfil, alt = 0) => {
  const objetivo = perfil.objetivo || OBJETIVO_POR_DEFECTO;
  const variantes = RUTINAS[objetivo] || RUTINAS[OBJETIVO_POR_DEFECTO];
  const rutina = variantes[((Number(alt) || 0) % variantes.length + variantes.length) % variantes.length];

  const minutos = Number(perfil.minutosSesion) || 45;
  const nivel = perfil.nivelFisico || 'Medio';
  const entorno = (perfil.entorno || 'Gimnasio').toLowerCase();

  return {
    nombre: `${rutina.grupo}: ${rutina.detalle}`,
    tipo: rutina.tipo,
    grupo: rutina.grupo,
    minutos,
    intensidad: NIVEL_INTENSIDAD[nivel] || 'Media',
    // ~10 minutos por ejercicio, con topes para que no salga ni 1 ni 20.
    ejercicios: limitar(Math.round(minutos / 10), 3, 10),
    motivo: `${objetivo} · nivel ${NIVEL_ETIQUETA[nivel] || 'intermedio'} · ${entorno}`,
    variantes: variantes.length,
    indiceVariante: variantes.indexOf(rutina) + 1,
  };
};

/** Racha actual, mejor racha, sesiones de la semana y estado de cada día. */
const calcularResumen = (sesiones, diasSemana) => {
  const meta = limitar(Number(diasSemana) || 3, 1, 7);
  const plan = diasPlanificados(meta);

  const fechas = new Set(sesiones.map((s) => aFechaISO(s.fecha)));
  const hoy = aFechaISO(new Date());
  const ayer = aFechaISO(new Date(Date.now() - 86400000));

  // --- racha actual: días consecutivos hasta hoy (o hasta ayer) ---
  let racha = 0;
  if (fechas.has(hoy)) {
    racha = 1;
    for (let i = 1; i < 400; i++) {
      const dia = aFechaISO(new Date(Date.now() - i * 86400000));
      if (!fechas.has(dia)) break;
      racha++;
    }
  } else if (fechas.has(ayer)) {
    racha = 1;
    for (let i = 2; i < 400; i++) {
      const dia = aFechaISO(new Date(Date.now() - i * 86400000));
      if (!fechas.has(dia)) break;
      racha++;
    }
  }

  // --- mejor racha: la racha más larga de todo el historial ---
  const ordenadas = [...fechas].sort();
  let mejorRacha = 0;
  let actual = 0;
  let previa = null;
  for (const dia of ordenadas) {
    const d = new Date(`${dia}T00:00:00`);
    actual = previa && (d - previa) === 86400000 ? actual + 1 : 1;
    if (actual > mejorRacha) mejorRacha = actual;
    previa = d;
  }

  // --- semana actual ---
  const inicio = inicioDeSemana();
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);

  const deEstaSemana = sesiones.filter((s) => {
    const d = new Date(s.fecha);
    return d >= inicio && d < fin;
  });

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicio);
    dia.setDate(dia.getDate() + i);
    const iso = aFechaISO(dia);
    if (fechas.has(iso)) dias.push('hecho');
    else if (plan.includes(i)) dias.push('plan');
    else dias.push('');
  }

  return {
    racha,
    mejorRacha,
    sesiones: deEstaSemana.length,
    meta,
    dias,
    hoy: indiceHoy(),
    plan,
  };
};

/** Actividad reciente para el listado del dashboard. */
const construirActividad = (sesiones, limite = 5) => {
  return sesiones.slice(0, limite).map((s) => {
    const fecha = new Date(s.fecha);
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = fecha.toLocaleDateString('es-CL', { month: 'short' });

    const partes = [`${dia} ${mes}`];
    if (s.duracion_segundos) partes.push(`${Math.round(s.duracion_segundos / 60)} min`);
    if (s.ejercicios_completados) partes.push(`${s.ejercicios_completados} ejercicios`);

    return {
      nombre: s.titulo || 'Entrenamiento completado',
      detalle: partes.join(' · '),
    };
  });
};

module.exports = {
  DIAS_SEMANA,
  RUTINAS,
  construirSugerencia,
  calcularResumen,
  construirActividad,
  diasPlanificados,
  indiceHoy,
  aFechaISO,
};
