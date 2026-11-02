/* ===========================================
   FUENTES DE CONTEXTO DEL CHAT DE GEKO
   Cada fuente se construye por separado y solo se serializa si el router
   la selecciona para la pregunta del usuario. Así el prompt no recibe
   bloques de datos que no hacen falta.

   Este módulo es puro: no consulta la base de datos ni llama a la IA.
   =========================================== */

/** Identificadores internos de cada fuente de contexto. */
const FUENTES = Object.freeze({
  PERFIL: 'USER_PROFILE',
  LESIONES: 'USER_INJURIES',
  METRICAS: 'USER_METRICS',
  HISTORIAL: 'WORKOUT_HISTORY',
  RUTINA: 'TODAY_ROUTINE',
});

/** Etiqueta XML con la que se inyecta cada fuente en el prompt. */
const ETIQUETAS = Object.freeze({
  [FUENTES.PERFIL]: 'perfil_usuario',
  [FUENTES.LESIONES]: 'definicion_lesiones',
  [FUENTES.METRICAS]: 'metricas_usuario',
  [FUENTES.HISTORIAL]: 'historial_entrenamientos',
  [FUENTES.RUTINA]: 'rutina_de_hoy',
});

/** Orden estable para renderizar los bloques. */
const ORDEN_FUENTES = Object.freeze([
  FUENTES.PERFIL,
  FUENTES.LESIONES,
  FUENTES.METRICAS,
  FUENTES.HISTORIAL,
  FUENTES.RUTINA,
]);

/* ---------- Helpers de texto ---------- */

/** Limpia texto libre para que no rompa el prompt (mantiene saltos de línea). */
const limpiarTexto = (valor, max, unaLinea = false) => {
  let t = String(valor ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (unaLinea) t = t.replace(/[\r\n\t]+/g, ' ');
  else t = t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.replace(/[ \t]{2,}/g, ' ').trim().slice(0, max);
};

/**
 * Limpia un dato que se inyecta dentro de etiquetas XML.
 * Además de lo anterior, quita `<` y `>` para que el texto del usuario no
 * pueda cerrar o abrir bloques del prompt.
 */
const limpiarDato = (valor, max, unaLinea = false) =>
  limpiarTexto(String(valor ?? '').replace(/[<>]/g, ''), max, unaLinea);

/** Lista de textos (acepta arrays de strings o de objetos con `nombre`). */
const listaTexto = (lista, max = 40) =>
  (Array.isArray(lista) ? lista : [])
    .map((item) => {
      const valor = item && typeof item === 'object' ? item.nombre : item;
      return limpiarDato(valor, max, true);
    })
    .filter(Boolean)
    .slice(0, 12)
    .join(', ');

const numeroSeguro = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

/** Número opcional: null/undefined/'' no se convierten en 0. */
const numeroOpcional = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

/** Fecha local: evita el corrimiento de zona de `new Date('YYYY-MM-DD')`. */
const parseFecha = (valor) => {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(valor);
};

const fechaCorta = (valor) => {
  if (!valor) return '';
  const d = parseFecha(valor);
  if (Number.isNaN(d.getTime())) return limpiarDato(valor, 20, true);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* ---------- Bloques por fuente ---------- */

const bloquePerfil = ({ usuario = {}, perfil = {}, esPremium = false } = {}) => {
  const nombre = limpiarDato(usuario.nombre, 40, true) || 'Atleta';
  const objetivo = limpiarDato(perfil.objetivo, 60, true) || 'no definido';
  const nivel = limpiarDato(perfil.nivelFisico, 20, true) || 'no definido';
  const lugar = limpiarDato(perfil.entorno, 30, true) || 'no definido';
  const minutos = numeroOpcional(perfil.minutosSesion);
  const dias = (Array.isArray(perfil.dias) ? perfil.dias : [])
    .map((d) => limpiarDato(d, 20, true))
    .filter(Boolean);

  const lineas = [
    `- Nombre: ${nombre}`,
    `- Plan: ${esPremium ? 'Premium' : 'Gratis'}`,
    `- Objetivo: ${objetivo}`,
    `- Nivel físico: ${nivel}`,
    `- Lugar donde entrena: ${lugar}`,
    `- Tiempo por sesión: ${minutos !== null && minutos > 0 ? `${minutos} minutos` : 'no definido'}`,
    `- Días de entrenamiento: ${dias.length ? dias.join(', ') : 'no definidos'}`,
    `- Equipamiento disponible: ${listaTexto(perfil.equipamiento) || 'no registrado'}`,
  ];

  const nota = limpiarDato(perfil.observacionObjetivo, 200, true);
  if (nota) lineas.push(`- Nota del usuario sobre su objetivo: "${nota}"`);

  return lineas;
};

const bloqueLesiones = ({ perfil = {} } = {}) => {
  const lesiones = listaTexto(perfil.lesiones);
  return [`- Zonas con lesión o limitación: ${lesiones || 'ninguna registrada'}`];
};

const bloqueMetricas = ({ perfil = {}, mediciones = [] } = {}) => {
  const meds = (Array.isArray(mediciones) ? mediciones : [])
    .map((m) => ({
      fecha: m && (m.fecha_medicion ?? m.fecha),
      peso: numeroOpcional(m && (m.peso_kg ?? m.peso)),
      altura: numeroOpcional(m && (m.altura_cm ?? m.altura)),
      nivel: limpiarDato(m && (m.nivel_fisico ?? m.nivel), 20, true),
    }))
    .filter((m) => m.peso !== null || m.altura !== null || m.nivel)
    .sort((a, b) => {
      const ta = a.fecha ? parseFecha(a.fecha).getTime() : 0;
      const tb = b.fecha ? parseFecha(b.fecha).getTime() : 0;
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

  // Si todavía no hay historial de mediciones, se usa la última del perfil.
  if (!meds.length) {
    const peso = numeroOpcional(perfil.pesoKg);
    const altura = numeroOpcional(perfil.alturaCm);
    const nivel = limpiarDato(perfil.nivelFisico, 20, true);
    if (peso !== null || altura !== null || nivel) {
      meds.push({ fecha: null, peso, altura, nivel });
    }
  }

  if (!meds.length) return ['- Todavía no hay mediciones registradas.'];

  const ultima = meds[0];
  const partes = [];
  if (ultima.peso !== null) partes.push(`peso ${ultima.peso} kg`);
  if (ultima.altura !== null) partes.push(`altura ${ultima.altura} cm`);
  if (ultima.nivel) partes.push(`nivel ${ultima.nivel}`);

  const lineas = [
    `- Última medición${ultima.fecha ? ` (${fechaCorta(ultima.fecha)})` : ''}: ${partes.join(', ') || 'sin datos completos'}.`,
  ];

  const conPeso = meds.filter((m) => m.peso !== null);
  if (conPeso.length >= 2) {
    const actual = conPeso[0].peso;
    const inicial = conPeso[conPeso.length - 1].peso;
    const cambio = Math.round((actual - inicial) * 10) / 10;
    lineas.push(`- Variación de peso desde la primera medición: ${cambio > 0 ? '+' : ''}${cambio} kg.`);
  }

  if (meds.length > 1) {
    const recientes = meds
      .slice(0, 3)
      .map((m) => `${m.fecha ? fechaCorta(m.fecha) : 'sin fecha'}: ${m.peso !== null ? `${m.peso} kg` : 'sin peso'}`)
      .join('; ');
    lineas.push(`- Últimas mediciones: ${recientes}.`);
  }

  return lineas;
};

const bloqueHistorial = ({ resumen = {}, sesiones = [] } = {}) => {
  const racha = numeroOpcional(resumen.racha) ?? 0;
  const mejor = numeroOpcional(resumen.mejorRacha) ?? 0;
  const semana = numeroOpcional(resumen.sesiones) ?? 0;
  const meta = numeroOpcional(resumen.meta) ?? 3;

  const lineas = [
    `- Racha actual: ${racha} día(s) consecutivos.`,
    `- Mejor racha registrada: ${mejor} día(s).`,
    `- Sesiones esta semana: ${semana} de una meta de ${meta}.`,
  ];

  const recientes = (Array.isArray(sesiones) ? sesiones : []).slice(0, 5);
  if (!recientes.length) {
    lineas.push('- Todavía no hay entrenamientos registrados.');
    return lineas;
  }

  lineas.push('- Últimos entrenamientos:');
  for (const s of recientes) {
    const fecha = fechaCorta(s && s.fecha) || 'sin fecha';
    const titulo = limpiarDato(s && s.titulo, 60, true) || 'Entrenamiento';
    const partes = [];

    const duracion = Math.round((numeroOpcional(s && s.duracion_segundos) ?? 0) / 60);
    if (duracion > 0) partes.push(`${duracion} min`);

    const completados = numeroOpcional(s && s.ejercicios_completados);
    const total = numeroOpcional(s && s.ejercicios_total);
    if (completados !== null || total !== null) {
      partes.push(total ? `${completados ?? 0}/${total} ejercicios` : `${completados ?? 0} ejercicios`);
    }

    const rpe = numeroOpcional(s && s.esfuerzo_percibido);
    if (rpe !== null) partes.push(`RPE ${rpe}`);

    lineas.push(`  - ${fecha}: ${titulo}${partes.length ? ` (${partes.join(' · ')})` : ''}`);
  }

  return lineas;
};

const bloqueRutina = ({ rutina } = {}) => {
  if (!rutina || typeof rutina !== 'object') {
    return ['- La rutina de hoy todavía no está generada. Se genera en /entrenamiento.'];
  }

  const calentamiento = listaTexto(rutina.calentamiento);
  const principal = listaTexto(rutina.principal ?? rutina.rutinaPrincipal);
  const estiramiento = listaTexto(rutina.estiramiento);
  const tiempo = numeroOpcional(rutina.tiempoTotalMin ?? rutina.tiempo);

  const lineas = [];
  if (tiempo !== null && tiempo > 0) lineas.push(`- Tiempo total estimado: ${tiempo} min.`);
  lineas.push(`- Calentamiento: ${calentamiento || 'sin ejercicios registrados'}.`);
  lineas.push(`- Rutina principal: ${principal || 'sin ejercicios registrados'}.`);
  lineas.push(`- Estiramiento: ${estiramiento || 'sin ejercicios registrados'}.`);

  return lineas;
};

const CONSTRUCTORES = {
  [FUENTES.PERFIL]: bloquePerfil,
  [FUENTES.LESIONES]: bloqueLesiones,
  [FUENTES.METRICAS]: bloqueMetricas,
  [FUENTES.HISTORIAL]: bloqueHistorial,
  [FUENTES.RUTINA]: bloqueRutina,
};

/**
 * Construye únicamente los bloques seleccionados por el router.
 * Devuelve un objeto `{ [fuente]: [lineas] }`, nunca una cadena global.
 */
const construirBloques = (contexto = {}, seleccion = []) => {
  const pedidas = new Set(Array.isArray(seleccion) ? seleccion : []);
  const bloques = {};

  for (const fuente of ORDEN_FUENTES) {
    if (!pedidas.has(fuente)) continue;
    const constructor = CONSTRUCTORES[fuente];
    if (!constructor) continue;

    const lineas = constructor(contexto || {});
    if (Array.isArray(lineas) && lineas.length) bloques[fuente] = lineas;
  }

  return bloques;
};

/** Serializa solo los bloques recibidos, cada uno con su etiqueta XML. */
const renderizarContexto = (bloques = {}) => {
  if (!bloques || typeof bloques !== 'object') return '';

  const partes = [];

  for (const fuente of ORDEN_FUENTES) {
    const lineas = bloques[fuente];
    if (!Array.isArray(lineas) || !lineas.length) continue;

    const etiqueta = ETIQUETAS[fuente];
    partes.push(`<${etiqueta}>\n${lineas.join('\n')}\n</${etiqueta}>`);
  }

  return partes.join('\n\n');
};

module.exports = {
  FUENTES,
  ETIQUETAS,
  ORDEN_FUENTES,
  construirBloques,
  renderizarContexto,
  limpiarTexto,
  limpiarDato,
  listaTexto,
  numeroSeguro,
  numeroOpcional,
  fechaCorta,
};
