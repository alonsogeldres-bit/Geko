/* ===========================================
   CATÁLOGO DE ALTERNATIVAS PARA CAMBIOS DE RUTINA
   Cuando Geko (chat Premium) propone cambiar un ejercicio, la IA NO puede
   inventar ejercicios: solo elige de esta lista cerrada. Cada ejercicio:

     - tiene un nombre que el buscador de GIF (exerciseMediaService) resuelve a
       una animación correcta. Se comprueba al cargar el módulo y con
       `npm run check:routine-catalog`, así nunca se muestra un ejercicio raro
       ni uno sin demostración;
     - declara el equipo que necesita, las zonas del cuerpo que carga y si es
       de impacto, para respetar lo que dice el usuario ("no tengo mancuernas",
       "me duele la rodilla") y sus limitaciones guardadas.

   Este módulo es puro: no consulta la base de datos ni llama a la IA.
   =========================================== */

const { buscarMedia } = require('./exerciseMediaService');
const { CALENTAMIENTO, ESTIRAMIENTO } = require('./localRoutineService');

/* ---------- Utilidades ---------- */

/** Minúsculas, sin tildes, solo letras y números separados por un espacio. */
const normalizar = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const slug = (valor) => normalizar(valor).replace(/\s+/g, '-');

/* ---------- Grupos de movimiento ---------- */

/** Con qué grupos es aceptable sustituir un ejercicio (el primero es el propio). */
const AFINES = Object.freeze({
  sentadilla: ['sentadilla', 'zancada', 'bisagra'],
  zancada: ['zancada', 'sentadilla', 'bisagra'],
  bisagra: ['bisagra', 'zancada', 'sentadilla'],
  'empuje-h': ['empuje-h', 'empuje-v', 'triceps'],
  'empuje-v': ['empuje-v', 'empuje-h', 'triceps'],
  tiron: ['tiron', 'biceps'],
  biceps: ['biceps', 'tiron'],
  triceps: ['triceps', 'empuje-h', 'empuje-v'],
  core: ['core', 'cardio'],
  cardio: ['cardio', 'core'],
  gemelos: ['gemelos', 'sentadilla', 'zancada'],
});

const ETIQUETA_GRUPO = Object.freeze({
  sentadilla: 'Piernas (sentadilla)',
  zancada: 'Piernas (zancada)',
  bisagra: 'Glúteos y cadena posterior',
  'empuje-h': 'Pecho',
  'empuje-v': 'Hombros',
  tiron: 'Espalda',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  core: 'Abdomen',
  cardio: 'Cardio',
  gemelos: 'Pantorrillas',
});

/* ---------- Catálogo ---------- */

/*
 * equipo: 'ninguno' (peso corporal o algo de casa) | mancuernas | barra |
 *         maquina | banda | banco
 * zonas:  rodilla | espalda | hombro | cuello | muñeca | codo | tobillo | cadera
 * ref:    nombre del GIF del dataset que debe resolver `nombre`
 */
const DEFINICION = [
  /* Piernas */
  { nombre: 'Sentadilla con peso corporal', grupo: 'sentadilla', equipo: ['ninguno'], zonas: ['rodilla'], reps: 15, ref: 'potty squat', descripcion: 'Pies al ancho de hombros; baja con control y empuja con los talones.' },
  { nombre: 'Sentadilla con mancuernas', grupo: 'sentadilla', equipo: ['mancuernas'], zonas: ['rodilla'], reps: 12, ref: 'dumbbell squat', descripcion: 'Mancuernas a los costados; baja con control y mantén la espalda recta.' },
  { nombre: 'Sentadilla goblet con mancuerna', grupo: 'sentadilla', equipo: ['mancuernas'], zonas: ['rodilla'], reps: 12, ref: 'dumbbell goblet squat', descripcion: 'Sostén la mancuerna frente al pecho y baja con el torso erguido.' },
  { nombre: 'Sentadilla con barra', grupo: 'sentadilla', equipo: ['barra'], zonas: ['rodilla', 'espalda'], reps: 8, ref: 'barbell full squat', descripcion: 'Pies al ancho de hombros y rodillas alineadas con los pies.' },
  { nombre: 'Sentadilla con salto', grupo: 'sentadilla', equipo: ['ninguno'], zonas: ['rodilla', 'tobillo'], impacto: true, reps: 10, ref: 'jump squat', descripcion: 'Baja a una sentadilla y salta; aterriza suave con las rodillas flexionadas.' },
  { nombre: 'Prensa de piernas', grupo: 'sentadilla', equipo: ['maquina'], zonas: ['rodilla'], reps: 12, ref: 'sled 45° leg press (side pov)', descripcion: 'Empuja con los talones sin bloquear las rodillas.' },
  { nombre: 'Extensión de cuádriceps', grupo: 'sentadilla', equipo: ['maquina'], zonas: ['rodilla'], reps: 12, ref: 'lever leg extension', descripcion: 'Extiende las piernas con control y baja despacio.' },
  { nombre: 'Zancadas alternadas', grupo: 'zancada', equipo: ['ninguno'], zonas: ['rodilla'], reps: 10, ref: 'forward lunge (male)', descripcion: 'Paso largo, con la rodilla de adelante alineada con el pie.' },
  { nombre: 'Zancadas caminando', grupo: 'zancada', equipo: ['ninguno'], zonas: ['rodilla'], reps: 12, ref: 'walking lunge', descripcion: 'Pasos largos y rodillas alineadas con los pies.' },
  { nombre: 'Zancadas con mancuernas', grupo: 'zancada', equipo: ['mancuernas'], zonas: ['rodilla'], reps: 10, ref: 'dumbbell lunge', descripcion: 'Paso largo con una mancuerna en cada mano y el torso erguido.' },

  /* Glúteos y cadena posterior */
  { nombre: 'Puente de glúteos', grupo: 'bisagra', equipo: ['ninguno'], zonas: [], reps: 15, ref: 'low glute bridge on floor', descripcion: 'Acostado, sube la cadera y aprieta los glúteos arriba.' },
  { nombre: 'Puente de glúteos con marcha', grupo: 'bisagra', equipo: ['ninguno'], zonas: [], reps: 12, ref: 'glute bridge march', descripcion: 'Con la cadera arriba, alterna levantando una rodilla sin dejar caer la pelvis.' },
  { nombre: 'Hip thrust con barra', grupo: 'bisagra', equipo: ['barra', 'banco'], zonas: [], reps: 10, ref: 'barbell glute bridge', descripcion: 'Espalda alta en el banco; sube la cadera hasta alinear tronco y muslos.' },
  { nombre: 'Peso muerto rumano con mancuernas', grupo: 'bisagra', equipo: ['mancuernas'], zonas: ['espalda'], reps: 10, ref: 'dumbbell romanian deadlift', descripcion: 'Cadera atrás, espalda recta y mancuernas cerca de las piernas.' },
  { nombre: 'Peso muerto rumano', grupo: 'bisagra', equipo: ['barra'], zonas: ['espalda'], reps: 8, ref: 'barbell romanian deadlift', descripcion: 'Cadera atrás, espalda recta y barra cerca de las piernas.' },
  { nombre: 'Curl femoral', grupo: 'bisagra', equipo: ['maquina'], zonas: [], reps: 12, ref: 'lever lying leg curl', descripcion: 'Flexiona las rodillas con control y baja despacio.' },
  { nombre: 'Superman', grupo: 'bisagra', equipo: ['ninguno'], zonas: ['espalda', 'cuello'], reps: 12, ref: 'hyperextension', descripcion: 'Boca abajo, eleva brazos y piernas sin forzar el cuello.' },

  /* Pecho */
  { nombre: 'Flexiones', grupo: 'empuje-h', equipo: ['ninguno'], zonas: ['hombro', 'muñeca', 'codo'], reps: 10, ref: 'push-up', descripcion: 'Cuerpo alineado; apoya las rodillas si lo necesitas.' },
  { nombre: 'Flexiones inclinadas', grupo: 'empuje-h', equipo: ['ninguno'], zonas: ['hombro', 'muñeca', 'codo'], reps: 12, ref: 'incline push-up', descripcion: 'Manos sobre una superficie firme y alta; es una versión más suave de la flexión.' },
  { nombre: 'Press de banca con mancuernas', grupo: 'empuje-h', equipo: ['mancuernas', 'banco'], zonas: ['hombro', 'codo', 'muñeca'], reps: 10, ref: 'dumbbell bench press', descripcion: 'Baja las mancuernas al pecho y empuja sin despegar la espalda del banco.' },
  { nombre: 'Press de banca', grupo: 'empuje-h', equipo: ['barra', 'banco'], zonas: ['hombro', 'codo', 'muñeca'], reps: 8, ref: 'barbell bench press', descripcion: 'Baja la barra al pecho y empuja sin despegar los pies del piso.' },
  { nombre: 'Press inclinado con mancuernas', grupo: 'empuje-h', equipo: ['mancuernas', 'banco'], zonas: ['hombro', 'codo', 'muñeca'], reps: 10, ref: 'dumbbell incline bench press', descripcion: 'Banco inclinado; empuja las mancuernas hacia arriba con control.' },
  { nombre: 'Press de pecho con banda', grupo: 'empuje-h', equipo: ['banda'], zonas: ['hombro', 'codo'], reps: 12, ref: 'band bench press', descripcion: 'Con la banda por detrás de la espalda, empuja hacia adelante con control.' },
  { nombre: 'Aperturas con mancuernas', grupo: 'empuje-h', equipo: ['mancuernas', 'banco'], zonas: ['hombro'], reps: 12, ref: 'dumbbell fly', descripcion: 'Abre los brazos con los codos ligeramente flexionados y ciérralos sobre el pecho.' },
  { nombre: 'Aperturas en polea', grupo: 'empuje-h', equipo: ['maquina'], zonas: ['hombro'], reps: 12, ref: 'cable standing fly', descripcion: 'Junta las manos frente al pecho con los codos ligeramente flexionados.' },
  { nombre: 'Fondos en banco', grupo: 'triceps', equipo: ['ninguno'], zonas: ['hombro', 'codo', 'muñeca'], reps: 10, ref: 'bench dip (knees bent)', descripcion: 'Manos en un banco o silla firme; baja los codos hacia atrás y sube.' },

  /* Hombros */
  { nombre: 'Press de hombros con mancuernas', grupo: 'empuje-v', equipo: ['mancuernas'], zonas: ['hombro', 'codo'], reps: 10, ref: 'dumbbell seated shoulder press', descripcion: 'Empuja las mancuernas sobre la cabeza sin arquear la espalda.' },
  { nombre: 'Press militar', grupo: 'empuje-v', equipo: ['barra'], zonas: ['hombro', 'espalda', 'codo'], reps: 8, ref: 'barbell standing wide military press', descripcion: 'Empuja la barra sobre la cabeza sin arquear la espalda.' },
  { nombre: 'Press de hombros con banda', grupo: 'empuje-v', equipo: ['banda'], zonas: ['hombro', 'codo'], reps: 12, ref: 'band shoulder press', descripcion: 'Pisa la banda y empuja las manos sobre la cabeza con control.' },
  { nombre: 'Elevaciones laterales', grupo: 'empuje-v', equipo: ['mancuernas'], zonas: ['hombro'], reps: 12, ref: 'dumbbell lateral raise', descripcion: 'Sube los brazos a los lados hasta la altura de los hombros, sin balanceo.' },
  { nombre: 'Elevaciones frontales', grupo: 'empuje-v', equipo: ['mancuernas'], zonas: ['hombro'], reps: 12, ref: 'dumbbell front raise', descripcion: 'Sube los brazos al frente hasta la altura de los hombros, con control.' },

  /* Espalda */
  { nombre: 'Remo con mancuerna', grupo: 'tiron', equipo: ['mancuernas'], zonas: ['espalda'], reps: 12, ref: 'dumbbell bent over row', descripcion: 'Tronco inclinado, lleva el codo atrás y aprieta la espalda.' },
  { nombre: 'Remo con barra', grupo: 'tiron', equipo: ['barra'], zonas: ['espalda'], reps: 8, ref: 'barbell bent over row', descripcion: 'Tronco inclinado, lleva la barra al abdomen y aprieta la espalda.' },
  { nombre: 'Remo con banda', grupo: 'tiron', equipo: ['banda'], zonas: [], reps: 12, ref: 'band one arm standing low row', descripcion: 'Sujeta la banda en un punto fijo y lleva los codos atrás.' },
  { nombre: 'Remo invertido', grupo: 'tiron', equipo: ['ninguno'], zonas: ['hombro'], reps: 8, ref: 'inverted row', descripcion: 'Bajo una barra baja o una mesa firme, tira del pecho hacia arriba con el cuerpo recto.' },
  { nombre: 'Jalón al pecho', grupo: 'tiron', equipo: ['maquina'], zonas: ['hombro'], reps: 10, ref: 'cable lat pulldown full range of motion', descripcion: 'Lleva la barra a la parte alta del pecho sin balancearte.' },
  { nombre: 'Pájaros con mancuernas', grupo: 'tiron', equipo: ['mancuernas'], zonas: ['hombro'], reps: 12, ref: 'dumbbell reverse fly', descripcion: 'Con el tronco inclinado, abre los brazos a los lados apretando la espalda alta.' },

  /* Brazos */
  { nombre: 'Curl de bíceps con mancuernas', grupo: 'biceps', equipo: ['mancuernas'], zonas: ['codo', 'muñeca'], reps: 12, ref: 'dumbbell alternate biceps curl', descripcion: 'Codos pegados al cuerpo; sube sin balancearte.' },
  { nombre: 'Curl martillo', grupo: 'biceps', equipo: ['mancuernas'], zonas: ['codo'], reps: 12, ref: 'dumbbell hammer curl', descripcion: 'Agarre neutro, codos fijos y subida controlada.' },
  { nombre: 'Curl de bíceps con banda', grupo: 'biceps', equipo: ['banda'], zonas: ['codo'], reps: 12, ref: 'band alternating biceps curl', descripcion: 'Pisa la banda y sube las manos hacia los hombros con los codos fijos.' },
  { nombre: 'Curl de bíceps con barra', grupo: 'biceps', equipo: ['barra'], zonas: ['codo', 'muñeca'], reps: 10, ref: 'barbell curl', descripcion: 'Codos pegados al cuerpo; sube la barra sin balancearte.' },
  { nombre: 'Extensión de tríceps en polea', grupo: 'triceps', equipo: ['maquina'], zonas: ['codo'], reps: 12, ref: 'cable triceps pushdown (v-bar)', descripcion: 'Codos fijos y extensión completa del brazo.' },
  { nombre: 'Extensión de tríceps con mancuerna', grupo: 'triceps', equipo: ['mancuernas', 'banco'], zonas: ['codo', 'hombro'], reps: 10, ref: 'dumbbell lying triceps extension', descripcion: 'Acostado, baja la mancuerna con los codos fijos y extiende los brazos.' },
  { nombre: 'Press francés', grupo: 'triceps', equipo: ['barra', 'banco'], zonas: ['codo'], reps: 10, ref: 'barbell lying triceps extension skull crusher', descripcion: 'Acostado, baja la barra hacia la frente con los codos fijos y extiende.' },

  /* Abdomen */
  { nombre: 'Plancha frontal', grupo: 'core', equipo: ['ninguno'], zonas: ['hombro'], modo: 'tiempo', seg: 30, ref: 'front plank with twist', descripcion: 'Codos bajo los hombros y abdomen firme; mantén el cuerpo alineado.' },
  { nombre: 'Plancha lateral', grupo: 'core', equipo: ['ninguno'], zonas: ['hombro'], modo: 'tiempo', seg: 20, ref: 'bodyweight incline side plank', descripcion: 'Codo bajo el hombro y cadera elevada; cambia de lado a mitad del tiempo.' },
  { nombre: 'Plancha con toque de hombro', grupo: 'core', equipo: ['ninguno'], zonas: ['hombro', 'muñeca'], reps: 16, ref: 'shoulder tap push-up', descripcion: 'En posición de plancha alta, toca cada hombro con la mano contraria sin girar la cadera.' },
  { nombre: 'Crunch abdominal', grupo: 'core', equipo: ['ninguno'], zonas: ['cuello'], reps: 15, ref: 'crunch floor', descripcion: 'Acostado, sube el torso con el abdomen sin tirar del cuello.' },

  /* Pantorrillas */
  { nombre: 'Elevación de talones', grupo: 'gemelos', equipo: ['ninguno'], zonas: ['tobillo'], reps: 15, ref: 'bodyweight standing calf raise', descripcion: 'De pie, sube los talones despacio y baja con control.' },

  /* Cardio */
  { nombre: 'Mountain climbers', grupo: 'cardio', equipo: ['ninguno'], zonas: ['muñeca', 'hombro', 'rodilla'], impacto: true, modo: 'tiempo', seg: 30, ref: 'mountain climber', descripcion: 'En plancha, lleva las rodillas al pecho alternando a ritmo constante.' },
  { nombre: 'Burpees', grupo: 'cardio', equipo: ['ninguno'], zonas: ['rodilla', 'muñeca', 'hombro', 'espalda'], impacto: true, reps: 8, ref: 'burpee', descripcion: 'Flexión, salto a pie y salto vertical. Ajusta el ritmo a tu nivel.' },
  { nombre: 'Saltos de tijera', grupo: 'cardio', equipo: ['ninguno'], zonas: ['rodilla', 'tobillo'], impacto: true, modo: 'tiempo', seg: 30, ref: 'jack jump (male)', descripcion: 'Salta abriendo piernas y brazos; aterriza suave.' },
];

/* ---------- Verificación del GIF al cargar ---------- */

const descartados = [];

const CATALOGO = DEFINICION.map((e) => ({
  id: slug(e.nombre),
  nombre: e.nombre,
  grupo: e.grupo,
  equipo: e.equipo,
  zonas: e.zonas || [],
  impacto: Boolean(e.impacto),
  modo: e.modo === 'tiempo' ? 'tiempo' : 'reps',
  reps: e.reps || null,
  seg: e.seg || null,
  descripcion: e.descripcion,
  ref: e.ref,
})).filter((e) => {
  /* Sin GIF (o con uno distinto al verificado) el ejercicio no se ofrece nunca. */
  const media = buscarMedia(e.nombre);
  const valido = Boolean(media) && media.nombreDataset === e.ref;
  if (!valido) descartados.push({ nombre: e.nombre, ref: e.ref, obtenido: media ? media.nombreDataset : null });
  return valido;
});

if (descartados.length) {
  console.warn(
    `[routine-catalog] ${descartados.length} ejercicio(s) sin GIF verificado quedan fuera del catálogo: ` +
      descartados.map((d) => d.nombre).join(', ')
  );
}

const POR_ID = new Map(CATALOGO.map((e) => [e.id, e]));
const POR_NOMBRE = new Map(CATALOGO.map((e) => [normalizar(e.nombre), e]));

/* ---------- Calentamiento y estiramiento ---------- */

/* Son los nombres fijos que ya usa la rutina (siempre tienen demostración). */
const ZONAS_FIJAS = {
  'Movilidad articular': { zonas: [] },
  'Trote suave en el lugar': { zonas: ['rodilla', 'tobillo'], impacto: true },
  'Sentadillas sin peso': { zonas: ['rodilla'] },
  'Elevación de rodillas': { zonas: ['rodilla'] },
  'Rotaciones de tronco': { zonas: ['espalda'] },
  'Círculos de brazos': { zonas: ['hombro'] },
  'Estiramiento de cuádriceps': { zonas: ['rodilla'] },
  'Estiramiento de isquiotibiales': { zonas: ['espalda'] },
  'Estiramiento de pecho y hombros': { zonas: ['hombro'] },
  'Estiramiento de espalda baja': { zonas: ['espalda'] },
  'Estiramiento de pantorrillas': { zonas: [] },
};

const aOpcionFija = (grupo) => (e) => ({
  id: slug(e.nombre),
  nombre: e.nombre,
  grupo,
  equipo: ['ninguno'],
  zonas: (ZONAS_FIJAS[e.nombre] || {}).zonas || [],
  impacto: Boolean((ZONAS_FIJAS[e.nombre] || {}).impacto),
  modo: 'tiempo',
  reps: null,
  seg: null,
  descripcion: e.descripcion,
  ref: null,
});

const OPCIONES_CALENTAMIENTO = CALENTAMIENTO.map(aOpcionFija('calentamiento'));
const OPCIONES_ESTIRAMIENTO = ESTIRAMIENTO.map(aOpcionFija('estiramiento'));

/* ---------- Equipo, zonas y grupo de un ejercicio cualquiera ---------- */

const EQUIPOS = Object.freeze(['mancuernas', 'barra', 'maquina', 'banda', 'banco']);

/** Equipo del perfil ("Máquinas", "Bandas elásticas"...) -> clave interna. */
const equipoDesdeNombre = (nombre) => {
  const t = normalizar(nombre);
  if (/mancuerna/.test(t)) return 'mancuernas';
  if (/barra/.test(t)) return 'barra';
  if (/maquina|polea/.test(t)) return 'maquina';
  if (/banda|elastic|liga/.test(t)) return 'banda';
  if (/banco/.test(t)) return 'banco';
  return null;
};

/** Texto -> zonas del cuerpo que menciona ("me duele la rodilla" -> ['rodilla']). */
const ZONAS_PATRONES = [
  ['rodilla', /\brodillas?\b|\bmenisco\b|\brotula\b/],
  ['espalda', /\bespalda\b|\blumbar(es)?\b|\bcintura\b|\bcolumna\b|\bdorsal(es)?\b/],
  ['hombro', /\bhombros?\b/],
  ['cuello', /\bcuello\b|\bcervical(es)?\b/],
  ['muñeca', /\bmunecas?\b/],
  ['codo', /\bcodos?\b/],
  ['tobillo', /\btobillos?\b/],
  ['cadera', /\bcaderas?\b/],
];

const zonasDesdeTexto = (texto) => {
  const t = normalizar(texto);
  return ZONAS_PATRONES.filter(([, re]) => re.test(t)).map(([zona]) => zona);
};

/** Nombre del ejercicio -> equipo que necesita (catálogo primero, patrones después). */
const equipoRequerido = (nombre) => {
  const exacto = POR_NOMBRE.get(normalizar(nombre));
  if (exacto) return exacto.equipo.filter((e) => e !== 'ninguno');

  const t = normalizar(nombre);
  const requeridos = [];
  if (/mancuerna|dumbbell/.test(t)) requeridos.push('mancuernas');
  if (/\bbarra\b(?! fija)|barbell|press de banca|press banca|press militar|peso muerto|press frances/.test(t) && !/mancuerna/.test(t)) requeridos.push('barra');
  if (/maquina|polea|prensa|jalon|extension de cuadriceps|curl femoral|peck|smith|hack/.test(t)) requeridos.push('maquina');
  if (/banda|elastic|liga/.test(t)) requeridos.push('banda');
  if (/\bbanco\b|press de banca|press banca|press inclinado|hip thrust/.test(t)) requeridos.push('banco');
  return [...new Set(requeridos)];
};

/** Zonas que carga un ejercicio (catálogo primero, patrones después). */
const PATRONES_ZONAS_EJERCICIO = [
  [/sentadilla|squat|zancada|estocada|prensa|extension de cuadriceps|step|peso muerto|salto|trote|burpee|escalador|mountain|rodillas altas|elevacion de rodillas/, ['rodilla']],
  [/peso muerto|remo|buenos dias|superman|lumbar|extension de espalda|press militar|sentadilla con barra|burpee/, ['espalda']],
  [/flexion|press|fondos|aperturas|elevaciones? (laterales|frontales)|pajaros|plancha|jalon|dominada|remo invertido|burpee|face pull/, ['hombro']],
  [/flexion|press|fondos|plancha con toque|dominada|burpee/, ['muñeca']],
  [/curl|triceps|press|fondos|frances|flexion/, ['codo']],
  [/crunch|abdominal|superman/, ['cuello']],
  [/salto|burpee|talones|trote|tijera/, ['tobillo']],
];

const zonasDeEjercicio = (nombre) => {
  const exacto = POR_NOMBRE.get(normalizar(nombre));
  if (exacto) return exacto.zonas;

  const fijo = [...OPCIONES_CALENTAMIENTO, ...OPCIONES_ESTIRAMIENTO].find(
    (o) => normalizar(o.nombre) === normalizar(nombre)
  );
  if (fijo) return fijo.zonas;

  const t = normalizar(nombre);
  const zonas = new Set();
  PATRONES_ZONAS_EJERCICIO.forEach(([re, lista]) => {
    if (re.test(t)) lista.forEach((z) => zonas.add(z));
  });
  return [...zonas];
};

const esImpacto = (nombre) => {
  const exacto = POR_NOMBRE.get(normalizar(nombre));
  if (exacto) return exacto.impacto;
  return /salto|saltos|burpee|trote|pliometr|jump|escalador|mountain/.test(normalizar(nombre));
};

/** Grupo de movimiento de un ejercicio. null si no se puede saber (p. ej. un circuito). */
const PATRONES_GRUPO = [
  [/^circuito\b/, null],
  [/triceps|frances|patada de triceps|fondos/, 'triceps'],
  [/curl femoral|isquio|puente|gluteo|hip thrust|peso muerto|buenos dias|superman|lumbar|extension de espalda/, 'bisagra'],
  [/biceps|martillo|\bcurl\b/, 'biceps'],
  [/sentadilla|squat|prensa|extension de cuadriceps|goblet/, 'sentadilla'],
  [/zancada|estocada|step|lunge|bulgar/, 'zancada'],
  [/press militar|press de hombros|hombros|elevaciones? (laterales|frontales)|pajaros|face pull|arnold/, 'empuje-v'],
  [/flexion|press|aperturas|cruce|pecho/, 'empuje-h'],
  [/remo|jalon|dominada|dorsal/, 'tiron'],
  [/plancha|abdominal|crunch|bicicleta|russian|elevacion de piernas/, 'core'],
  [/talones|gemelo|pantorrilla/, 'gemelos'],
  [/burpee|salto|jump|mountain|escalador|cardio|rodillas altas|trote|jumping/, 'cardio'],
];

const grupoDe = (nombre) => {
  const exacto = POR_NOMBRE.get(normalizar(nombre));
  if (exacto) return exacto.grupo;

  const t = normalizar(nombre);
  for (const [re, grupo] of PATRONES_GRUPO) {
    if (re.test(t)) return grupo;
  }
  return null;
};

/* ---------- Disponibilidad y filtros ---------- */

/**
 * Equipo que el usuario puede usar ahora mismo.
 * - Siempre peso corporal.
 * - Lo que marcó en su perfil (c.equipamiento).
 * - En Gimnasio, además, el material típico del gimnasio (igual que el prompt de rutina).
 * - Menos lo que dijo no tener en el chat (`sinEquipo`).
 * No modifica el perfil: es solo para filtrar esta propuesta.
 */
const equipoDisponible = ({ lugar, equipamiento = [], sinEquipo = [] } = {}) => {
  const disponible = new Set();
  (Array.isArray(equipamiento) ? equipamiento : []).forEach((nombre) => {
    const clave = equipoDesdeNombre(nombre);
    if (clave) disponible.add(clave);
  });
  if (normalizar(lugar) === 'gimnasio') ['mancuernas', 'barra', 'maquina', 'banco'].forEach((e) => disponible.add(e));
  (Array.isArray(sinEquipo) ? sinEquipo : []).forEach((e) => disponible.delete(e));
  return disponible;
};

/**
 * Alternativas permitidas para un tipo de bloque.
 * @param {Object} o
 * @param {'principal'|'calentamiento'|'estiramiento'} o.bloque
 * @param {Set<string>} o.disponible       equipo disponible
 * @param {Set<string>} o.zonasEvitar      zonas con lesión o molestia
 * @param {boolean} o.evitarImpacto        true si hay alguna limitación
 * @param {Set<string>} o.excluir          nombres normalizados que no se pueden repetir
 */
const filtrarCandidatos = ({ bloque, disponible, zonasEvitar, evitarImpacto, excluir } = {}) => {
  const base =
    bloque === 'calentamiento' ? OPCIONES_CALENTAMIENTO : bloque === 'estiramiento' ? OPCIONES_ESTIRAMIENTO : CATALOGO;
  const dispo = disponible instanceof Set ? disponible : new Set();
  const evitar = zonasEvitar instanceof Set ? zonasEvitar : new Set();
  const fuera = excluir instanceof Set ? excluir : new Set();

  return base.filter((e) => {
    if (fuera.has(normalizar(e.nombre))) return false;
    if (!e.equipo.every((eq) => eq === 'ninguno' || dispo.has(eq))) return false;
    if (e.zonas.some((z) => evitar.has(z))) return false;
    if (evitarImpacto && e.impacto) return false;
    return true;
  });
};

/** Repeticiones del ejercicio nuevo, partiendo de lo que tenía el reemplazado. */
const ES_TIEMPO = /\d+\s*(min(?:utos?)?|seg(?:undos?)?|s)\b/i;

const repeticionesNuevas = (nuevo, original = {}) => {
  if (nuevo.modo === 'tiempo' && nuevo.seg) return `${nuevo.seg} s`;

  const previas = String(original.repeticiones ?? '').trim();
  if (previas && !ES_TIEMPO.test(previas) && /\d/.test(previas)) return previas;

  return String(nuevo.reps || 10);
};

module.exports = {
  CATALOGO,
  OPCIONES_CALENTAMIENTO,
  OPCIONES_ESTIRAMIENTO,
  AFINES,
  ETIQUETA_GRUPO,
  EQUIPOS,
  DESCARTADOS: descartados,
  normalizar,
  slug,
  equipoDesdeNombre,
  zonasDesdeTexto,
  equipoRequerido,
  zonasDeEjercicio,
  esImpacto,
  grupoDe,
  equipoDisponible,
  filtrarCandidatos,
  repeticionesNuevas,
  buscarPorId: (id) =>
    POR_ID.get(id) ||
    OPCIONES_CALENTAMIENTO.find((e) => e.id === id) ||
    OPCIONES_ESTIRAMIENTO.find((e) => e.id === id) ||
    null,
};
