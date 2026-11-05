/**
 * Busca la animación de un ejercicio en el dataset público que usa openGym
 * (hasaneyldrm/exercises-dataset) y sirve los archivos a través de Geko.
 *
 * El catálogo se genera con `scripts/build-exercise-index.js`. La búsqueda
 * trabaja con el nombre en español que escribe la IA, por lo que combina:
 *   - alias español -> inglés para los ejercicios más comunes,
 *   - coincidencia de tokens contra nombre/equipo/instrucciones en español,
 *   - un umbral de confianza para no mostrar un gif equivocado.
 */

let INDICE = [];
try {
  INDICE = require('../data/exercises-index.json');
} catch (err) {
  // Sin el índice la app debe seguir funcionando: simplemente no muestra gifs.
  console.error(
    '[exercise-media] no se encontró data/exercises-index.json. ' +
      'Ejecuta `npm run build:exercise-index` para generarlo.'
  );
}

const UPSTREAM =
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';
const MEDIA_ROUTE = '/media/ejercicios/';
const UMBRAL = 0.46;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'esta',
  'este', 'esto', 'la', 'las', 'lo', 'los', 'mas', 'me', 'mi', 'mis', 'no',
  'o', 'para', 'pero', 'por', 'que', 'se', 'sin', 'sobre', 'su', 'sus', 'te',
  'tu', 'tus', 'un', 'una', 'uno', 'unos', 'unas', 'y', 'ya',
  'ejercicio', 'ejercicios', 'rutina', 'serie', 'series', 'repeticion',
  'repeticiones', 'reps', 'tiempo', 'minuto', 'minutos', 'segundo', 'segundos',
  'the', 'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or',
  'the', 'to', 'with', 'your', 'you',
]);

/** Alias de frases españolas a términos que aparecen en el dataset inglés. */
const ALIASES = [
  [/\bpress de banca\b/, 'bench press'],
  [/\bpress banca\b/, 'bench press'],
  [/\bpress inclinado\b/, 'incline bench press'],
  [/\bpress declinado\b/, 'decline bench press'],
  [/\bsentadillas? con barra\b/, 'barbell full squat'],
  [/\bsentadillas? frontal(es)?\b/, 'barbell front squat'],
  [/\bsentadillas? con mancuernas?\b/, 'dumbbell squat'],
  [/\bsentadillas? sin peso\b/, 'bodyweight squat'],
  [/\bsentadillas? con peso corporal\b/, 'bodyweight squat'],
  [/\bsentadillas? al aire libre\b/, 'bodyweight squat'],
  [/\bsentadillas?\b/, 'squat'],
  [/\bpeso muerto rumano\b/, 'romanian deadlift'],
  [/\bpeso muerto con barra\b/, 'barbell deadlift'],
  [/\bpeso muerto sumo\b/, 'sumo deadlift'],
  [/\bpeso muerto\b/, 'deadlift'],
  [/\bjalon(es)? al pecho\b/, 'lat pulldown'],
  [/\bjalon(es)?\b/, 'pulldown'],
  [/\bpress militar con mancuernas?\b/, 'dumbbell seated shoulder press'],
  [/\bpress militar\b/, 'military press'],
  [/\bpress de hombros? con mancuernas?\b/, 'dumbbell seated shoulder press'],
  [/\bpress de hombros?\b/, 'shoulder press'],
  [/\bpress hombros?\b/, 'shoulder press'],
  [/\bremo(s)? con barra\b/, 'barbell bent over row'],
  [/\bremo(s)? con mancuernas?\b/, 'dumbbell bent over row'],
  [/\bremo(s)? con banda\b/, 'band row'],
  [/\bremo(s)? al menton\b/, 'upright row'],
  [/\bremo(s)? invertidos?\b/, 'inverted row'],
  [/\bremo(s)?\b/, 'row'],
  [/\bprensa de piernas?\b/, 'leg press'],
  [/\bcurl de biceps?\b/, 'biceps curl'],
  [/\bcurl martillo\b/, 'dumbbell hammer curl'],
  [/\bcurl femoral\b/, 'leg curl'],
  [/\bcurl predicador\b/, 'preacher curl'],
  [/\bextension de triceps? en polea\b/, 'cable triceps pushdown'],
  [/\bextension de triceps?\b/, 'triceps extension'],
  [/\bextension de cuadriceps\b/, 'leg extension'],
  [/\bflexiones?\b/, 'push-up'],
  [/\bzancadas? bulgaras?\b/, 'split squat'],
  [/\bsentadillas? bulgaras?\b/, 'split squat'],
  [/\bzancadas? (caminando|alternadas?)\b/, 'walking lunge'],
  [/\bzancadas?\b/, 'lunge'],
  [/\bplancha con toque de hombro\b/, 'shoulder tap push-up'],
  [/\bplancha frontal\b/, 'front plank'],
  [/\bplancha lateral\b/, 'side plank'],
  [/\bplancha isometrica\b/, 'front plank'],
  [/\bplancha\b/, 'plank'],
  [/\bpuente de gluteos?\b/, 'glute bridge'],
  [/\bhip thrust\b/, 'glute bridge'],
  [/\bdominadas? asistidas?\b/, 'assisted pull-up'],
  [/\bdominadas?\b/, 'pull-up'],
  [/\bfondos? en paralelas\b/, 'chest dip'],
  [/\bfondos? de triceps\b/, 'triceps dip'],
  [/\bfondos?\b/, 'dip'],
  [/\bsaltos? de tijera\b/, 'jumping jack'],
  [/\bjumping jacks?\b/, 'jumping jack'],
  [/\bburpees?\b/, 'burpee'],
  [/\bmountain climbers?\b/, 'mountain climber'],
  [/\bstep[- ]?ups?\b/, 'step-up'],
  [/\bsuperman\b/, 'superman'],
  [/\belevacion de rodillas\b/, 'high knees'],
  [/\brodillas? altas?\b/, 'high knees'],
  [/\bcirculos? de brazos?\b/, 'arm circles'],
  [/\brotaciones? de tronco\b/, 'torso rotation'],
  [/\btrote\b/, 'jog'],
  [/\bestiramiento de cuadriceps\b/, 'quad stretch'],
  [/\bestiramiento de isquiotibiales\b/, 'hamstring stretch'],
  [/\bestiramiento de pecho\b/, 'chest stretch'],
  [/\bestiramiento de espalda\b/, 'back stretch'],
  [/\bestiramiento de pantorrillas\b/, 'calf stretch'],
  [/\bmovilidad de cadera\b/, 'hip mobility'],
  [/\bmovilidad de hombros\b/, 'shoulder mobility'],
  [/\bmovilidad articular\b/, 'joint mobility'],
  [/\baperturas? con mancuernas?\b/, 'dumbbell fly'],
  [/\baperturas? en polea\b/, 'cable cross-over'],
  [/\belevaciones? laterales?\b/, 'lateral raise'],
  [/\belevacion frontal\b/, 'front raise'],
  [/\bencogimiento(s)? de hombros\b/, 'shrug'],
  [/\belevacion de talones\b/, 'calf raise'],
  [/\bpress frances\b/, 'skull crusher'],
  [/\bpajaros?\b/, 'reverse fly'],
  [/\bface pull\b/, 'face pull'],
  [/\bcrunch abdominal\b/, 'crunch floor'],
  [/\babdominales? bicicleta\b/, 'bicycle crunch'],
  [/\babdominales?\b/, 'crunch'],
  [/\bpatada de gluteo\b/, 'glute kickback'],
];

/**
 * Atajos para los nombres que genera la rutina local de Geko. Se resuelven
 * por ID para no depender de cómo esté escrito el nombre en el dataset.
 * `null` = ese ejercicio no tiene una animación fiable y se prefiere ocultarla.
 */
const EXACTOS = new Map([
  // El catálogo principal sí tiene un movimiento equivalente para estos tres.
  ['movilidad articular', '1368'],
  ['trote suave en el lugar', '0685'],
  ['trote en el lugar', '0685'],
  ['trote suave', '0685'],
  ['trote', '0685'],
  ['trotar en el lugar', '0685'],
  ['rotaciones de tronco', '2329'],
  ['rotacion de tronco', '2329'],
  ['rotaciones de torso', '2329'],
  ['rotacion de torso', '2329'],

  ['sentadillas sin peso', '3119'],
  ['sentadilla sin peso', '3119'],
  ['sentadilla con peso corporal', '3119'],
  ['sentadillas con peso corporal', '3119'],
  ['sentadilla al aire libre', '3119'],
  ['sentadillas al aire libre', '3119'],
  ['elevacion de rodillas', '3636'],
  ['estiramiento de cuadriceps', '1564'],
  ['estiramiento de isquiotibiales', '1511'],
  ['estiramiento de pecho y hombros', '1271'],
  ['estiramiento de espalda baja', '0690'],
  ['estiramiento de pantorrillas', '1377'],

  ['press de banca', '0025'],
  ['sentadilla con barra', '0043'],
  ['peso muerto rumano', '0085'],
  ['jalon al pecho', '2330'],
  ['press militar', '1457'],
  ['remo con barra', '0027'],
  ['prensa de piernas', '1463'],
  ['curl de biceps', '0294'],
  ['extension de triceps en polea', '0241'],
  ['burpees', '1160'],
  ['mountain climbers', '0630'],
  ['saltos de tijera', '3224'],
  ['flexiones', '0662'],
  ['zancadas alternadas', '3470'],
  ['puente de gluteos', '3013'],
  ['plancha frontal', '0464'],
  ['remo con banda o toalla', '3165'],
  ['superman', '0489'],
  ['plancha lateral', '3544'],
  ['flexiones en el piso', '0662'],
  ['zancadas caminando', '1460'],
  ['dominadas en barra', '0652'],
  ['fondos en banco', '0129'],
  ['step ups en escalon', '0431'],
  ['saltos verticales', '0514'],
  ['estiramiento dinamico de cadera', '2571'],
  ['sentadilla con mancuernas', '0413'],
  ['remo con mancuerna', '0293'],
  ['zancadas con mancuernas', '0336'],
  ['press de hombros con mancuernas', '0405'],

  // Variantes habituales que la IA puede escribir sin ser el nombre exacto del catálogo.
  ['peso muerto', '0032'],
  ['jumping jack', '3224'],
  ['jumping jacks', '3224'],
  ['sentadilla bulgara', '2368'],
  ['zancada bulgara', '2368'],
  ['press de hombros', '0405'],
  ['sentadilla frontal', '0042'],
  ['curl femoral', '0586'],
  ['elevacion de talones', '1373'],
  ['aperturas en polea', '0227'],
  ['face pull', null],
  ['sentadilla sumo', '3142'],
  ['encogimiento de hombros', '0406'],
  ['extension de triceps con mancuerna', '0351'],
  ['elevaciones laterales con mancuernas', '0334'],
  ['elevaciones laterales', '0334'],
  ['plancha isometrica', '0464'],
  ['remo al menton', '0120'],
  ['pajaros con mancuernas', '0383'],
  ['abdominales bicicleta', '0972'],

  // Variantes que la IA suele escribir y que la búsqueda difusa confundía con
  // otro ejercicio (por ejemplo, sentadilla trasera -> squat jerk).
  ['sentadilla trasera', '0043'],
  ['sentadilla trasera con barra', '0043'],
  ['sentadilla con salto', '0514'],
  ['sentadilla con saltos', '0514'],
  ['peso muerto convencional', '0032'],
  ['peso muerto con barra', '0032'],
  ['curl femoral tumbado', '0586'],
  ['curl femoral acostado', '0586'],
  ['press de banca plano', '0025'],
  ['press de banca plano con barra', '0025'],
  ['press de banca con barra', '0025'],
  ['press militar con barra', '1457'],
  ['press militar con mancuernas', '0405'],
  ['extension de triceps sobre la cabeza', '2188'],
  ['extension de triceps sobre la cabeza con mancuerna', '2188'],
  ['elevacion de piernas colgado', '0472'],
  ['elevacion de piernas colgando', '0472'],
  ['bicicleta abdominal', '0972'],
  ['elevacion de talones de pie', '1373'],
  ['elevacion frontal', '0310'],
  ['elevaciones frontales', '0310'],
  ['aperturas planas con mancuernas', '0308'],
  ['encogimientos de hombros', '0406'],
  ['zancadas caminando con mancuernas', '1460'],
  ['curl de biceps con barra', '0031'],
  ['curl con barra', '0031'],
  ['prensa de piernas 45 grados', '1463'],
  ['step up al cajon', '0431'],
  ['step up en cajon', '0431'],

  // Nombres genéricos que la IA escribe sin material. Se resuelven por ID para
  // que no terminen en una variante con barra, banda o implemento raro.
  ['sentadilla', '3119'],
  ['sentadillas', '3119'],
  ['plancha', '0464'],
  ['planchas', '0464'],
  ['plancha abdominal', '0464'],
  ['zancada', '3470'],
  ['zancadas', '3470'],
  ['zancada estatica', '3470'],
  ['zancada alterna', '3470'],
  ['zancada alternada', '3470'],
  ['zancadas alternas', '3470'],
  ['flexiones inclinadas', '0493'],

  // Variantes compuestas: sin esto el fuzzy matching elegía una variante con
  // banda o barra que no correspondía al movimiento descrito.
  ['sentadilla con rotacion de tronco', '1686'],
  ['sentadilla con giro de tronco', '1686'],
  ['sentadilla con giro', '1686'],
  ['sentadilla con elevacion de brazos', '1685'],
  ['sentadilla con alcance', '1685'],
  ['zancada con giro de tronco', '1688'],
  ['zancada con rotacion de tronco', '1688'],
  ['zancada con giro', '1688'],
  ['zancada caminando', '1460'],
  ['estiramiento con rotacion de tronco', '2329'],
  ['estiramiento con giro de tronco', '2329'],
  ['estiramiento de tronco', '2329'],

  // Componentes habituales de los circuitos que arma la IA. Sin estas claves
  // la búsqueda difusa confundía "push-up en pared" con un pino o la
  // sentadilla goblet con una sentadilla con barra.
  ['push up en pared', '0659'],
  ['push ups en pared', '0659'],
  ['flexion en pared', '0659'],
  ['flexiones en pared', '0659'],
  ['sentadilla con mancuerna al pecho', '1760'],
  ['sentadilla goblet', '1760'],
  ['sentadilla goblet con mancuerna', '1760'],
  ['goblet squat', '1760'],
  ['fondos de pecho en silla', '0129'],
  ['fondos en silla', '0129'],
  ['fondos de triceps en silla', '0129'],
  ['remo invertido bajo mesa', '0499'],
  ['remate de mancuerna', '0293'],
  ['remate de mancuerna con agarre neutro', '0293'],
  ['peso muerto rumano con mancuernas', '1459'],
  ['peso muerto rumano con mancuerna', '1459'],

  ['bird dog', null],
  ['face pull en polea', null],
  ['estiramiento de gato camello', null],
]);

/**
 * Media local para movimientos que el dataset principal no incluye. Los GIF se
 * generan con `npm run build:warmup-gifs` desde yuhonas/free-exercise-db
 * (Unlicense / dominio público) y se sirven desde `public/`.
 */
const MEDIA_LOCAL = {
  brazos: {
    id: 'arm-circles',
    nombreDataset: 'arm circles',
    gifUrl: '/media/calentamiento/arm-circles.gif',
  },
  cadera: {
    id: 'hip-circles',
    nombreDataset: 'standing hip circles',
    gifUrl: '/media/calentamiento/hip-circles.gif',
  },
  hombros: {
    id: 'shoulder-circles',
    nombreDataset: 'shoulder circles',
    gifUrl: '/media/calentamiento/shoulder-circles.gif',
  },
};

const LOCALES = new Map([
  ['circulos de brazos', MEDIA_LOCAL.brazos],
  ['circulos con los brazos', MEDIA_LOCAL.brazos],
  ['circulos de brazo', MEDIA_LOCAL.brazos],
  ['movilidad de cadera', MEDIA_LOCAL.cadera],
  ['movilidad de caderas', MEDIA_LOCAL.cadera],
  ['circulos de cadera', MEDIA_LOCAL.cadera],
  ['circulos de caderas', MEDIA_LOCAL.cadera],
  ['movilidad de hombros', MEDIA_LOCAL.hombros],
  ['movilidad de hombro', MEDIA_LOCAL.hombros],
  ['circulos de hombros', MEDIA_LOCAL.hombros],
  ['circulos de hombro', MEDIA_LOCAL.hombros],
  ['rotacion de hombros', MEDIA_LOCAL.hombros],
]);

/**
 * Nombres sin una animación equivalente fiable en el dataset. Se ocultan en
 * lugar de mostrar un gif que no corresponde.
 */
const OCULTAR = [
  /\bmovilidad\b/,
  /\bcirculos? de brazos?\b/,
  /\brotaciones? de tronco\b/,
  /\btrote\b/,
  /\bbird ?dog\b/,
  /\bface ?pull\b/,
  /\bgato camello\b/,
  /\bdesplazamiento lateral\b/,
];

/** Equipo en español -> token del dataset. */
const EQUIPO = [
  [/\bmancuernas?\b/, 'dumbbell'],
  [/\bbarras?\b/, 'barbell'],
  [/\bpolea\b/, 'cable'],
  [/\bmaquina\b/, 'lever'],
  [/\bbanda\b/, 'band'],
  [/\bkettlebell\b/, 'kettlebell'],
  [/\bbanco\b/, 'bench'],
  [/\btoalla\b/, 'towel'],
  [/\bbalon\b/, 'ball'],
  [/\bsmith\b/, 'smith'],
  [/\bpeso corporal\b/, 'bodyweight'],
];

const quitarAcentos = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const singularizar = (token) => {
  if (token.length > 5 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
};

/** Clave para comparar nombres completos sin acentos ni signos. */
const normalizarClave = (texto) =>
  quitarAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * La IA describe el mismo movimiento con calificativos ("movilidad articular
 * global", "rotaciones de tronco suaves"...). Estas reglas llevan las
 * variantes conocidas a la clave canónica antes de resolver por nombre.
 * Las reglas específicas van primero: "movilidad articular" es el último
 * recurso para no tapar variantes de cadera, hombros o brazos.
 */
const REGLAS_CANONICAS = [
  [/\b(movilidad|circulos?|rotacion(es)?)\b.*\b(cadera|caderas)\b/, 'movilidad de cadera'],
  [/\b(movilidad|circulos?|rotacion(es)?)\b.*\b(hombro|hombros)\b/, 'movilidad de hombros'],
  [/\b(circulos?|rotacion(es)?)\b.*\b(brazo|brazos)\b/, 'circulos de brazos'],
  [/\b(rotacion(es)?|giros?|twist)\b.*\b(tronco|torso)\b/, 'rotaciones de tronco'],
  [/\b(trote|trotar)\b/, 'trote suave en el lugar'],
  [/\bcorrer( suave)?\b/, 'trote suave en el lugar'],
  [/\bmarcha\b/, 'trote suave en el lugar'],
];

const CALIFICATIVOS = new RegExp(
  '\\b(' +
    [
      'global', 'general', 'suave', 'suaves',
      'ligero', 'ligera', 'lento', 'lenta',
      'controlado', 'controlada', 'dinamico', 'dinamica',
      'basico', 'basica', 'completo', 'completa',
      'en el lugar', 'en el sitio', 'de pie', 'con control',
      'hacia adelante', 'hacia atras', 'hacia adelante y atras',
      'de cuello y hombros', 'de cuerpo completo',
    ].join('|') +
  ')\\b',
  'g'
);

// Solo canonicalizamos cuando el nombre empieza con el movimiento de
// movilidad/calentamiento. Así "Sentadilla con rotación de tronco" no termina
// convertida en "rotaciones de tronco".
const PREFIJOS_MOVILIDAD = new Set([
  'movilidad', 'circulo', 'circulos', 'rotacion', 'rotaciones',
  'giro', 'giros', 'trote', 'trotar', 'correr', 'marcha',
]);

const aplicarReglas = (clave) => {
  const primera = clave.split(' ')[0];
  if (!PREFIJOS_MOVILIDAD.has(primera)) return '';

  const regla = REGLAS_CANONICAS.find(([patron]) => patron.test(clave));
  return regla ? regla[1] : '';
};

const canonicalizarNombre = (texto) => {
  const base = normalizarClave(texto);
  const directa = aplicarReglas(base);
  if (directa) return directa;

  const limpieza = base.replace(CALIFICATIVOS, ' ').replace(/\s+/g, ' ').trim();

  // "movilidad articular" genérico solo si no menciona otra zona del cuerpo.
  if (limpieza === 'movilidad articular') return limpieza;

  return aplicarReglas(limpieza) || limpieza;
};

const tokenizar = (texto) => {
  const normalizado = quitarAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalizado) return [];

  return normalizado
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token))
    .map(singularizar)
    .filter(Boolean);
};

/** Traduce/expande el nombre español antes de buscar. */
const expandirConsulta = (nombre, descripcion = '') => {
  const texto = quitarAcentos(nombre).toLowerCase();
  const textoDescripcion = quitarAcentos(descripcion).toLowerCase();
  const tokens = new Map();
  const equipos = new Set();

  const agregar = (token, peso) => {
    if (!token) return;
    const actual = tokens.get(token) || 0;
    if (peso > actual) tokens.set(token, peso);
  };

  tokenizar(texto).forEach((token) => agregar(token, 0.8));

  ALIASES.forEach(([patron, ingles]) => {
    if (patron.test(texto)) {
      tokenizar(ingles).forEach((token) => agregar(token, 1.7));
    }
  });

  EQUIPO.forEach(([patron, ingles]) => {
    const enNombre = patron.test(texto);
    if (enNombre || patron.test(textoDescripcion)) {
      tokenizar(ingles).forEach((token) => {
        // La descripción de la IA suele aclarar el material aunque el nombre no.
        agregar(token, enNombre ? 1.25 : 1.4);
        equipos.add(token);
      });
    }
  });

  return { tokens, equipos };
};

/** Índice en memoria con tokens e IDF. */
const registros = INDICE.map((ex) => {
  const nombreTokens = tokenizar(ex.n);
  const metaTokens = tokenizar([ex.eq, ex.bp, ex.tg, ex.mg].join(' '));
  const esTokens = tokenizar(ex.es);

  return {
    ex,
    nombre: nombreTokens,
    meta: metaTokens,
    es: esTokens,
    nombreSet: new Set(nombreTokens),
    metaSet: new Set(metaTokens),
    esSet: new Set(esTokens),
    nombreNormalizado: nombreTokens.join(' '),
  };
});

const frecuencia = new Map();
registros.forEach((r) => {
  new Set([...r.nombreSet, ...r.metaSet, ...r.esSet]).forEach((token) => {
    frecuencia.set(token, (frecuencia.get(token) || 0) + 1);
  });
});

const POR_ID = new Map(registros.map((r) => [r.ex.id, r]));
const POR_NOMBRE = new Map(registros.map((r) => [normalizarClave(r.ex.n), r]));

const TOTAL = registros.length;
const idf = (token) => {
  const df = frecuencia.get(token);
  if (!df) return 1.7;
  return Math.max(1, Math.log((TOTAL + 1) / (df + 1)) + 1);
};

const puntuar = (consulta, registro) => {
  let denominador = 0;
  let numerador = 0;
  const { tokens } = consulta;

  tokens.forEach((pesoConsulta, token) => {
    const pesoIdf = idf(token);
    denominador += pesoConsulta * pesoIdf;

    let coincidencia = 0;
    if (registro.nombreSet.has(token)) coincidencia = 1;
    else if (registro.metaSet.has(token)) coincidencia = 0.8;
    else if (registro.esSet.has(token)) coincidencia = 0.55;

    if (coincidencia) {
      numerador += pesoConsulta * pesoIdf * coincidencia;
    }
  });

  if (!denominador) return 0;

  let score = numerador / denominador;

  const textoConsulta = [...tokens.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .join(' ');

  if (registro.nombreNormalizado === textoConsulta) score += 0.5;
  else if (textoConsulta.length > 5 && registro.nombreNormalizado.includes(textoConsulta)) score += 0.12;

  // Si la IA dijo explícitamente el material, preferimos ejercicios con ese equipo.
  if (consulta.equipos && consulta.equipos.size) {
    const equipoReg = tokenizar(registro.ex.eq).find((t) => consulta.equipos.has(t));
    if (equipoReg) score += 0.08;
  }

  return Math.min(1, score);
};

const aResultado = (registro, score = 1) => {
  if (!registro || !registro.ex.g) return null;
  return {
    id: registro.ex.id,
    gifUrl: MEDIA_ROUTE + registro.ex.g,
    imgUrl: registro.ex.i ? MEDIA_ROUTE + registro.ex.i : '',
    nombreDataset: registro.ex.n,
    score: Number(score.toFixed(3)),
  };
};

const aResultadoLocal = (local) => ({
  id: local.id,
  gifUrl: local.gifUrl,
  imgUrl: '',
  nombreDataset: local.nombreDataset,
  score: 1,
});

/**
 * Devuelve la media del ejercicio o null si no hay una coincidencia fiable.
 * @param {string} nombre
 * @param {{descripcion?: string}} [opciones]
 * @returns {{id:string, gifUrl:string, imgUrl:string, nombreDataset:string, score:number}|null}
 */
const ocultarMedia = (nombre) => {
  const texto = normalizarClave(nombre);
  return OCULTAR.some((patron) => patron.test(texto));
};

const buscarMedia = (nombre, opciones = {}) => {
  const texto = String(nombre || '').trim();
  if (!texto) return null;

  // Primero el nombre tal cual y después la versión sin calificativos. Así los
  // nombres que ya eran exactos ("estiramiento dinámico de cadera") no se
  // rompen al quitar "dinámico".
  const claveExacta = normalizarClave(texto);
  const claveNombre = canonicalizarNombre(texto);

  // 1. Media local: movimientos que no existen en el dataset principal.
  const local = LOCALES.get(claveExacta) || LOCALES.get(claveNombre);
  if (local) return aResultadoLocal(local);

  // 2. Nombres conocidos de la rutina local: resolución directa por ID.
  if (EXACTOS.has(claveExacta)) {
    const id = EXACTOS.get(claveExacta);
    return id ? aResultado(POR_ID.get(id)) : null;
  }
  if (EXACTOS.has(claveNombre)) {
    const id = EXACTOS.get(claveNombre);
    return id ? aResultado(POR_ID.get(id)) : null;
  }

  // 3. A partir de aquí se prefiere ocultar antes que mostrar un gif erróneo.
  if (ocultarMedia(texto)) return null;

  // 4. El nombre ya viene en el idioma del dataset.
  const porNombre = POR_NOMBRE.get(claveExacta) || POR_NOMBRE.get(claveNombre);
  if (porNombre) return aResultado(porNombre);

  // 5. Alias que coinciden exactamente con un nombre del dataset. Esto evita
  //    que "mountain climbers" termine en una variante con puente, por ejemplo.
  let aliasExacto = null;
  let aliasLargo = -1;
  ALIASES.forEach(([patron, ingles]) => {
    if (!patron.test(quitarAcentos(texto).toLowerCase())) return;
    const claveAlias = normalizarClave(ingles);
    if (!claveAlias.includes(' ') || claveAlias.length < 6) return;

    const registro = POR_NOMBRE.get(claveAlias);
    if (registro && claveAlias.length > aliasLargo) {
      aliasExacto = registro;
      aliasLargo = claveAlias.length;
    }
  });
  if (aliasExacto) return aResultado(aliasExacto);

  // 6. Búsqueda difusa para los nombres libres que escribe la IA.
  const consulta = expandirConsulta(texto, opciones.descripcion);
  if (!consulta.tokens.size) return null;

  let mejor = null;
  let mejorScore = 0;

  registros.forEach((registro) => {
    const score = puntuar(consulta, registro);
    if (score > mejorScore) {
      mejorScore = score;
      mejor = registro;
    }
  });

  const umbral = Number.isFinite(opciones.umbral) ? opciones.umbral : UMBRAL;
  if (!mejor || mejorScore < umbral) return null;

  return aResultado(mejor, mejorScore);
};

/* ---------- Circuitos ---------- */

/**
 * Un circuito es una sola entrada de la rutina que agrupa 2-3 ejercicios, así
 * que no tiene un gif propio. Se resuelven sus componentes desde la
 * descripción ("Secuencia: A, B y C") para mostrarlos en carrusel.
 */
const RE_CIRCUITO = /^\s*circuito\b/i;
const UMBRAL_CIRCUITO = 0.6;

const esCircuito = (nombre) => RE_CIRCUITO.test(String(nombre || ''));

const limpiarDosis = (texto) => {
  let limpio = String(texto || '').trim();
  const patrones = [
    /^(?:rondas?|vueltas?|series?|bloques?)\s*(?:de\s*)?\d*\s*/i,
    /^\d+\s*(?:repeticiones?|reps?|veces)\b\s*(?:de\s*)?/i,
    /^\d+\s*(?:minutos?|mins?|segundos?|segs?|s)\b\s*(?:de\s*)?/i,
    /^\d+\s*(?:x|×)\s*/i,
    /^\d+\s+/,
  ];

  // "3 rondas de 10 sentadillas" necesita más de una pasada.
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    const antes = limpio;
    patrones.forEach((patron) => {
      limpio = limpio.replace(patron, '').trim();
    });
    if (limpio === antes) break;
  }

  return limpio;
};

const limpiarComponente = (texto) => {
  const limpio = limpiarDosis(texto)
    .replace(/\s*(?:x|×)\s*\d+\s*$/i, '')
    .replace(/\s+\d+\s*(?:reps?|repeticiones?|segs?|segundos?|mins?|minutos?|s)\b\s*$/i, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/^[\s,;:+\-/]+/, '')
    .replace(/[\s,;:+\-/]+$/, '')
    .replace(/^(?:y|e|o|u|de|del|con)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return limpiarDosis(limpio);
};

/** Extrae los nombres de ejercicio que menciona la descripción del circuito. */
const componentesDeCircuito = (descripcion) => {
  const bruto = String(descripcion || '').trim();
  if (!bruto) return [];

  // Solo la primera frase: después vienen adaptaciones y aclaraciones que no
  // son ejercicios ("Evita saltos...", "Agarre neutro...").
  const finFrase = bruto.search(/\.(?:\s|$)/);
  const primera = finFrase === -1 ? bruto : bruto.slice(0, finFrase);

  const limpia = primera
    // "Secuencia:", "Ronda 1:" o "Circuito de 4 estaciones:".
    .replace(/^\s*(?:secuencia|circuito|rondas?|bloques?|trabajo)\b[^:]{0,50}:\s*/i, ' ')
    .replace(/^\s*\d+\s*(?:rondas?|vueltas?|series?)\s*(?:de\s*)?:?\s*/i, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');

  return limpia
    .split(/\s*(?:,|\+|;|\/|\by\b)\s*/i)
    .map(limpiarComponente)
    .filter((parte) => normalizarClave(parte).length >= 4);
};

/**
 * Devuelve los gifs de los ejercicios que componen un circuito, en orden.
 * Nunca busca media para el nombre completo del circuito.
 * @param {string} nombre
 * @param {{descripcion?: string}} [opciones]
 * @returns {{componentes: Array<{id:string,gifUrl:string,imgUrl:string,nombreDataset:string,score:number,nombreComponente:string}>}|null}
 */
const buscarMediaDeCircuito = (nombre, opciones = {}) => {
  if (!esCircuito(nombre)) return null;

  const componentes = [];
  const vistos = new Set();

  componentesDeCircuito(opciones.descripcion).forEach((componente) => {
    const media = buscarMedia(componente, { umbral: UMBRAL_CIRCUITO });
    if (!media) return;
    if (vistos.has(media.id) || vistos.has(media.gifUrl)) return;

    vistos.add(media.id);
    vistos.add(media.gifUrl);
    componentes.push({ ...media, nombreComponente: componente });
  });

  return componentes.length ? { componentes } : null;
};

/* ---------- Proxy de archivos con caché en memoria ---------- */

const cache = new Map();
let cacheBytes = 0;

const contenidoPorExtension = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
};

const limpiarCache = (bytesNecesarios) => {
  while (cacheBytes + bytesNecesarios > CACHE_MAX_BYTES && cache.size) {
    const [clave, valor] = cache.entries().next().value;
    cacheBytes -= valor.buffer.length;
    cache.delete(clave);
  }
};

const descargarMedia = async (archivo) => {
  const nombre = String(archivo || '');
  if (!/^[0-9]{4}-[A-Za-z0-9_-]+\.(gif|jpg)$/.test(nombre)) return null;

  const enCache = cache.get(nombre);
  if (enCache) {
    // Mover al final: el Map conserva el orden de inserción y sirve como LRU.
    cache.delete(nombre);
    cache.set(nombre, enCache);
    return enCache;
  }

  const extension = nombre.slice(nombre.lastIndexOf('.')).toLowerCase();
  const carpeta = extension === '.gif' ? 'videos' : 'images';
  const url = `${UPSTREAM}/${carpeta}/${nombre}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = contenidoPorExtension[extension] || res.headers.get('content-type') || 'application/octet-stream';

    limpiarCache(buffer.length);
    const valor = { buffer, contentType };
    cache.set(nombre, valor);
    cacheBytes += buffer.length;

    return valor;
  } catch (err) {
    console.error(`[exercise-media] no se pudo descargar ${nombre}:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  buscarMedia,
  buscarMediaDeCircuito,
  esCircuito,
  descargarMedia,
  UMBRAL,
};
