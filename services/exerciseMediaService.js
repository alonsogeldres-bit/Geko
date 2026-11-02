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
  ['movilidad articular', null],
  ['trote suave en el lugar', null],
  ['rotaciones de tronco', null],
  ['circulos de brazos', null],
  ['movilidad de cadera', null],
  ['movilidad de hombros', null],

  ['sentadillas sin peso', '3543'],
  ['sentadilla con peso corporal', '3543'],
  ['sentadilla al aire libre', '3543'],
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
  ['bird dog', null],
  ['face pull en polea', null],
  ['estiramiento de gato camello', null],
  ['trote en el lugar', null],
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

  if (ocultarMedia(texto)) return null;

  const claveNombre = normalizarClave(texto);

  // 1. Nombres conocidos de la rutina local: resolución directa por ID.
  if (EXACTOS.has(claveNombre)) {
    const id = EXACTOS.get(claveNombre);
    return id ? aResultado(POR_ID.get(id)) : null;
  }

  // 2. El nombre ya viene en el idioma del dataset.
  const porNombre = POR_NOMBRE.get(claveNombre);
  if (porNombre) return aResultado(porNombre);

  // 3. Alias que coinciden exactamente con un nombre del dataset. Esto evita
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

  // 4. Búsqueda difusa para los nombres libres que escribe la IA.
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

  if (!mejor || mejorScore < UMBRAL) return null;

  return aResultado(mejor, mejorScore);
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
  descargarMedia,
  UMBRAL,
};
