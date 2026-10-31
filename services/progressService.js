/* ===========================================
   SERVICIO DE PROGRESO
   Funciones puras: no tocan la base de datos.
   Construyen métricas, series y estados vacíos a
   partir de las sesiones y mediciones del cliente.
   =========================================== */

const parseFecha = (valor) => {
  if (valor instanceof Date) return valor;
  if (typeof valor === 'string') {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const aFechaISO = (valor) => {
  const d = parseFecha(valor);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

const formatearFechaCorta = (valor) => {
  const d = parseFecha(valor);
  try {
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  } catch (e) {
    return aFechaISO(d);
  }
};

const formatearFechaLarga = (valor) => {
  const d = parseFecha(valor);
  try {
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) {
    return aFechaISO(d);
  }
};

const inicioDeSemana = (fecha) => {
  const d = parseFecha(fecha);
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
  return inicio;
};

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

const normalizarSesion = (s) => {
  const fecha = aFechaISO(s.fecha);
  const duracion = Number(s.duracion_segundos) || 0;
  return {
    id: s.id_sesion,
    fecha,
    fechaDate: parseFecha(s.fecha),
    titulo: s.titulo || 'Entrenamiento completado',
    duracionSegundos: duracion,
    duracionMin: Math.round(duracion / 60),
    ejerciciosCompletados: Number(s.ejercicios_completados) || 0,
    ejerciciosTotal: Number(s.ejercicios_total) || 0,
    creadoEn: s.creado_en ? aFechaISO(s.creado_en) : null,
  };
};

const calcularRacha = (fechasUnicasOrdenadas, ahora = new Date()) => {
  const set = new Set(fechasUnicasOrdenadas);
  const base = ahora.getTime();
  const hoy = aFechaISO(ahora);
  const ayer = aFechaISO(new Date(base - 86400000));

  let actual = 0;
  if (set.has(hoy)) {
    actual = 1;
    for (let i = 1; i < 366; i++) {
      const dia = aFechaISO(new Date(base - i * 86400000));
      if (!set.has(dia)) break;
      actual++;
    }
  } else if (set.has(ayer)) {
    actual = 1;
    for (let i = 2; i < 366; i++) {
      const dia = aFechaISO(new Date(base - i * 86400000));
      if (!set.has(dia)) break;
      actual++;
    }
  }

  const ordenadas = [...set].sort();
  let mejor = 0;
  let racha = 0;
  let previa = null;
  for (const dia of ordenadas) {
    const d = parseFecha(dia);
    racha = previa && (d - previa) === 86400000 ? racha + 1 : 1;
    if (racha > mejor) mejor = racha;
    previa = d;
  }
  return { actual, mejor };
};

const calcularProgreso = ({ sesiones = [], mediciones = [], perfil = null, semanas = 8, ahora = new Date() } = {}) => {
  const sesionesNorm = (Array.isArray(sesiones) ? sesiones : []).map(normalizarSesion);
  const fechasUnicas = [...new Set(sesionesNorm.map((s) => s.fecha))].sort();

  const rachas = calcularRacha(fechasUnicas, ahora);

  const totalSesiones = sesionesNorm.length;
  const totalSegundos = sesionesNorm.reduce((acc, s) => acc + s.duracionSegundos, 0);
  const totalMinutos = Math.round(totalSegundos / 60);
  const totalEjercicios = sesionesNorm.reduce((acc, s) => acc + s.ejerciciosCompletados, 0);
  const promedioMinutos = totalSesiones ? Math.round(totalMinutos / totalSesiones) : 0;
  const promedioEjercicios = totalSesiones ? Math.round(totalEjercicios / totalSesiones) : 0;

  const primeraFecha = fechasUnicas.length ? fechasUnicas[0] : null;
  const ultimaFecha = fechasUnicas.length ? fechasUnicas[fechasUnicas.length - 1] : null;

  const diasElegidos = Array.isArray(perfil && perfil.dias) ? perfil.dias : [];
  const metaSemanal = limitar(
    Number((diasElegidos.length || (perfil && perfil.diasSemana) || 3)),
    1,
    7
  );

  const lunesActual = inicioDeSemana(ahora);
  const finSemana = new Date(lunesActual);
  finSemana.setDate(finSemana.getDate() + 7);
  const sesionesEstaSemana = sesionesNorm.filter((s) => {
    return s.fechaDate >= lunesActual && s.fechaDate < finSemana;
  }).length;
  const adherenciaPct = metaSemanal
    ? limitar(Math.round((sesionesEstaSemana / metaSemanal) * 100), 0, 100)
    : 0;

  // Serie de semanas (últimas N)
  const nSemanas = limitar(Number(semanas) || 8, 4, 26);
  const serieSemanas = [];
  for (let i = nSemanas - 1; i >= 0; i--) {
    const lunes = new Date(lunesActual);
    lunes.setDate(lunes.getDate() - i * 7);
    serieSemanas.push({
      inicio: aFechaISO(lunes),
      etiqueta: formatearFechaCorta(lunes),
      sesiones: 0,
      minutos: 0,
    });
  }
  const porSemana = new Map(serieSemanas.map((s) => [s.inicio, s]));
  for (const s of sesionesNorm) {
    const lunes = aFechaISO(inicioDeSemana(s.fechaDate));
    const bucket = porSemana.get(lunes);
    if (bucket) {
      bucket.sesiones += 1;
      bucket.minutos += s.duracionMin;
    }
  }
  const maxSesionesSemana = serieSemanas.reduce((m, s) => Math.max(m, s.sesiones), 0);

  // Mejor semana del historial (todas)
  const porSemanaHistorial = new Map();
  for (const s of sesionesNorm) {
    const lunes = aFechaISO(inicioDeSemana(s.fechaDate));
    const cur = porSemanaHistorial.get(lunes) || 0;
    porSemanaHistorial.set(lunes, cur + 1);
  }
  let mejorSemana = { inicio: null, sesiones: 0 };
  for (const [inicio, n] of porSemanaHistorial.entries()) {
    if (n > mejorSemana.sesiones) mejorSemana = { inicio, sesiones: n };
  }

  const sesionMasLarga = sesionesNorm.reduce(
    (max, s) => (s.duracionSegundos > (max ? max.duracionSegundos : 0) ? s : max),
    null
  );
  const sesionMasEjercicios = sesionesNorm.reduce(
    (max, s) => (s.ejerciciosCompletados > (max ? max.ejerciciosCompletados : 0) ? s : max),
    null
  );

  // Mediciones (peso)
  const meds = (Array.isArray(mediciones) ? mediciones : [])
    .map((m) => ({
      id: m.id_medicion,
      fecha: aFechaISO(m.fecha_medicion),
      fechaDate: parseFecha(m.fecha_medicion),
      nivel: m.nivel_fisico || null,
      altura: m.altura_cm === null || m.altura_cm === undefined ? null : Number(m.altura_cm),
      peso: m.peso_kg === null || m.peso_kg === undefined ? null : Number(m.peso_kg),
    }))
    .sort((a, b) => a.fechaDate - b.fechaDate);

  const pesoSeries = meds.map((m) => ({
    fecha: m.fecha,
    fechaCorta: formatearFechaCorta(m.fechaDate),
    peso: m.peso,
    altura: m.altura,
    nivel: m.nivel,
    imc:
      m.peso && m.altura
        ? Math.round((m.peso / Math.pow(m.altura / 100, 2)) * 10) / 10
        : null,
  }));

  const pesoInicial = pesoSeries.length ? pesoSeries[0].peso : null;
  const pesoActual = pesoSeries.length ? pesoSeries[pesoSeries.length - 1].peso : null;
  const cambioPeso =
    pesoInicial !== null && pesoActual !== null ? Math.round((pesoActual - pesoInicial) * 10) / 10 : null;
  const cambioPesoPct =
    pesoInicial && pesoActual !== null
      ? Math.round(((pesoActual - pesoInicial) / pesoInicial) * 1000) / 10
      : null;

  const alturaActual = pesoSeries.length ? pesoSeries[pesoSeries.length - 1].altura : null;
  const nivelActual = pesoSeries.length ? pesoSeries[pesoSeries.length - 1].nivel : null;
  const imcActual =
    pesoActual && alturaActual
      ? Math.round((pesoActual / Math.pow(alturaActual / 100, 2)) * 10) / 10
      : null;

  const recientes = sesionesNorm.slice(0, 10).map((s) => ({
    fecha: s.fecha,
    fechaCorta: formatearFechaCorta(s.fechaDate),
    fechaLarga: formatearFechaLarga(s.fechaDate),
    titulo: s.titulo,
    duracionMin: s.duracionMin,
    ejerciciosCompletados: s.ejerciciosCompletados,
    ejerciciosTotal: s.ejerciciosTotal,
  }));

  return {
    racha: rachas.actual,
    mejorRacha: rachas.mejor,
    totalSesiones,
    totalMinutos,
    totalEjercicios,
    promedioMinutos,
    promedioEjercicios,
    diasActivos: fechasUnicas.length,
    primeraFecha,
    ultimaFecha,
    primeraFechaLarga: primeraFecha ? formatearFechaLarga(parseFecha(primeraFecha)) : null,
    ultimaFechaLarga: ultimaFecha ? formatearFechaLarga(parseFecha(ultimaFecha)) : null,
    metaSemanal,
    sesionesEstaSemana,
    adherenciaPct,
    serieSemanas,
    maxSesionesSemana,
    mejorSemana: {
      inicio: mejorSemana.inicio,
      inicioCorto: mejorSemana.inicio ? formatearFechaCorta(parseFecha(mejorSemana.inicio)) : null,
      sesiones: mejorSemana.sesiones,
    },
    sesionMasLarga: sesionMasLarga
      ? { titulo: sesionMasLarga.titulo, minutos: sesionMasLarga.duracionMin, fecha: sesionMasLarga.fecha }
      : null,
    sesionMasEjercicios: sesionMasEjercicios
      ? { titulo: sesionMasEjercicios.titulo, cantidad: sesionMasEjercicios.ejerciciosCompletados, fecha: sesionMasEjercicios.fecha }
      : null,
    pesoSeries,
    pesoActual,
    pesoInicial,
    cambioPeso,
    cambioPesoPct,
    alturaActual,
    nivelActual,
    imcActual,
    recientes,
    vacioSesiones: totalSesiones === 0,
    vacioPeso: pesoSeries.length < 2,
    semanas: nSemanas,
  };
};

module.exports = {
  parseFecha,
  aFechaISO,
  formatearFechaCorta,
  formatearFechaLarga,
  inicioDeSemana,
  calcularProgreso,
};
