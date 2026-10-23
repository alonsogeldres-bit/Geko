/* ===========================================
   SERVICIO DE RUTINAS CON GEMINI
   Cliente de la API de Google Generative AI.

   No toca la base de datos: solo arma la rutina.
   La lógica de negocio vive en el controlador
   (controllers/trainingController.js), que es el que
   decide cuándo se usa este servicio.

   Contrato:
     generarRutinaPersonalizada({ tiempoDisponible, lugarEntrenamiento })
     -> { calentamiento[], rutinaPrincipal[], estiramiento[], tiempoTotalMin,
          lugarEntrenamiento, fuente }

   `fuente` vale 'gemini' cuando la rutina la escribió el modelo
   y 'local' cuando se usó el generador de respaldo.
   =========================================== */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generarRutinaLocal } = require('./localRoutineService');

/* Nombre del modelo. Se puede cambiar por .env sin tocar el código. */
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/* Lugares que el prompt acepta. */
const LUGARES_PERMITIDOS = ['Gimnasio', 'Casa', 'Aire libre', 'Mixto'];

const MAX_INTENTOS = 2;
const ESPERA_BASE_MS = 1500;

/* Timeout de cada llamada. La pantalla no debe quedar esperando colgada:
   si la API no responde a tiempo, se cae al generador local. */
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 10000;

/**
 * Instancia del modelo. Falla si falta la API key.
 */
const getGenerativeAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: MODEL_NAME });
};

/**
 * Detecta los errores de saturación de la API (503, 429, quota...)
 * y también los timeouts. Todos son casos en los que tiene sentido
 * reintentar y, si no se recuperan, caer al generador local.
 */
const esErrorDeSaturacion = (error) => {
  if (!error) return false;

  const msg = String(error.message || '').toLowerCase();
  const name = String(error.name || '').toLowerCase();

  if (name.includes('abort') || msg.includes('aborted') || msg.includes('timeout')) {
    return true;
  }

  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('overload') ||
    msg.includes('resource exhausted') ||
    msg.includes('service unavailable')
  );
};

/** Normaliza el lugar de entrenamiento a los valores que entiende el prompt. */
const normalizarLugar = (lugar) => {
  const limpio = String(lugar || '').trim();
  const encontrado = LUGARES_PERMITIDOS.find((l) => l.toLowerCase() === limpio.toLowerCase());
  return encontrado || 'Casa';
};

/** Número entero seguro, con valor por defecto. */
const aNumero = (valor, porDefecto) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
};

/**
 * Deja la rutina con la forma que la vista espera, aunque el modelo
 * devuelva campos de más, de menos o con tipos raros.
 */
const normalizarRutina = (rutina, { tiempo, lugar }) => {
  const conDuracion = (ej) => ({
    nombre: String(ej.nombre || 'Ejercicio'),
    duracionMin: Math.max(1, Math.round(aNumero(ej.duracionMin, 3))),
    descripcion: String(ej.descripcion || ''),
  });

  return {
    calentamiento: Array.isArray(rutina.calentamiento) ? rutina.calentamiento.map(conDuracion) : [],
    rutinaPrincipal: Array.isArray(rutina.rutinaPrincipal)
      ? rutina.rutinaPrincipal.map((ej) => ({
          nombre: String(ej.nombre || 'Ejercicio'),
          series: Math.max(1, Math.round(aNumero(ej.series, 3))),
          repeticiones: Math.max(1, Math.round(aNumero(ej.repeticiones, 10))),
          descansoSeg: Math.max(0, Math.round(aNumero(ej.descansoSeg, 60))),
          descripcion: String(ej.descripcion || ''),
        }))
      : [],
    estiramiento: Array.isArray(rutina.estiramiento) ? rutina.estiramiento.map(conDuracion) : [],
    tiempoTotalMin: Math.max(1, Math.round(aNumero(rutina.tiempoTotalMin, tiempo))),
    lugarEntrenamiento: String(rutina.lugarEntrenamiento || lugar),
  };
};

/** Arma el prompt. Solo recibe tiempo y lugar: es la única información del usuario. */
const construirPrompt = (tiempo, lugar) => `Actúa como un entrenador personal experto en entrenamiento físico.

REQUISITOS OBLIGATORIOS:
- Genera UNA SOLA rutina de entrenamiento adaptada EXCLUSIVAMENTE a:
  - tiempo_disponible = ${tiempo} minutos
  - lugar_entrenamiento = ${lugar}
- NO utilices información adicional (edad, peso, altura, objetivos, historial, lesiones, nivel, equipamiento u otros datos). Solo estos dos parámetros.
- Responde ÚNICAMENTE con un objeto JSON válido y sin texto adicional, sin markdown, sin comentarios.

ESTRUCTURA OBLIGATORIA A DEVOLVER:
{
  "calentamiento": [
    {
      "nombre": "string",
      "duracionMin": number,
      "descripcion": "string"
    }
  ],
  "rutinaPrincipal": [
    {
      "nombre": "string",
      "series": number,
      "repeticiones": number,
      "descansoSeg": number,
      "descripcion": "string"
    }
  ],
  "estiramiento": [
    {
      "nombre": "string",
      "duracionMin": number,
      "descripcion": "string"
    }
  ],
  "tiempoTotalMin": number,
  "lugarEntrenamiento": "${lugar}"
}

INSTRUCCIONES PARA LA DISTRIBUCIÓN DEL TIEMPO (${tiempo} min):
- Distribuye el tiempo total de forma lógica entre calentamiento, rutina principal y estiramiento.
- Ajusta el número de ejercicios, series, repeticiones, descansos y duraciones para que el total sea coherente con ${tiempo} minutos.
- Adapta TODOS los ejercicios al lugar de entrenamiento (${lugar}).
  - Si es "Casa": prioriza ejercicios con peso corporal.
  - Si es "Gimnasio": puedes incluir máquinas, barras, mancuernas.
  - Si es "Aire libre": prioriza ejercicios funcionales sin equipos fijos.
  - Si es "Mixto": usa combinación adecuada.
- Los ejercicios deben ser seguros, claros y ejecutables.
- Usa valores numéricos realistas (descansos entre 30 y 120 segundos según ejercicio).
- "descansoSeg" es el descanso DESPUÉS de cada serie, en segundos.
- "tiempoTotalMin" debe ser coherente con ${tiempo} minutos.`;

/**
 * Genera una rutina de entrenamiento personalizada.
 * No guarda nada en la base de datos.
 * Si la API está saturada, cae al generador local.
 */
const generarRutinaPersonalizada = async ({ tiempoDisponible, lugarEntrenamiento }) => {
  const tiempo = Math.round(aNumero(tiempoDisponible, 0));

  if (!tiempo || tiempo <= 0) {
    throw new Error('tiempoDisponible debe ser un número válido de minutos.');
  }

  const lugar = String(lugarEntrenamiento || '').trim();
  if (!lugar) {
    throw new Error('lugarEntrenamiento es obligatorio.');
  }

  const lugarNormalizado = normalizarLugar(lugar);
  const prompt = construirPrompt(tiempo, lugarNormalizado);

  /* Sin API key no se puede llamar a Gemini: se entrega la rutina de respaldo
     para que la pantalla siga funcionando. */
  if (!process.env.GEMINI_API_KEY) {
    return generarRutinaLocal({ tiempoDisponible: tiempo, lugarEntrenamiento: lugarNormalizado });
  }

  const model = getGenerativeAI();
  let lastError = null;

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const result = await model.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        },
        { timeout: TIMEOUT_MS }
      );

      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new Error('La respuesta del modelo está vacía.');
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : text.trim();

      const rutina = normalizarRutina(JSON.parse(jsonText), { tiempo, lugar: lugarNormalizado });

      if (!rutina.rutinaPrincipal.length) {
        throw new Error('La respuesta del modelo no tiene ejercicios en la rutina principal.');
      }

      rutina.fuente = 'gemini';
      return rutina;
    } catch (error) {
      lastError = error;

      /* Si la API está saturada, se reintenta con espera creciente. */
      if (esErrorDeSaturacion(error) && intento < MAX_INTENTOS) {
        await new Promise((r) => setTimeout(r, ESPERA_BASE_MS * intento));
        continue;
      }

      /* Saturación que no se recuperó: se usa la rutina local. */
      if (esErrorDeSaturacion(error)) {
        return generarRutinaLocal({ tiempoDisponible: tiempo, lugarEntrenamiento: lugarNormalizado });
      }

      break;
    }
  }

  /* Cualquier otro error se propaga para que el controller lo maneje. */
  throw new Error(
    'Error al generar rutina con Gemini: ' + (lastError ? lastError.message : 'Desconocido')
  );
};

module.exports = {
  generarRutinaPersonalizada,
  normalizarLugar,
  getGenerativeAI,
  MODEL_NAME,
  TIMEOUT_MS,
  LUGARES_PERMITIDOS,
};
