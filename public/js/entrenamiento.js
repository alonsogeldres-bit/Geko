(() => {
  'use strict';

  const SELECTOR_BOTON = '#btn-nueva-rutina';
  let generando = false;

  const contenedor = () => document.getElementById('rutina-contenedor');
  const estado = () => document.getElementById('rutina-estado');

  const anunciar = (mensaje) => {
    const nodo = estado();
    if (nodo) nodo.textContent = mensaje;
  };

  const marcarLimite = (max) => {
    const boton = document.querySelector(SELECTOR_BOTON);
    if (boton) {
      boton.removeAttribute('href');
      boton.classList.add('is-disabled');
      boton.classList.remove('is-loading');
      boton.setAttribute('aria-disabled', 'true');
      boton.textContent = `Límite alcanzado (${max}/${max})`;
    }

    const contador = document.querySelector('.rutina-contador');
    if (contador) {
      contador.textContent = `Ya usaste las ${max} solicitudes de hoy. Vuelve mañana o cambia tu perfil para reiniciar el contador.`;
    }
  };

  document.addEventListener('click', (event) => {
    const boton = event.target.closest(SELECTOR_BOTON);
    if (!boton) return;

    /* Ctrl/Cmd/Shift + clic o clic central: deja el comportamiento normal
       del enlace (abrir en otra pestaña) en vez de generar aquí. */
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();

    const max = Number(boton.dataset.max) || 3;

    if (generando) return;
    if (boton.getAttribute('aria-disabled') === 'true') return;
    if (boton.dataset.restantes === '0') {
      marcarLimite(max);
      anunciar(`Ya usaste las ${max} solicitudes de hoy.`);
      return;
    }

    generarOtra(boton, max);
  });

  async function generarOtra(boton, max) {
    const caja = contenedor();
    const textoOriginal = boton.textContent.trim();

    generando = true;
    boton.setAttribute('aria-disabled', 'true');
    boton.classList.add('is-disabled', 'is-loading');
    boton.textContent = 'Generando rutina…';
    if (caja) caja.setAttribute('aria-busy', 'true');
    anunciar('Generando una rutina nueva con IA…');

    try {
      const respuesta = await fetch('/entrenamiento/rutina', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: '{}',
      });

      /* Si la sesión venció, requireAuth redirige al login. */
      if (respuesta.redirected) {
        window.location.href = respuesta.url;
        return;
      }

      const datos = await respuesta.json().catch(() => null);

      if (respuesta.status === 429 && datos && datos.limite) {
        marcarLimite(max);
        anunciar(datos.error || `Ya usaste las ${max} solicitudes de hoy.`);
        return;
      }

      if (!respuesta.ok || !datos || !datos.ok) {
        throw new Error((datos && datos.error) || 'No pudimos generar la rutina.');
      }

      if (!caja) throw new Error('No encontramos el contenedor de la rutina.');

      /* Sustituye la rutina sin recargar y conserva la posición del scroll. */
      const scrollY = window.scrollY;
      caja.innerHTML = datos.html;
      window.scrollTo(0, scrollY);

      if (datos.limite) {
        anunciar(`Rutina actualizada. Ya usaste las ${max} solicitudes de hoy.`);
      } else if (datos.contada) {
        anunciar(`Rutina actualizada. Te quedan ${datos.restantes} de ${max} solicitudes.`);
      } else {
        anunciar('Se generó una rutina de respaldo; no se descontó ninguna solicitud.');
      }
    } catch (error) {
      boton.classList.remove('is-disabled', 'is-loading');
      boton.removeAttribute('aria-disabled');
      boton.textContent = textoOriginal;
      anunciar(error.message || 'No pudimos generar la rutina. Inténtalo de nuevo.');
    } finally {
      generando = false;
      if (caja) caja.removeAttribute('aria-busy');
    }
  }
})();
