/* ===========================================
   ENTRENAMIENTO ACTIVO - Reproductor
   Cuenta regresiva por serie, descansos, avance automático,
   pitidos con Web Audio y resumen final. Sin recargar la página.
   =========================================== */

(function () {
  'use strict';

  const datosEl = document.getElementById('ea-datos');
  if (!datosEl) return;

  let data;
  try {
    data = JSON.parse(datosEl.textContent);
  } catch (err) {
    return;
  }

  const pasos = Array.isArray(data.ejercicios) ? data.ejercicios : [];
  if (!pasos.length) return;

  const $ = (id) => document.getElementById(id);

  const el = {
    bloque: $('ea-bloque'),
    nombre: $('ea-nombre'),
    meta: $('ea-meta'),
    cronometro: $('ea-cronometro'),
    fase: $('ea-fase'),
    countdown: $('ea-countdown'),
    ring: $('ea-ring'),
    serie: $('ea-serie'),
    progress: $('ea-progress'),
    progressBar: $('ea-progress-bar'),
    toggle: $('ea-toggle'),
    skip: $('ea-skip'),
    prev: $('ea-prev'),
    sound: $('ea-sound'),
    descripcion: $('ea-descripcion'),
    nextNombre: $('ea-next-nombre'),
    nextMeta: $('ea-next-meta'),
    flash: $('ea-flash'),
    overlay: $('ea-overlay'),
    overlayKicker: $('ea-overlay-kicker'),
    overlayTitle: $('ea-overlay-title'),
    overlayText: $('ea-overlay-text'),
    overlayStats: $('ea-overlay-stats'),
    start: $('ea-start'),
    secondary: $('ea-overlay-secondary'),
    audioHint: $('ea-audio-hint'),
    audioTest: $('ea-audio-test'),
    audioStatus: $('ea-audio-status'),
  };

  const clamp = (valor, min, max) => Math.min(max, Math.max(min, valor));

  const state = {
    idx: clamp(Number(data.indiceInicial) || 0, 0, pasos.length - 1),
    set: 1,
    fase: 'work', // work | rest | done
    running: false,
    remainingMs: 0,
    endAt: 0,
    raf: 0,
    lastTick: null,
    timeoutId: 0,
    finTimer: 0,
    enTransicion: false,
    faseInicio: 0,
    acumuladoMs: 0,
    seriesCompletadas: 0,
    ejerciciosCompletados: 0,
    started: false,
    mudo: leerMudo(),
    wakeLock: null,
  };

  /* ---------- Utilidades ---------- */

  function leerMudo() {
    try {
      return localStorage.getItem('ea-mudo') === '1';
    } catch (err) {
      return false;
    }
  }

  function guardarMudo(valor) {
    try {
      localStorage.setItem('ea-mudo', valor ? '1' : '0');
    } catch (err) {
      /* sin localStorage: solo dura la sesión */
    }
  }

  const pad = (n) => String(n).padStart(2, '0');

  function formatearTiempo(ms) {
    const totalSeg = Math.max(0, Math.ceil(ms / 1000));
    const horas = Math.floor(totalSeg / 3600);
    const minutos = Math.floor((totalSeg % 3600) / 60);
    const segundos = totalSeg % 60;
    return horas > 0
      ? `${horas}:${pad(minutos)}:${pad(segundos)}`
      : `${pad(minutos)}:${pad(segundos)}`;
  }

  const pasoActual = () => pasos[state.idx];

  function duracionFaseMs() {
    const paso = pasoActual();
    if (!paso) return 0;
    return (state.fase === 'rest' ? paso.descansoSeg : paso.duracionSeg) * 1000;
  }

  function cancelarTimeout() {
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = 0;
    }
    state.enTransicion = false;
  }

  function programar(fn, ms) {
    cancelarTimeout();
    state.enTransicion = true;
    state.timeoutId = setTimeout(() => {
      state.timeoutId = 0;
      state.enTransicion = false;
      fn();
    }, ms);
  }

  /* ---------- Audio ---------- */

  /* Patrones de pitido. Cada tono indica frecuencia (f), duración (d),
     volumen (v) y retardo (at) dentro del patrón. */
  const PATRONES = {
    tick: [{ f: 784, d: 0.09, v: 0.32, at: 0 }],
    serie: [
      { f: 660, d: 0.16, v: 0.5, at: 0 },
      { f: 990, d: 0.34, v: 0.5, at: 0.18 },
    ],
    descanso: [
      { f: 784, d: 0.12, v: 0.46, at: 0 },
      { f: 1046, d: 0.12, v: 0.46, at: 0.15 },
      { f: 1318, d: 0.32, v: 0.52, at: 0.3 },
    ],
    fin: [
      { f: 523, d: 0.18, v: 0.5, at: 0 },
      { f: 659, d: 0.18, v: 0.5, at: 0.2 },
      { f: 784, d: 0.18, v: 0.5, at: 0.4 },
      { f: 1046, d: 0.55, v: 0.56, at: 0.6 },
    ],
  };

  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  const audio = {
    ctx: null,
    master: null,
    buffers: new Map(),
    wavs: new Map(),
    elementos: new Map(),
    desbloqueado: false,
    respaldoListo: false,
    intentado: false,
    bloqueado: false,
  };

  function crearContexto() {
    if (audio.ctx) return audio.ctx;
    if (!AudioCtx) return null;

    try {
      audio.ctx = new AudioCtx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 1;
      audio.master.connect(audio.ctx.destination);
      audio.ctx.addEventListener('statechange', () => {
        if (audio.ctx.state === 'running') marcarAudioOk();
      });
    } catch (err) {
      audio.ctx = null;
      audio.master = null;
    }

    return audio.ctx;
  }

  /** Desbloquea el audio dentro de un gesto real del usuario. */
  async function desbloquearAudio() {
    const ctx = crearContexto();

    if (ctx) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (err) {
          /* el navegador seguirá bloqueándolo */
        }
      }

      if (ctx.state === 'running') {
        if (!audio.desbloqueado) {
          try {
            const silencio = ctx.createBuffer(1, 1, ctx.sampleRate);
            const fuente = ctx.createBufferSource();
            fuente.buffer = silencio;
            fuente.connect(audio.master);
            fuente.start(0);
          } catch (err) {
            /* sin buffer de calentamiento */
          }
        }
        audio.desbloqueado = true;
        marcarAudioOk();
      }
    }

    // Respaldo HTMLAudio: se prepara con un volumen casi nulo dentro del gesto.
    if (!audio.respaldoListo) {
      const elemento = obtenerElementoAudio('tick');
      if (elemento) {
        try {
          elemento.volume = 0.0001;
          elemento.currentTime = 0;
          const intento = elemento.play();
          if (intento && intento.then) {
            intento
              .then(() => {
                audio.respaldoListo = true;
              })
              .catch(() => {
                /* se reintenta en el próximo gesto */
              });
          } else {
            audio.respaldoListo = true;
          }
          setTimeout(() => {
            elemento.volume = 1;
          }, 250);
        } catch (err) {
          /* queda pendiente para el próximo gesto */
        }
      }
    }

    actualizarBotonSonido();
    return Boolean((ctx && ctx.state === 'running') || audio.respaldoListo);
  }

  function bufferTono(ctx, tono) {
    const clave = `${tono.f}|${tono.d}|${tono.v}`;
    if (audio.buffers.has(clave)) return audio.buffers.get(clave);

    const muestras = Math.max(1, Math.floor(ctx.sampleRate * tono.d));
    const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    const ataque = Math.min(0.012, tono.d * 0.25);
    const salida = Math.min(0.09, tono.d * 0.5);

    for (let i = 0; i < muestras; i += 1) {
      const t = i / ctx.sampleRate;
      const restante = tono.d - t;
      const envAtaque = ataque > 0 ? Math.min(1, t / ataque) : 1;
      const envSalida = salida > 0 ? Math.min(1, Math.max(0, restante) / salida) : 1;
      const env = Math.max(0, Math.min(envAtaque, envSalida));
      const onda = Math.sin(2 * Math.PI * tono.f * t) + 0.18 * Math.sin(4 * Math.PI * tono.f * t);
      datos[i] = onda * tono.v * env;
    }

    audio.buffers.set(clave, buffer);
    return buffer;
  }

  function reproducirWebAudio(ctx, patron) {
    const inicio = ctx.currentTime + 0.02;

    patron.forEach((tono) => {
      try {
        const fuente = ctx.createBufferSource();
        fuente.buffer = bufferTono(ctx, tono);
        fuente.connect(audio.master);
        fuente.start(inicio + tono.at);
      } catch (err) {
        /* un tono fallido no corta el resto */
      }
    });
  }

  /** WAV de respaldo para cuando Web Audio está bloqueado. */
  function urlWav(patron) {
    const sr = 22050;
    const duracion = Math.max(...patron.map((tono) => tono.at + tono.d)) + 0.05;
    const muestras = Math.ceil(sr * duracion);
    const datos = new Float32Array(muestras);

    patron.forEach((tono) => {
      const desde = Math.floor(tono.at * sr);
      const hasta = Math.min(muestras, Math.floor((tono.at + tono.d) * sr));
      const largo = hasta - desde;

      for (let i = 0; i < largo; i += 1) {
        const t = i / sr;
        const restante = tono.d - t;
        const env = Math.max(0, Math.min(1, t / 0.012, restante / Math.min(0.09, tono.d * 0.5)));
        datos[desde + i] += Math.sin(2 * Math.PI * tono.f * t) * tono.v * env;
      }
    });

    const bytes = 44 + muestras * 2;
    const buffer = new ArrayBuffer(bytes);
    const vista = new DataView(buffer);
    const texto = (offset, valor) => {
      for (let i = 0; i < valor.length; i += 1) vista.setUint8(offset + i, valor.charCodeAt(i));
    };

    texto(0, 'RIFF');
    vista.setUint32(4, bytes - 8, true);
    texto(8, 'WAVE');
    texto(12, 'fmt ');
    vista.setUint32(16, 16, true);
    vista.setUint16(20, 1, true);
    vista.setUint16(22, 1, true);
    vista.setUint32(24, sr, true);
    vista.setUint32(28, sr * 2, true);
    vista.setUint16(32, 2, true);
    vista.setUint16(34, 16, true);
    texto(36, 'data');
    vista.setUint32(40, muestras * 2, true);

    for (let i = 0; i < muestras; i += 1) {
      const muestra = Math.max(-1, Math.min(1, datos[i]));
      vista.setInt16(44 + i * 2, muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff, true);
    }

    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function obtenerElementoAudio(nombre) {
    if (audio.elementos.has(nombre)) return audio.elementos.get(nombre);

    let elemento = null;
    try {
      const patron = PATRONES[nombre] || PATRONES.serie;
      if (!audio.wavs.has(nombre)) audio.wavs.set(nombre, urlWav(patron));
      elemento = new Audio(audio.wavs.get(nombre));
      elemento.preload = 'auto';
      elemento.volume = 1;
      audio.elementos.set(nombre, elemento);
    } catch (err) {
      elemento = null;
    }

    return elemento;
  }

  function reproducirRespaldo(nombre) {
    const elemento = obtenerElementoAudio(nombre);
    if (!elemento) {
      marcarAudioBloqueado();
      return;
    }

    try {
      elemento.currentTime = 0;
      const intento = elemento.play();
      if (intento && intento.catch) {
        intento.catch(() => marcarAudioBloqueado());
      }
    } catch (err) {
      marcarAudioBloqueado();
    }
  }

  function reproducir(nombre) {
    if (state.mudo) return;

    audio.intentado = true;
    const patron = PATRONES[nombre] || PATRONES.serie;
    const ctx = crearContexto();

    if (ctx && ctx.state === 'running') {
      reproducirWebAudio(ctx, patron);
      marcarAudioOk();
      return;
    }

    if (ctx) {
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            reproducirWebAudio(ctx, patron);
            marcarAudioOk();
          } else {
            reproducirRespaldo(nombre);
          }
        })
        .catch(() => reproducirRespaldo(nombre));
      return;
    }

    reproducirRespaldo(nombre);
  }

  function marcarAudioOk() {
    audio.bloqueado = false;

    if (audio.ctx && audio.ctx.state === 'running') audio.desbloqueado = true;

    if (el.audioHint) el.audioHint.hidden = true;
  }

  function marcarAudioBloqueado() {
    if (state.mudo) return;
    audio.bloqueado = true;
    if (el.audioHint) el.audioHint.hidden = false;
    if (el.audioStatus) el.audioStatus.textContent = 'El navegador bloqueó el audio.';
  }

  function sonidoFin(esUltimo) {
    if (state.fase === 'rest') reproducir('descanso');
    else reproducir(esUltimo ? 'fin' : 'serie');
  }

  async function probarSonido() {
    if (state.mudo) {
      state.mudo = false;
      guardarMudo(false);
      actualizarBotonSonido();
    }

    const listo = await desbloquearAudio();
    reproducir('serie');

    if (el.audioStatus) {
      el.audioStatus.textContent = listo
        ? 'Sonido activado. Si no lo escuchas, revisa el volumen o el modo silencio del dispositivo.'
        : 'No pudimos reproducir audio. Revisa el volumen y el modo silencio del dispositivo.';
    }
  }

  function vibrar() {
    if (state.mudo || !navigator.vibrate) return;
    try {
      navigator.vibrate([140, 60, 180]);
    } catch (err) {
      /* sin vibración */
    }
  }

  function actualizarBotonSonido() {
    el.sound.textContent = state.mudo ? 'Silencio' : 'Sonido';
    el.sound.setAttribute('aria-pressed', String(!state.mudo));
    el.sound.classList.toggle('is-off', state.mudo);

    if (el.audioHint) el.audioHint.hidden = state.mudo || !audio.bloqueado;

    if (el.audioTest) {
      el.audioTest.textContent = state.mudo ? 'Activar sonido y probar' : 'Probar sonido';
    }

    if (el.audioStatus) {
      if (state.mudo) {
        el.audioStatus.textContent = 'El sonido está desactivado.';
      } else if (audio.bloqueado) {
        el.audioStatus.textContent = 'El navegador bloqueó el audio.';
      } else if (!audio.intentado) {
        el.audioStatus.textContent = 'Comprueba el audio antes de empezar.';
      } else {
        el.audioStatus.textContent = '';
      }
    }
  }

  /* ---------- Render ---------- */

  function renderPaso() {
    const paso = pasoActual();
    if (!paso) return;

    el.bloque.textContent = paso.bloque;
    el.nombre.textContent = paso.nombre;
    el.descripcion.textContent =
      paso.descripcion || 'Sigue las indicaciones y mantén un ritmo cómodo.';

    el.meta.textContent = '';
    const chips = paso.esPrincipal
      ? [
          `${paso.series} ${paso.series === 1 ? 'serie' : 'series'}`,
          paso.repeticiones ? `${paso.repeticiones} reps` : `${paso.duracionSeg} s`,
          `≈ ${paso.duracionSeg} s por serie`,
          paso.descansoSeg ? `${paso.descansoSeg} s descanso` : null,
        ]
      : [`${Math.round(paso.duracionSeg / 60)} min`];

    chips.filter(Boolean).forEach((texto) => {
      const chip = document.createElement('span');
      chip.textContent = texto;
      el.meta.appendChild(chip);
    });

    const siguiente = pasos[state.idx + 1];
    el.nextNombre.textContent = siguiente ? siguiente.nombre : 'Fin de la rutina';
    el.nextMeta.textContent = siguiente
      ? siguiente.esPrincipal
        ? `${siguiente.series} × ${siguiente.repeticiones}`
        : `${Math.round(siguiente.duracionSeg / 60)} min`
      : 'Último bloque';
  }

  function pintarTiempo(ms) {
    const total = duracionFaseMs() || 1;
    const progreso = clamp(1 - ms / total, 0, 1);
    const porcentaje = Math.round(progreso * 100);

    el.countdown.textContent = formatearTiempo(ms);
    el.ring.style.setProperty('--p', (progreso * 100).toFixed(2));
    el.progressBar.style.width = `${porcentaje}%`;
    el.progress.setAttribute('aria-valuenow', String(porcentaje));
  }

  function actualizarUI() {
    const paso = pasoActual();
    if (!paso) return;

    const enDescanso = state.fase === 'rest';
    const terminado = state.fase === 'done';

    el.cronometro.classList.toggle('is-rest', enDescanso);
    el.cronometro.classList.toggle('is-done', terminado);
    el.cronometro.classList.toggle('is-running', state.running);

    el.fase.textContent = terminado
      ? 'Entrenamiento completado'
      : enDescanso
        ? 'Descanso'
        : state.enTransicion
          ? 'Siguiente…'
          : state.running
            ? 'En curso'
            : 'Listo';

    if (enDescanso) {
      el.serie.textContent = `Descanso · después de la serie ${state.set}`;
    } else if (paso.esPrincipal) {
      el.serie.textContent = `Serie ${state.set} de ${paso.series} · Ejercicio ${state.idx + 1} de ${pasos.length}`;
    } else {
      el.serie.textContent = `Ejercicio ${state.idx + 1} de ${pasos.length}`;
    }

    const duracion = duracionFaseMs();
    el.toggle.textContent = terminado
      ? 'Finalizado'
      : state.running
        ? 'Pausar'
        : state.remainingMs >= duracion
          ? 'Iniciar'
          : 'Continuar';
    el.skip.textContent = enDescanso ? 'Saltar descanso' : 'Saltar';
    el.toggle.disabled = terminado || state.enTransicion;
    el.prev.disabled = terminado || state.enTransicion || state.idx === 0;
    el.skip.disabled = terminado || state.enTransicion;

    pintarTiempo(state.remainingMs);
  }

  /* ---------- Flujo del entrenamiento ---------- */

  function entrarFase(fase, autoStart) {
    cancelarTimeout();
    cancelAnimationFrame(state.raf);
    cancelarFin();

    state.fase = fase;
    state.running = false;
    state.remainingMs = duracionFaseMs();
    state.lastTick = null;
    state.faseInicio = 0;

    actualizarUI();

    if (autoStart) iniciar();
  }

  function iniciar() {
    if (state.fase === 'done' || state.enTransicion || state.running) return;

    desbloquearAudio();
    pedirWakeLock();

    if (state.remainingMs <= 0) state.remainingMs = duracionFaseMs();

    state.started = true;
    state.running = true;
    state.endAt = performance.now() + state.remainingMs;
    state.faseInicio = performance.now();

    actualizarUI();
    state.raf = requestAnimationFrame(loop);
    programarFin(state.remainingMs);
  }

  /** Respaldo del temporizador: asegura el pitido final aunque rAF se pause. */
  function programarFin(ms) {
    cancelarFin();
    state.finTimer = setTimeout(() => {
      state.finTimer = 0;
      if (!state.running) return;
      state.remainingMs = 0;
      pintarTiempo(0);
      finalizarFase();
    }, Math.max(0, ms) + 40);
  }

  function cancelarFin() {
    if (state.finTimer) {
      clearTimeout(state.finTimer);
      state.finTimer = 0;
    }
  }

  function pausar() {
    if (!state.running || state.enTransicion) return;

    state.remainingMs = Math.max(0, state.endAt - performance.now());
    acumularTiempo();
    cancelarFin();

    state.running = false;
    cancelAnimationFrame(state.raf);

    actualizarUI();
  }

  function acumularTiempo() {
    if (!state.faseInicio) return;
    state.acumuladoMs += Math.max(0, performance.now() - state.faseInicio);
    state.faseInicio = 0;
  }

  function loop() {
    if (!state.running) return;

    const restante = state.endAt - performance.now();

    if (restante <= 0) {
      state.remainingMs = 0;
      pintarTiempo(0);
      finalizarFase();
      return;
    }

    state.remainingMs = restante;
    pintarTiempo(restante);

    const segundo = Math.ceil(restante / 1000);
    if (segundo !== state.lastTick && segundo >= 1 && segundo <= 3) {
      state.lastTick = segundo;
      reproducir('tick');
    }

    state.raf = requestAnimationFrame(loop);
  }

  function finalizarFase() {
    if (!state.running) return;

    state.running = false;
    cancelAnimationFrame(state.raf);
    cancelarFin();
    acumularTiempo();
    state.remainingMs = 0;

    const paso = pasoActual();
    const esUltimaSerie = !paso.esPrincipal || state.set >= paso.series;
    const esUltimoEjercicio = state.idx + 1 >= pasos.length;

    sonidoFin(esUltimaSerie && esUltimoEjercicio);
    vibrar();

    if (state.fase === 'work') {
      if (paso.esPrincipal) state.seriesCompletadas += 1;

      const quedanSeries = paso.esPrincipal && state.set < paso.series;
      flash(quedanSeries ? '¡Serie completada!' : '¡Ejercicio completado!');

      if (quedanSeries) {
        programar(() => {
          if (paso.descansoSeg > 0) {
            entrarFase('rest', true);
          } else {
            state.set += 1;
            entrarFase('work', true);
          }
        }, 1000);
      } else {
        state.ejerciciosCompletados += 1;
        programar(() => siguienteEjercicio(true), 1100);
      }
    } else if (state.fase === 'rest') {
      flash('¡Descanso terminado!');
      programar(() => {
        state.set += 1;
        entrarFase('work', true);
      }, 700);
    }

    actualizarUI();
  }

  function siguienteEjercicio(autoStart) {
    cancelarTimeout();

    if (state.idx + 1 >= pasos.length) {
      finalizarEntrenamiento();
      return;
    }

    state.idx += 1;
    state.set = 1;
    renderPaso();
    entrarFase('work', autoStart);
    actualizarUrl();
  }

  function irAnterior() {
    if (state.idx <= 0) return;

    cancelarTimeout();
    cancelarFin();
    if (state.running) {
      acumularTiempo();
      state.running = false;
      cancelAnimationFrame(state.raf);
    }

    state.idx -= 1;
    state.set = 1;
    state.fase = 'work';
    renderPaso();
    entrarFase('work', false);
    actualizarUrl();
  }

  function saltar() {
    if (state.fase === 'done') return;

    if (state.running) {
      acumularTiempo();
      state.running = false;
      cancelAnimationFrame(state.raf);
    }

    cancelarTimeout();
    cancelarFin();

    const paso = pasoActual();

    if (state.fase === 'rest') {
      state.set += 1;
      entrarFase('work', true);
      return;
    }

    const quedanSeries = paso.esPrincipal && state.set < paso.series;

    if (quedanSeries) {
      if (paso.descansoSeg > 0) {
        entrarFase('rest', true);
      } else {
        state.set += 1;
        entrarFase('work', true);
      }
      return;
    }

    siguienteEjercicio(true);
  }

  function finalizarEntrenamiento() {
    cancelarTimeout();
    cancelarFin();
    cancelAnimationFrame(state.raf);

    if (state.running) {
      acumularTiempo();
      state.running = false;
    }

    state.fase = 'done';
    state.remainingMs = 0;
    pintarTiempo(0);
    actualizarUI();
    liberarWakeLock();
    mostrarResumen();
  }

  function repetir() {
    cancelarTimeout();
    cancelarFin();
    cancelAnimationFrame(state.raf);

    state.idx = 0;
    state.set = 1;
    state.fase = 'work';
    state.running = false;
    state.acumuladoMs = 0;
    state.seriesCompletadas = 0;
    state.ejerciciosCompletados = 0;
    state.remainingMs = 0;
    state.faseInicio = 0;
    state.lastTick = null;

    renderPaso();
    entrarFase('work', false);
    ocultarOverlay();
    actualizarUrl();
    iniciar();
  }

  /* ---------- Overlay ---------- */

  function crearStats(items) {
    el.overlayStats.textContent = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      const valor = document.createElement('strong');
      const texto = document.createElement('span');
      valor.textContent = item.valor;
      texto.textContent = item.texto;
      li.appendChild(valor);
      li.appendChild(texto);
      el.overlayStats.appendChild(li);
    });
  }

  function mostrarInicio() {
    const totalSeg =
      Number(data.duracionTotalSeg) || pasos.reduce((total, paso) => total + paso.totalSeg, 0);
    const minutos = Math.max(1, Math.round(totalSeg / 60));
    const bloques = new Set(pasos.map((paso) => paso.bloque)).size;

    el.overlayKicker.textContent = 'Rutina de hoy';
    el.overlayTitle.textContent = '¿Comenzamos?';
    el.overlayText.textContent =
      'Vas a completar tu rutina guiada. En los ejercicios por repeticiones, cada serie usa un ritmo estimado de 3 s por repetición. La app te avisa con un pitido al terminar y pasa sola al siguiente ejercicio.';
    crearStats([
      { valor: String(pasos.length), texto: 'ejercicios' },
      { valor: String(minutos), texto: minutos === 1 ? 'minuto aprox.' : 'minutos aprox.' },
      { valor: String(bloques), texto: bloques === 1 ? 'bloque' : 'bloques' },
    ]);
    el.start.textContent = 'Comenzar entrenamiento';
    el.secondary.hidden = true;
    el.overlay.hidden = false;
    actualizarBotonSonido();
    el.start.focus();
  }

  function mostrarResumen() {
    el.overlayKicker.textContent = 'Sesión completada';
    el.overlayTitle.textContent = '¡Entrenamiento completado!';
    el.overlayText.textContent =
      'Completaste todos los ejercicios de tu rutina. Puedes repetir la sesión o volver a tu plan de entrenamiento.';
    crearStats([
      { valor: `${state.ejerciciosCompletados} / ${pasos.length}`, texto: 'ejercicios' },
      { valor: String(state.seriesCompletadas), texto: 'series completadas' },
      { valor: formatearTiempo(state.acumuladoMs), texto: 'tiempo total' },
    ]);
    el.start.textContent = 'Repetir entrenamiento';
    el.secondary.hidden = false;
    el.overlay.hidden = false;
    el.start.focus();
  }

  function ocultarOverlay() {
    el.overlay.hidden = true;
    el.start.blur();
  }

  /* ---------- Flash ---------- */

  let flashTimer = 0;

  function flash(texto) {
    el.flash.textContent = texto;
    el.flash.classList.remove('is-visible');
    void el.flash.offsetWidth;
    el.flash.classList.add('is-visible');

    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.flash.classList.remove('is-visible');
    }, 1200);
  }

  /* ---------- URL y pantalla ---------- */

  function actualizarUrl() {
    try {
      history.replaceState(null, '', `/entrenamiento/activo?i=${state.idx}`);
    } catch (err) {
      /* sin History API */
    }
  }

  async function pedirWakeLock() {
    if (state.wakeLock || !navigator.wakeLock) return;
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      state.wakeLock = null;
    }
  }

  function liberarWakeLock() {
    if (!state.wakeLock) return;
    try {
      state.wakeLock.release();
    } catch (err) {
      /* ya liberado */
    }
    state.wakeLock = null;
  }

  /* ---------- Eventos ---------- */

  el.toggle.addEventListener('click', () => {
    desbloquearAudio();
    if (state.running) pausar();
    else iniciar();
  });

  el.skip.addEventListener('click', saltar);
  el.prev.addEventListener('click', irAnterior);

  el.sound.addEventListener('click', () => {
    state.mudo = !state.mudo;
    guardarMudo(state.mudo);
    actualizarBotonSonido();
    if (!state.mudo) {
      desbloquearAudio();
      reproducir('serie');
    }
  });

  if (el.audioTest) {
    el.audioTest.addEventListener('click', probarSonido);
  }

  /* Cualquier gesto sirve para desbloquear el audio, no solo los botones. */
  ['pointerdown', 'touchstart', 'keydown'].forEach((tipo) => {
    document.addEventListener(tipo, () => desbloquearAudio(), {
      capture: true,
      passive: true,
    });
  });

  el.start.addEventListener('click', () => {
    desbloquearAudio();

    if (state.fase === 'done') {
      repetir();
      return;
    }

    ocultarOverlay();
    iniciar();
  });

  document.addEventListener('keydown', (ev) => {
    const objetivo = ev.target;
    if (objetivo && /input|textarea|select/i.test(objetivo.tagName)) return;

    const overlayVisible = !el.overlay.hidden;

    if (ev.code === 'Space') {
      ev.preventDefault();
      if (overlayVisible) el.start.click();
      else el.toggle.click();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (!overlayVisible) saltar();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (!overlayVisible) irAnterior();
    } else if (ev.key.toLowerCase() === 'm') {
      el.sound.click();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    desbloquearAudio();

    if (state.running) {
      state.remainingMs = Math.max(0, state.endAt - performance.now());
      pedirWakeLock();
      if (!state.raf) state.raf = requestAnimationFrame(loop);
    }
  });

  /* ---------- Arranque ---------- */

  renderPaso();
  entrarFase('work', false);
  actualizarBotonSonido();
  mostrarInicio();
})();
