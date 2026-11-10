/* ===========================================
   CUESTIONARIO DE RETROALIMENTACIÓN POST-ENTRENAMIENTO
   Se engancha al partial retro_cuestionario.ejs por data-atributos,
   así lo usan el overlay del reproductor y la página /entrenamiento/retroalimentacion.

   Uso:  GekoRetro.init(raiz, {
           onGuardado: fn,   // al registrar respuestas (opcional)
           onOmitido: fn     // al omitir (opcional)
         });
   Envía a POST /entrenamiento/retroalimentacion { fecha, esfuerzo,
   satisfaccion, molestias, comentario } y muestra la confirmación con
   la recomendación generada.
   =========================================== */

(function () {
  'use strict';

  const ENDPOINT = '/entrenamiento/retroalimentacion';
  const ENDPOINT_OMITIR = '/entrenamiento/retroalimentacion/omitir';

  function init(raiz, opciones) {
    const cont = raiz.querySelector('[data-retro-form]');
    if (!cont || cont.dataset.retroInit === '1') return null;
    cont.dataset.retroInit = '1';

    const conf = opciones || {};

    const grupos = {};
    cont.querySelectorAll('[data-retro-grupo]').forEach((grupo) => {
      grupos[grupo.dataset.retroGrupo] = grupo;
    });

    const el = {
      comentario: cont.querySelector('[data-retro-input="comentario"]'),
      enviar: cont.querySelector('[data-retro-enviar]'),
      omitir: cont.querySelector('[data-retro-omitir]'),
      status: cont.querySelector('[data-retro-status]'),
      resultado: cont.querySelector('[data-retro-resultado]'),
      recomendacion: cont.querySelector('[data-retro-recomendacion]'),
      later: cont.querySelector('[data-retro-later]'),
    };

    const estado = {
      esfuerzo: null,          // 1..4
      satisfaccion: null,      // 1..5
      molestias: new Set(),    // claves de zona; vacío = sin responder
      molestiasRespondidas: false,
      ocupado: false,
      terminado: false,
    };

    const grupo = (nombre) => grupos[nombre];

    function marcar(boton, activo) {
      boton.classList.toggle('is-selected', activo);
      boton.setAttribute('aria-pressed', String(activo));
    }

    function actualizarEnviar() {
      if (el.enviar) {
        el.enviar.disabled =
          estado.ocupado ||
          estado.terminado ||
          estado.esfuerzo === null ||
          estado.satisfaccion === null ||
          !estado.molestiasRespondidas;
      }
    }

    /* ---------- Selección de opciones ---------- */

    function prepararUnica(nombre, clave) {
      const g = grupo(nombre);
      if (!g) return;

      g.addEventListener('click', (ev) => {
        const boton = ev.target.closest('.retro-chip');
        if (!boton || boton.disabled || estado.terminado) return;

        estado[clave] = Number(boton.dataset.valor);
        g.querySelectorAll('.retro-chip').forEach((b) => marcar(b, b === boton));
        actualizarEnviar();
      });
    }

    function prepararMolestias() {
      const g = grupo('molestias');
      if (!g) return;

      g.addEventListener('click', (ev) => {
        const boton = ev.target.closest('.retro-chip');
        if (!boton || boton.disabled || estado.terminado) return;

        const valor = boton.dataset.valor;

        if (valor === 'ninguna') {
          // "Ninguna" es excluyente: limpia el resto (y viceversa).
          const activar = !estado.molestias.has('ninguna');
          estado.molestias.clear();
          if (activar) estado.molestias.add('ninguna');
          g.querySelectorAll('.retro-chip').forEach((b) => marcar(b, b.dataset.valor === 'ninguna' && activar));
        } else {
          estado.molestias.delete('ninguna');
          if (estado.molestias.has(valor)) estado.molestias.delete(valor);
          else estado.molestias.add(valor);
          const botonNinguna = g.querySelector('.retro-chip[data-valor="ninguna"]');
          if (botonNinguna) marcar(botonNinguna, false);
          marcar(boton, estado.molestias.has(valor));
        }

        estado.molestiasRespondidas = estado.molestias.size > 0;
        actualizarEnviar();
      });
    }

    /* ---------- Envío ---------- */

    function bloquearTodo() {
      cont.querySelectorAll('.retro-chip').forEach((b) => (b.disabled = true));
      if (el.comentario) el.comentario.disabled = true;
      if (el.enviar) el.enviar.disabled = true;
      if (el.omitir) el.omitir.disabled = true;
    }

    async function enviar() {
      if (estado.ocupado || estado.terminado) return;
      estado.ocupado = true;
      actualizarEnviar();

      if (el.status) el.status.textContent = 'Guardando…';

      const molestias = [...estado.molestias];

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: cont.dataset.fecha || '',
            esfuerzo: estado.esfuerzo,
            satisfaccion: estado.satisfaccion,
            // Incluye "ninguna" cuando aplique: el servidor la interpreta.
            molestias,
            comentario: el.comentario ? el.comentario.value.trim() : '',
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          if (el.status) el.status.textContent = data.message || 'No se pudo guardar. Inténtalo de nuevo.';
          estado.ocupado = false;
          actualizarEnviar();
          return;
        }

        /* Confirmación: las respuestas quedaron registradas y el sistema
           ya generó la recomendación. */
        estado.terminado = true;
        bloquearTodo();

        if (el.status) el.status.textContent = '';
        if (el.recomendacion) el.recomendacion.textContent = data.recomendacion || '';
        if (el.resultado) el.resultado.hidden = false;
        if (el.later) el.later.hidden = true;

        if (typeof conf.onGuardado === 'function') conf.onGuardado(data);
      } catch (err) {
        if (el.status) el.status.textContent = 'No se pudo guardar. Revisa tu conexión.';
        estado.ocupado = false;
        actualizarEnviar();
      }
    }

    async function omitir() {
      if (estado.ocupado || estado.terminado) return;
      estado.ocupado = true;

      if (el.status) el.status.textContent = '';

      try {
        await fetch(ENDPOINT_OMITIR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha: cont.dataset.fecha || '' }),
        });
      } catch (err) {
        /* Si falla, igual se permite continuar: no se obliga al usuario. */
      }

      estado.terminado = true;
      bloquearTodo();
      if (el.resultado) el.resultado.hidden = true;
      if (el.later) el.later.hidden = false;

      if (typeof conf.onOmitido === 'function') conf.onOmitido();
    }

    /* ---------- Eventos ---------- */

    prepararUnica('esfuerzo', 'esfuerzo');
    prepararUnica('satisfaccion', 'satisfaccion');
    prepararMolestias();

    if (el.enviar) el.enviar.addEventListener('click', enviar);
    if (el.omitir) el.omitir.addEventListener('click', omitir);

    return {
      reiniciar() {
        estado.esfuerzo = null;
        estado.satisfaccion = null;
        estado.molestias.clear();
        estado.molestiasRespondidas = false;
        estado.ocupado = false;
        estado.terminado = false;

        cont.querySelectorAll('.retro-chip').forEach((b) => {
          b.disabled = false;
          marcar(b, false);
        });
        if (el.comentario) {
          el.comentario.disabled = false;
          el.comentario.value = '';
        }
        if (el.status) el.status.textContent = '';
        if (el.resultado) el.resultado.hidden = true;
        if (el.later) el.later.hidden = true;
        actualizarEnviar();
      },
    };
  }

  window.GekoRetro = { init };
})();
