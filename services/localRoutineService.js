/* ===========================================
   SERVICIO DE RUTINAS LOCAL (RESPALDO)
   Genera una rutina completa sin llamar a ninguna API.
   Se usa cuando Groq no está disponible (sin clave, error,
   timeout o saturación), para que /entrenamiento siga
   funcionando igual.

   Contrato (mismo que groqService):
     generarRutinaLocal({ tiempoDisponible, lugarEntrenamiento, perfil })
     -> { calentamiento[], rutinaPrincipal[], estiramiento[],
          tiempoTotalMin, lugarEntrenamiento, fuente: 'local' }

   No toca la base de datos: solo recibe el perfil ya leído.
   =========================================== */

/* Valores que puede traer la base ('gimnasio', 'aire_libre', ...)
   y también las etiquetas que ya usa la vista. */
const LUGARES_PERMITIDOS = ['Gimnasio', 'Casa', 'Aire libre', 'Mixto'];

const MAPA_LUGARES = {
  gimnasio: 'Gimnasio',
  casa: 'Casa',
  'aire_libre': 'Aire libre',
  'aire libre': 'Aire libre',
  mixto: 'Mixto',
};

/** Normaliza el lugar a una de las etiquetas canónicas. */
const normalizarLugar = (lugar) => {
  const limpio = String(lugar || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return MAPA_LUGARES[limpio] || MAPA_LUGARES[limpio.replace(/_/g, ' ')] || 'Casa';
};

/* ---------- Catálogo de ejercicios ---------- */

const CALENTAMIENTO = [
  { nombre: 'Movilidad articular', descripcion: 'Círculos suaves de cuello, hombros, cadera y tobillos.' },
  { nombre: 'Trote suave en el lugar', descripcion: 'Ritmo cómodo, sin llegar a fatigarte.' },
  { nombre: 'Sentadillas sin peso', descripcion: 'Baja controlado hasta donde te resulte cómodo.' },
  { nombre: 'Elevación de rodillas', descripcion: 'Alterna las piernas a un ritmo constante.' },
  { nombre: 'Rotaciones de tronco', descripcion: 'Gira el torso de lado a lado con los brazos sueltos.' },
  { nombre: 'Círculos de brazos', descripcion: 'Movimientos amplios hacia adelante y hacia atrás.' },
];

const ESTIRAMIENTO = [
  { nombre: 'Estiramiento de cuádriceps', descripcion: 'De pie, lleva el talón al glúteo y mantén sin dolor.' },
  { nombre: 'Estiramiento de isquiotibiales', descripcion: 'Pierna extendida y tronco hacia adelante, espalda recta.' },
  { nombre: 'Estiramiento de pecho y hombros', descripcion: 'Abre los brazos y lleva el pecho hacia adelante.' },
  { nombre: 'Estiramiento de espalda baja', descripcion: 'Sentado, lleva el pecho hacia las rodillas sin forzar.' },
  { nombre: 'Estiramiento de pantorrillas', descripcion: 'Apoya las manos en una pared y empuja el talón al piso.' },
];

const CATALOGO = {
  Gimnasio: [
    { nombre: 'Press de banca', enfoque: 'fuerza', descripcion: 'Baja la barra al pecho y empuja sin despegar los pies del piso.' },
    { nombre: 'Sentadilla con barra', enfoque: 'fuerza', descripcion: 'Pies al ancho de hombros, rodillas alineadas con los pies.' },
    { nombre: 'Peso muerto rumano', enfoque: 'fuerza', descripcion: 'Cadera atrás, espalda recta y barra cerca de las piernas.' },
    { nombre: 'Jalón al pecho', enfoque: 'fuerza', descripcion: 'Lleva la barra a la parte alta del pecho sin balancearte.' },
    { nombre: 'Press militar', enfoque: 'fuerza', descripcion: 'Empuja la barra sobre la cabeza sin arquear la espalda.' },
    { nombre: 'Remo con barra', enfoque: 'fuerza', descripcion: 'Tronco inclinado, lleva la barra al abdomen y aprieta la espalda.' },
    { nombre: 'Prensa de piernas', enfoque: 'fuerza', descripcion: 'Empuja con los talones sin bloquear las rodillas.' },
    { nombre: 'Curl de bíceps', enfoque: 'fuerza', descripcion: 'Codos pegados al cuerpo, sube sin balancearte.' },
    { nombre: 'Extensión de tríceps en polea', enfoque: 'fuerza', descripcion: 'Codos fijos y extensión completa del brazo.' },
    { nombre: 'Burpees', enfoque: 'cardio', descripcion: 'Flexión, salto a pie y salto vertical. Ajusta el ritmo.' },
    { nombre: 'Mountain climbers', enfoque: 'cardio', descripcion: 'En plancha, lleva las rodillas al pecho alternando rápido.' },
    { nombre: 'Saltos de tijera', enfoque: 'cardio', descripcion: 'Salta abriendo piernas y brazos, aterriza suave.' },
  ],
  Casa: [
    { nombre: 'Sentadilla con peso corporal', enfoque: 'fuerza', descripcion: 'Baja con control y empuja con los talones.' },
    { nombre: 'Flexiones', enfoque: 'fuerza', descripcion: 'Cuerpo alineado; apoya las rodillas si lo necesitas.' },
    { nombre: 'Zancadas alternadas', enfoque: 'fuerza', descripcion: 'Paso largo, rodilla de adelante alineada con el pie.' },
    { nombre: 'Puente de glúteos', enfoque: 'fuerza', descripcion: 'Acostado, sube la cadera y aprieta los glúteos.' },
    { nombre: 'Plancha frontal', enfoque: 'fuerza', descripcion: 'Codos bajo los hombros y abdomen firme.' },
    { nombre: 'Remo con banda o toalla', enfoque: 'fuerza', descripcion: 'Sujeta un punto fijo y lleva los codos atrás.' },
    { nombre: 'Burpees', enfoque: 'cardio', descripcion: 'Flexión, salto a pie y salto vertical. Ajusta el ritmo.' },
    { nombre: 'Mountain climbers', enfoque: 'cardio', descripcion: 'En plancha, lleva las rodillas al pecho alternando.' },
    { nombre: 'Saltos de tijera', enfoque: 'cardio', descripcion: 'Salta abriendo piernas y brazos, aterriza suave.' },
    { nombre: 'Superman', enfoque: 'movilidad', descripcion: 'Boca abajo, eleva brazos y piernas sin forzar el cuello.' },
    { nombre: 'Movilidad de cadera', enfoque: 'movilidad', descripcion: 'Círculos y aperturas lentas, sin dolor.' },
    { nombre: 'Plancha lateral', enfoque: 'movilidad', descripcion: 'Codo bajo el hombro y cadera elevada.' },
  ],
  'Aire libre': [
    { nombre: 'Sentadilla al aire libre', enfoque: 'fuerza', descripcion: 'Peso corporal, baja controlado y empuja con los talones.' },
    { nombre: 'Flexiones en el piso', enfoque: 'fuerza', descripcion: 'Cuerpo alineado; apoya las rodillas si lo necesitas.' },
    { nombre: 'Zancadas caminando', enfoque: 'fuerza', descripcion: 'Pasos largos y rodillas alineadas con los pies.' },
    { nombre: 'Dominadas en barra', enfoque: 'fuerza', descripcion: 'Si no tienes barra, usa una banda o salta el ejercicio.' },
    { nombre: 'Fondos en banco', enfoque: 'fuerza', descripcion: 'Manos en el banco, codos hacia atrás y pecho arriba.' },
    { nombre: 'Step-ups en escalón', enfoque: 'fuerza', descripcion: 'Sube con una pierna y baja con control, alternando.' },
    { nombre: 'Burpees', enfoque: 'cardio', descripcion: 'Flexión, salto a pie y salto vertical. Ajusta el ritmo.' },
    { nombre: 'Saltos verticales', enfoque: 'cardio', descripcion: 'Salta y aterriza con las rodillas ligeramente flexionadas.' },
    { nombre: 'Saltos de tijera', enfoque: 'cardio', descripcion: 'Salta abriendo piernas y brazos, aterriza suave.' },
    { nombre: 'Plancha frontal', enfoque: 'movilidad', descripcion: 'Codos bajo los hombros y abdomen firme.' },
    { nombre: 'Estiramiento dinámico de cadera', enfoque: 'movilidad', descripcion: 'Aperturas y círculos lentos antes de exigir.' },
    { nombre: 'Movilidad de hombros', enfoque: 'movilidad', descripcion: 'Círculos amplios y controlados.' },
  ],
  Mixto: [
    { nombre: 'Sentadilla con mancuernas', enfoque: 'fuerza', descripcion: 'Mancuernas a los costados, baja con control.' },
    { nombre: 'Flexiones', enfoque: 'fuerza', descripcion: 'Cuerpo alineado; apoya las rodillas si lo necesitas.' },
    { nombre: 'Remo con mancuerna', enfoque: 'fuerza', descripcion: 'Tronco inclinado, lleva el codo atrás y aprieta la espalda.' },
    { nombre: 'Zancadas con mancuernas', enfoque: 'fuerza', descripcion: 'Paso largo y rodilla de adelante alineada con el pie.' },
    { nombre: 'Press de hombros con mancuernas', enfoque: 'fuerza', descripcion: 'Empuja sobre la cabeza sin arquear la espalda.' },
    { nombre: 'Puente de glúteos', enfoque: 'fuerza', descripcion: 'Acostado, sube la cadera y aprieta los glúteos.' },
    { nombre: 'Burpees', enfoque: 'cardio', descripcion: 'Flexión, salto a pie y salto vertical. Ajusta el ritmo.' },
    { nombre: 'Mountain climbers', enfoque: 'cardio', descripcion: 'En plancha, lleva las rodillas al pecho alternando.' },
    { nombre: 'Saltos de tijera', enfoque: 'cardio', descripcion: 'Salta abriendo piernas y brazos, aterriza suave.' },
    { nombre: 'Plancha frontal', enfoque: 'movilidad', descripcion: 'Codos bajo los hombros y abdomen firme.' },
    { nombre: 'Movilidad de cadera', enfoque: 'movilidad', descripcion: 'Círculos y aperturas lentas, sin dolor.' },
  ],
};

/* Orden de preferencia de enfoques según el objetivo del usuario. */
const PREFERENCIA_OBJETIVO = {
  'Ganar músculo': ['fuerza', 'fuerza', 'cardio', 'movilidad'],
  'Perder grasa': ['cardio', 'fuerza', 'cardio', 'movilidad'],
  'Mejorar condición': ['cardio', 'movilidad', 'fuerza'],
  'Mantener forma': ['fuerza', 'cardio', 'movilidad'],
};

const NIVELES = {
  Bajo: { series: 2, repeticiones: 12, descansoSeg: 60 },
  Medio: { series: 3, repeticiones: 10, descansoSeg: 75 },
  Alto: { series: 4, repeticiones: 8, descansoSeg: 90 },
};

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

/** Reparte `total` minutos entre `n` elementos sin perder unidades. */
const repartirMinutos = (total, n) => {
  const cantidad = Math.max(1, n);
  const base = Math.floor(total / cantidad);
  const resto = total - base * cantidad;
  return Array.from({ length: cantidad }, (_, i) => Math.max(1, base + (i < resto ? 1 : 0)));
};

/** Elige ejercicios priorizando los enfoques del objetivo, con rotación diaria. */
const elegirEjercicios = (catalogo, objetivo, cantidad, variacion) => {
  const preferencia = PREFERENCIA_OBJETIVO[objetivo] || PREFERENCIA_OBJETIVO['Mejorar condición'];

  const porEnfoque = {};
  catalogo.forEach((ejercicio) => {
    porEnfoque[ejercicio.enfoque] = porEnfoque[ejercicio.enfoque] || [];
    porEnfoque[ejercicio.enfoque].push(ejercicio);
  });

  // Rota cada grupo para que la rutina no sea idéntica todos los días.
  Object.keys(porEnfoque).forEach((enfoque) => {
    const lista = porEnfoque[enfoque];
    const offset = variacion % lista.length;
    porEnfoque[enfoque] = lista.slice(offset).concat(lista.slice(0, offset));
  });

  const usados = new Set();
  const salida = [];
  let vuelta = 0;

  while (salida.length < cantidad && usados.size < catalogo.length && vuelta < cantidad * 6) {
    const enfoque = preferencia[vuelta % preferencia.length];
    const lista = porEnfoque[enfoque] || [];
    const siguiente = lista.find((ejercicio) => !usados.has(ejercicio.nombre))
      || catalogo.find((ejercicio) => !usados.has(ejercicio.nombre));

    if (!siguiente) break;

    salida.push(siguiente);
    usados.add(siguiente.nombre);
    vuelta++;
  }

  return salida;
};

/** Parámetros de series, repeticiones y descanso según nivel y enfoque. */
const parametros = (nivel, enfoque) => {
  const base = NIVELES[nivel] || NIVELES.Medio;

  if (enfoque === 'cardio') {
    return {
      series: Math.max(2, base.series - 1),
      repeticiones: base.repeticiones + 6,
      descansoSeg: 45,
    };
  }

  if (enfoque === 'movilidad') {
    return { series: 2, repeticiones: 10, descansoSeg: 30 };
  }

  return { ...base };
};

/**
 * Genera una rutina de respaldo coherente con el tiempo y el perfil.
 * @param {Object} opciones
 * @param {number} opciones.tiempoDisponible minutos
 * @param {string} opciones.lugarEntrenamiento
 * @param {Object} [opciones.perfil]
 * @param {number} [opciones.variacion]
 */
const generarRutinaLocal = ({
  tiempoDisponible,
  lugarEntrenamiento,
  perfil = {},
  variacion = 0,
} = {}) => {
  const total = limitar(Math.round(Number(tiempoDisponible) || 30), 5, 180);
  const lugar = normalizarLugar(lugarEntrenamiento);

  // Reserva al menos 3 minutos para la parte principal.
  let calentamientoMin = Math.max(1, Math.round(total * 0.15));
  let estiramientoMin = Math.max(1, Math.round(total * 0.12));

  if (calentamientoMin + estiramientoMin > total - 3) {
    const disponible = Math.max(2, total - 3);
    calentamientoMin = Math.max(1, Math.floor(disponible / 2));
    estiramientoMin = Math.max(1, disponible - calentamientoMin);
  }

  const principalMin = Math.max(2, total - calentamientoMin - estiramientoMin);

  const cantidadCalentamiento = limitar(calentamientoMin, 1, 3);
  const cantidadEstiramiento = limitar(estiramientoMin, 1, 3);
  const cantidadPrincipal = limitar(Math.round(principalMin / 8), 3, 8);

  const objetivo = perfil.objetivo || 'Mejorar condición';
  const nivel = NIVELES[perfil.nivelFisico] ? perfil.nivelFisico : 'Medio';
  const offset = (Math.floor(Date.now() / 86400000) + Number(variacion || 0)) >>> 0;

  const calentamientos = repartirMinutos(calentamientoMin, cantidadCalentamiento);
  const estiramientos = repartirMinutos(estiramientoMin, cantidadEstiramiento);

  const rotar = (lista, cantidad) => {
    const inicio = offset % lista.length;
    return lista.slice(inicio).concat(lista.slice(0, inicio)).slice(0, cantidad);
  };

  const catalogo = CATALOGO[lugar] || CATALOGO.Casa;
  const principales = elegirEjercicios(catalogo, objetivo, cantidadPrincipal, offset);

  return {
    calentamiento: rotar(CALENTAMIENTO, cantidadCalentamiento).map((ejercicio, i) => ({
      nombre: ejercicio.nombre,
      duracionMin: calentamientos[i],
      descripcion: ejercicio.descripcion,
    })),
    rutinaPrincipal: principales.map((ejercicio) => {
      const params = parametros(nivel, ejercicio.enfoque);
      return {
        nombre: ejercicio.nombre,
        series: params.series,
        repeticiones: params.repeticiones,
        descansoSeg: params.descansoSeg,
        descripcion: ejercicio.descripcion,
      };
    }),
    estiramiento: rotar(ESTIRAMIENTO, cantidadEstiramiento).map((ejercicio, i) => ({
      nombre: ejercicio.nombre,
      duracionMin: estiramientos[i],
      descripcion: ejercicio.descripcion,
    })),
    tiempoTotalMin: total,
    lugarEntrenamiento: lugar,
    fuente: 'local',
  };
};

module.exports = {
  generarRutinaLocal,
  normalizarLugar,
  LUGARES_PERMITIDOS,
  NIVELES,
};
