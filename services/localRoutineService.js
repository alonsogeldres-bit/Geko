/* ===========================================
   GENERADOR LOCAL DE RUTINAS (RESPALDO)
   Se usa cuando la API de Gemini no responde o está saturada.
   No guarda nada en la base de datos.

   Usa ÚNICAMENTE tiempoDisponible y lugarEntrenamiento,
   y devuelve la misma estructura que el servicio de Gemini.
   =========================================== */

const LUGARES_PERMITIDOS = ['Gimnasio', 'Casa', 'Aire libre', 'Mixto'];

/** Normaliza el lugar de entrenamiento a los valores permitidos. */
const normalizarLugar = (lugarEntrenamiento) => {
  const limpio = String(lugarEntrenamiento || '').trim();
  if (!limpio) return 'Casa';
  const encontrado = LUGARES_PERMITIDOS.find((l) => l.toLowerCase() === limpio.toLowerCase());
  return encontrado || 'Casa';
};

/**
 * Arma una rutina de respaldo para el tiempo y el lugar indicados.
 * La distribución es aproximada: 15% calentamiento, 65% rutina
 * principal y 20% estiramiento.
 */
const generarRutinaLocal = ({ tiempoDisponible, lugarEntrenamiento }) => {
  const tiempo = Math.max(1, Math.round(Number(tiempoDisponible) || 30));
  const lugar = normalizarLugar(lugarEntrenamiento);

  const calMin = Math.max(3, Math.round(tiempo * 0.15));
  const estMin = Math.max(3, Math.round(tiempo * 0.2));
  const princMin = Math.max(10, tiempo - calMin - estMin);

  const calentamiento = [];
  const rutinaPrincipal = [];
  const estiramiento = [];

  /* CALENTAMIENTO */
  if (lugar === 'Casa' || lugar === 'Aire libre' || lugar === 'Mixto') {
    calentamiento.push(
      {
        nombre: 'Movilidad articular dinámica',
        duracionMin: Math.max(2, Math.round(calMin * 0.4)),
        descripcion: 'Rotaciones de hombros, caderas, rodillas y tobillos.',
      },
      {
        nombre: 'Trote ligero',
        duracionMin: Math.max(2, calMin - Math.round(calMin * 0.4)),
        descripcion: 'Sube la temperatura corporal a ritmo suave.',
      }
    );
  } else {
    calentamiento.push(
      {
        nombre: 'Cardio en máquina (suave)',
        duracionMin: Math.max(3, Math.round(calMin * 0.5)),
        descripcion: 'Bicicleta o elíptica a ritmo moderado.',
      },
      {
        nombre: 'Movilidad articular',
        duracionMin: Math.max(2, calMin - Math.round(calMin * 0.5)),
        descripcion: 'Prepara las articulaciones para el trabajo con cargas.',
      }
    );
  }

  /* RUTINA PRINCIPAL */
  if (lugar === 'Casa') {
    rutinaPrincipal.push(
      {
        nombre: 'Sentadillas con peso corporal',
        series: 4,
        repeticiones: 12,
        descansoSeg: 60,
        descripcion: 'Tren inferior. Espalda recta y bajada controlada.',
      },
      {
        nombre: 'Flexiones',
        series: 4,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Tren superior. Mantén el core tenso.',
      },
      {
        nombre: 'Zancadas alternas',
        series: 3,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Trabaja piernas y equilibrio.',
      },
      {
        nombre: 'Plancha estática',
        series: 3,
        repeticiones: 1,
        descansoSeg: 45,
        descripcion: 'Core estable. Mantén entre 30 y 40 segundos.',
      }
    );
  } else if (lugar === 'Gimnasio') {
    rutinaPrincipal.push(
      {
        nombre: 'Press de pecho (máquina o barra)',
        series: 4,
        repeticiones: 10,
        descansoSeg: 75,
        descripcion: 'Tren superior. Control en la excéntrica.',
      },
      {
        nombre: 'Jalón al pecho o remo',
        series: 4,
        repeticiones: 10,
        descansoSeg: 75,
        descripcion: 'Espalda. Tensión controlada.',
      },
      {
        nombre: 'Sentadillas con barra',
        series: 4,
        repeticiones: 10,
        descansoSeg: 90,
        descripcion: 'Tren inferior. Técnica segura.',
      },
      {
        nombre: 'Press militar o hombros',
        series: 3,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Hombros con buen control.',
      },
      {
        nombre: 'Curl o tríceps',
        series: 3,
        repeticiones: 12,
        descansoSeg: 45,
        descripcion: 'Aislamiento complementario.',
      }
    );
  } else if (lugar === 'Aire libre') {
    rutinaPrincipal.push(
      {
        nombre: 'Sentadillas con peso corporal',
        series: 4,
        repeticiones: 12,
        descansoSeg: 60,
        descripcion: 'Tren inferior funcional.',
      },
      {
        nombre: 'Flexiones',
        series: 4,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Tren superior con peso corporal.',
      },
      {
        nombre: 'Zancadas en marcha',
        series: 4,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Potencia y estabilidad.',
      },
      {
        nombre: 'Burpees',
        series: 3,
        repeticiones: 8,
        descansoSeg: 75,
        descripcion: 'Cardio-fuerza. Ritmo controlado.',
      }
    );
  } else {
    rutinaPrincipal.push(
      {
        nombre: 'Sentadillas (mixto)',
        series: 4,
        repeticiones: 12,
        descansoSeg: 60,
        descripcion: 'Tren inferior adaptable al entorno.',
      },
      {
        nombre: 'Flexiones o press',
        series: 4,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Tren superior versátil.',
      },
      {
        nombre: 'Remo invertido o remo con carga',
        series: 3,
        repeticiones: 10,
        descansoSeg: 60,
        descripcion: 'Espalda con los recursos disponibles.',
      },
      {
        nombre: 'Plancha y marcha estática',
        series: 3,
        repeticiones: 1,
        descansoSeg: 45,
        descripcion: 'Core funcional.',
      }
    );
  }

  /* Con poco tiempo para la parte principal se recorta a 3 ejercicios. */
  if (princMin < 25 && rutinaPrincipal.length > 3) {
    rutinaPrincipal.splice(3);
  }

  /* ESTIRAMIENTO */
  const estParte = Math.max(2, Math.round(estMin * 0.33));
  estiramiento.push(
    {
      nombre: 'Estiramiento de cuádriceps',
      duracionMin: estParte,
      descripcion: 'Mantén de 20 a 30 segundos por lado.',
    },
    {
      nombre: 'Estiramiento de isquiotibiales',
      duracionMin: estParte,
      descripcion: 'Suave, sin rebotes.',
    },
    {
      nombre: 'Estiramiento de hombros y espalda',
      duracionMin: Math.max(2, estMin - 2 * estParte),
      descripcion: 'Relajación y recuperación.',
    }
  );

  return {
    calentamiento,
    rutinaPrincipal,
    estiramiento,
    tiempoTotalMin: tiempo,
    lugarEntrenamiento: lugar,
    fuente: 'local',
  };
};

module.exports = {
  generarRutinaLocal,
  normalizarLugar,
  LUGARES_PERMITIDOS,
};
