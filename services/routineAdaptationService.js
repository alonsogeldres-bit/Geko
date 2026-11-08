/* ===========================================
   AJUSTE DE LA RUTINA SEGÚN EL ESFUERZO PERCIBIDO (RPE)
   Al terminar de entrenar el usuario dice qué tan difícil fue (1 a 4):

     1 Fácil        -> sube un poco las repeticiones (+10 %)
     2 Moderado     -> no cambia nada
     3 Difícil      -> baja un poco las repeticiones (-10 %)
     4 Muy difícil  -> baja las repeticiones algo más (-20 %)

   Solo se tocan las repeticiones (o los segundos) de la rutina principal:
   series, descansos, calentamiento, estiramiento y datos del usuario quedan
   igual. Es un módulo puro: no usa la base de datos ni la IA.
   =========================================== */

const FACTOR_POR_ESFUERZO = Object.freeze({ 1: 0.1, 2: 0, 3: -0.1, 4: -0.2 });

const MIN_REPS = 5;
const MAX_REPS = 30;
const MIN_SEG = 15;
const MAX_SEG = 90;

const MENSAJES = Object.freeze({
  bajar: 'Evaluación guardada. Modificaremos tu rutina para que te sea más cómoda.',
  subir: 'Evaluación guardada. Modificaremos tu rutina para que sea un poco más desafiante.',
  mantener: 'Evaluación guardada. Tu rutina se queda como está.',
});

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));

/** "Plancha frontal" o "sostén": el número de repeticiones se lee como segundos. */
const PATRON_ISOMETRICO = /plancha|plank|superman|hollow|isometric|isométric|sost[eé]n|sostener|wall\s?sit/i;

/** "30 s" / "45 seg" / "1 min" */
const PATRON_TIEMPO = /(\d+)\s*(minutos?|min|segundos?|seg|s)\b/i;

/** Aplica el factor a un número y garantiza que cambie al menos 1 si hay margen. */
const ajustarNumero = (n, factor, min, max, paso = 1) => {
  const base = limitar(n, min, max);
  let nuevo = Math.round((base * (1 + factor)) / paso) * paso;
  if (nuevo === base) nuevo = base + Math.sign(factor) * paso;
  return limitar(nuevo, min, max);
};

/**
 * Ajusta el texto de repeticiones de UN ejercicio.
 * Devuelve el texto nuevo, o null si no se puede o no hay nada que cambiar
 * (por ejemplo "al fallo", o ya está en el mínimo/máximo).
 */
const ajustarRepeticiones = (texto, factor, { isometrico = false } = {}) => {
  const original = String(texto ?? '').trim();
  if (!original || !factor) return null;

  // Tiempo explícito: se ajusta en segundos, de 5 en 5.
  const tiempo = original.match(PATRON_TIEMPO);
  if (tiempo) {
    const n = parseInt(tiempo[1], 10);
    const seg = /^min/i.test(tiempo[2]) ? n * 60 : n;
    if (!(seg > 0)) return null;
    const nuevo = ajustarNumero(seg, factor, MIN_SEG, MAX_SEG, 5);
    const resultado = original.replace(PATRON_TIEMPO, `${nuevo} s`);
    return resultado === original ? null : resultado;
  }

  // Números sueltos ("12", "10-12", "12 por lado"): cada número se ajusta.
  if (!/\d/.test(original)) return null;

  const [min, max, paso] = isometrico ? [MIN_SEG, MAX_SEG, 5] : [MIN_REPS, MAX_REPS, 1];
  const numeros = [];
  const resultado = original.replace(/\d+/g, (n) => {
    const valor = parseInt(n, 10);
    if (!(valor > 0)) return n;
    const nuevo = ajustarNumero(valor, factor, min, max, paso);
    numeros.push(nuevo);
    return String(nuevo);
  });

  if (!numeros.length || resultado === original) return null;
  return resultado;
};

/** "bajar" | "subir" | "mantener" según el esfuerzo. */
const direccionDeEsfuerzo = (esfuerzo) => {
  const factor = FACTOR_POR_ESFUERZO[Math.round(Number(esfuerzo))] || 0;
  if (factor < 0) return 'bajar';
  if (factor > 0) return 'subir';
  return 'mantener';
};

/**
 * Devuelve una COPIA de la rutina con las repeticiones ajustadas.
 * @param {Object} rutina    { calentamiento, rutinaPrincipal, estiramiento, ... }
 * @param {number} esfuerzo  1..4
 * @returns {{ rutina: Object, direccion: string, mensaje: string,
 *             cambios: Array<{nombre: string, antes: string, despues: string}> }}
 */
const ajustarRutinaPorEsfuerzo = (rutina, esfuerzo) => {
  const direccion = direccionDeEsfuerzo(esfuerzo);
  const factor = FACTOR_POR_ESFUERZO[Math.round(Number(esfuerzo))] || 0;
  const cambios = [];

  if (!rutina || typeof rutina !== 'object') {
    return { rutina, direccion, mensaje: MENSAJES[direccion], cambios };
  }

  const copia = { ...rutina };

  if (factor && Array.isArray(rutina.rutinaPrincipal)) {
    copia.rutinaPrincipal = rutina.rutinaPrincipal.map((ejercicio) => {
      if (!ejercicio || typeof ejercicio !== 'object') return ejercicio;

      const antes = String(ejercicio.repeticiones ?? '').trim();
      const isometrico = PATRON_ISOMETRICO.test(String(ejercicio.nombre || ''));
      const despues = ajustarRepeticiones(antes, factor, { isometrico });
      if (!despues) return ejercicio;

      cambios.push({ nombre: String(ejercicio.nombre || ''), antes, despues });
      return { ...ejercicio, repeticiones: despues };
    });
  }

  return { rutina: copia, direccion, mensaje: MENSAJES[direccion], cambios };
};

module.exports = {
  ajustarRutinaPorEsfuerzo,
  ajustarRepeticiones,
  direccionDeEsfuerzo,
  MENSAJES,
  FACTOR_POR_ESFUERZO,
};
