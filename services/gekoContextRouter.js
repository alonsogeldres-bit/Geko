/* ===========================================
   ROUTER DE CONTEXTO DEL CHAT DE GEKO
   Clasificación ligera (sin llamadas extra a la IA) para decidir qué
   fuentes de datos necesita cada pregunta. Devuelve solo identificadores
   `FUENTES.*`: no lee la base ni construye texto.

   Regla general: si no hay una señal clara de datos personales, se
   devuelve un array vacío para enviar únicamente el prompt base.
   =========================================== */

const { FUENTES } = require('./gekoContextSources');

const ORDEN_FUENTES = [
  FUENTES.PERFIL,
  FUENTES.LESIONES,
  FUENTES.METRICAS,
  FUENTES.HISTORIAL,
  FUENTES.RUTINA,
];

const MAX_FUENTES = 4;

/* Señales de lesiones, dolor o limitaciones. */
const PATRONES_LESIONES = [
  /\blesion(es)?\b/,
  /\blesionad[oa]s?\b/,
  /\bdolor(es)?\b/,
  /\bduele(n)?\b/,
  /\bmolestia(s)?\b/,
  /\besguince(s)?\b/,
  /\bfractura(s)?\b/,
  /\btendinitis\b/,
  /\bdesgarro(s)?\b/,
  /\bcontractura(s)?\b/,
  /\bhernia(s)?\b/,
  /\bluxacion(es)?\b/,
  /\bpinzamiento\b/,
  /\brodilla(s)?\b/,
  /\bhombro(s)?\b/,
  /\bespalda\b/,
  /\blumbar\b/,
  /\bcervical\b/,
  /\btobillo(s)?\b/,
  /\bmuneca(s)?\b/,
  /\bcadera(s)?\b/,
  /\boperacion(es)?\b/,
  /\bcirugia(s)?\b/,
  /\blimitacion(es)?\b/,
  /\bantecedente(s)?\b/,
];

/* Señales de peso, medidas y evolución corporal. */
const PATRONES_METRICAS = [
  /\bpeso\b/,
  /\bpesa(s|r|mos)?\b/,
  /\bpes(e|o|aste|aron)?\b/,
  /\baltura\b/,
  /\bmide(s|n)?\b/,
  /\bmedicion(es)?\b/,
  /\bmedidas?\b/,
  /\bcintura\b/,
  /\bimc\b/,
  /\bbaje\b/,
  /\bbajado\b/,
  /\bsubi\b/,
  /\bsubido\b/,
  /\bgrasa\b/,
  /\bprogreso\b/,
  /\bevolucion\b/,
  /\bvariacion\b/,
  /\bkilogramo(s)?\b/,
  /\bkg\b/,
];

/* Señales de historial, racha y sesiones. */
const PATRONES_HISTORIAL = [
  /\bracha(s)?\b/,
  /\bsesion(es)?\b/,
  /\bhistorial\b/,
  /\bactividad\b/,
  /\bconstancia\b/,
  /\besfuerzo\b/,
  /\brpe\b/,
  /\bcomplete\b/,
  /\bcompletado(s)?\b/,
  /\bhe entrenado\b/,
  /\bentrene\b/,
  /\bentrenaste\b/,
  /\bmis entrenamientos\b/,
  /\bultimos? entrenamientos?\b/,
  /\bcuantas veces\b/,
  /\besta semana\b/,
  /\bultimo entrenamiento\b/,
  /\bque hice\b/,
  /\bhe hecho\b/,
  /\bayer\b/,
  /\banteayer\b/,
  /\bultimos? dias\b/,
];

/* Señales de la rutina generada para hoy. */
const PATRONES_RUTINA = [
  /\brutina(s)?\b/,
  /\bque entreno\b/,
  /\bque me toca\b/,
  /\bque hago hoy\b/,
  /\bcalentamiento\b/,
  /\bestiramiento\b/,
  /\bserie(s)?\b/,
  /\brepeticion(es)?\b/,
  /\bme tocan?\b/,
  /\bejercicios? de hoy\b/,
  /\bque ejercicios (me tocan|hago hoy|tengo hoy)\b/,
  /\brutina de hoy\b/,
  /\bplan de hoy\b/,
];

/* Señales de datos del perfil que no encajan en las fuentes anteriores. */
const PATRONES_PERFIL = [
  /\bmi perfil\b/,
  /\bmi objetivo\b/,
  /\bmi meta\b/,
  /\bmi nivel\b/,
  /\bnivel fisico\b/,
  /\bmi tiempo\b/,
  /\btiempo (de|por) sesion\b/,
  /\bminutos (de|por) sesion\b/,
  /\bmi lugar\b/,
  /\bmi entorno\b/,
  /\bdonde entreno\b/,
  /\bmi equipamiento\b/,
  /\bque equipamiento\b/,
  /\bque equipo\b/,
  /\bque material\b/,
  /\bmis dias\b/,
  /\bcuantos dias\b/,
  /\bque dias\b/,
  /\bdias de la semana\b/,
  /\bdias de entrenamiento\b/,
  /\bmi plan\b/,
  /\bmi suscripcion\b/,
  /\bsoy premium\b/,
  /\btengo premium\b/,
  /\bconfiguracion de entrenamiento\b/,
  /\bdonde cambio mi\b/,
  /\bcomo cambio mi\b/,
];

/* Resumen personal amplio: aquí sí tiene sentido cargar varias fuentes. */
const PATRONES_GENERAL = [
  /\bcomo voy\b/,
  /\bcomo estoy\b/,
  /\bcomo me va\b/,
  /\bque tal voy\b/,
  /\bmi progreso\b/,
  /\bmi estado\b/,
  /\bmi rendimiento\b/,
  /\bresumen\b/,
];

const SALUDOS = [
  /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|como estas|quien eres|que haces|gracias|muchas gracias|ok|vale|chao|adios|hasta luego|nos vemos)[\s!,.?]*$/,
];

const MARCADORES_PERSONALES = /\b(mi|mis|tengo|soy|llevo)\b/;

/** Minúsculas, sin tildes y con espacios normalizados. */
const normalizar = (valor) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const esSaludo = (texto) => SALUDOS.some((re) => re.test(texto));

/**
 * Detecta intenciones en un texto ya normalizado.
 * Devuelve un Set de fuentes y si encontró alguna señal.
 */
const detectarIntenciones = (texto) => {
  const fuentes = new Set();
  let hayIntencion = false;

  const grupos = [
    [FUENTES.LESIONES, PATRONES_LESIONES],
    [FUENTES.METRICAS, PATRONES_METRICAS],
    [FUENTES.HISTORIAL, PATRONES_HISTORIAL],
    [FUENTES.RUTINA, PATRONES_RUTINA],
  ];

  for (const [fuente, patrones] of grupos) {
    if (patrones.some((re) => re.test(texto))) {
      fuentes.add(fuente);
      hayIntencion = true;
    }
  }

  if (PATRONES_GENERAL.some((re) => re.test(texto))) {
    fuentes.add(FUENTES.PERFIL);
    fuentes.add(FUENTES.METRICAS);
    fuentes.add(FUENTES.HISTORIAL);
    hayIntencion = true;
  }

  if (PATRONES_PERFIL.some((re) => re.test(texto))) {
    fuentes.add(FUENTES.PERFIL);
    hayIntencion = true;
  }

  return { fuentes, hayIntencion };
};

/** Última pregunta del usuario dentro del historial de la sesión. */
const ultimaPreguntaUsuario = (historial) => {
  if (!Array.isArray(historial)) return '';

  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m && m.role === 'user' && m.content) return String(m.content);
  }

  return '';
};

/** Orden estable y límite de bloques para no volver a saturar el prompt. */
const ordenarSeleccion = (fuentes) => {
  const lista = ORDEN_FUENTES.filter((f) => fuentes.has(f));
  return lista.length > MAX_FUENTES ? lista.slice(0, MAX_FUENTES) : lista;
};

/**
 * Decide qué fuentes necesita la pregunta.
 *
 * - Saludos o consultas generales sin datos personales: [] (solo prompt base).
 * - Lesiones: perfil + lesiones.
 * - Métricas: perfil + métricas.
 * - Historial: perfil + historial.
 * - Rutina de hoy: perfil + rutina.
 * - Seguimiento corto ("¿y eso?"): reutiliza la intención anterior.
 */
const seleccionarFuentes = (mensaje, historial = []) => {
  const texto = normalizar(mensaje);
  if (!texto) return [];

  const { fuentes, hayIntencion } = detectarIntenciones(texto);

  if (!hayIntencion) {
    if (esSaludo(texto)) return [];

    // Seguimiento corto: se apoya en la última pregunta del usuario.
    if (texto.length <= 40) {
      const previa = normalizar(ultimaPreguntaUsuario(historial));
      if (previa) {
        const anterior = detectarIntenciones(previa);
        if (anterior.hayIntencion) {
          anterior.fuentes.add(FUENTES.PERFIL);
          return ordenarSeleccion(anterior.fuentes);
        }
      }
    }

    // Consulta personal no reconocida: contexto mínimo, no todos los bloques.
    if (MARCADORES_PERSONALES.test(texto)) return [FUENTES.PERFIL];
    return [];
  }

  // Cualquier consulta con datos personales incluye el perfil como base.
  fuentes.add(FUENTES.PERFIL);
  return ordenarSeleccion(fuentes);
};

module.exports = {
  seleccionarFuentes,
  normalizar,
  MAX_FUENTES,
};
