/* Dashboard: menú del avatar y botón "Cambiar sugerencia" */
(function () {
  var menu = document.getElementById('user-menu');

  if (menu) {
    // Cerrar el menú al hacer clic fuera
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });

    // Cerrar con Escape y devolver el foco al avatar
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false;
        var resumen = menu.querySelector('summary');
        if (resumen) resumen.focus();
      }
    });

    // Los ítems de plantilla (href="#") no navegan
    menu.querySelectorAll('.is-soon').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); });
    });
  }

  // Cambiar sugerencia: pide la siguiente al servidor (POST) y actualiza solo
  // la tarjeta, sin recargar la página. El límite semanal (3) lo decide el
  // servidor: si responde 402, se abre el modal de mejora de plan.
  var swap = document.getElementById('btn-swap');
  if (swap) {
    var indice = parseInt(swap.getAttribute('data-indice'), 10) || 1;
    var variantes = parseInt(swap.getAttribute('data-variantes'), 10) || 1;
    var ilimitado = swap.getAttribute('data-ilimitado') === 'true';
    var cargando = false;

    /* ---------- Modal de límite semanal ---------- */
    var modal = document.getElementById('upgrade-modal');
    var focoPrevio = null;

    var abrirModal = function () {
      if (!modal) return;
      focoPrevio = document.activeElement;
      modal.hidden = false;
      document.body.classList.add('modal-abierto');

      var cta = document.getElementById('upgrade-cta');
      if (cta) cta.focus();
    };

    var cerrarModal = function () {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('modal-abierto');

      // Devuelve el foco a donde estaba (normalmente el botón de cambiar).
      if (focoPrevio && typeof focoPrevio.focus === 'function') focoPrevio.focus();
      else swap.focus();
    };

    if (modal) {
      var cerrar = document.getElementById('upgrade-close');
      if (cerrar) cerrar.addEventListener('click', cerrarModal);

      // Clic en el fondo (fuera de la tarjeta)
      modal.addEventListener('click', function (e) {
        if (e.target === modal) cerrarModal();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !modal.hidden) {
          e.preventDefault();
          cerrarModal();
        }
      });
    }

    var setText = function (id, texto) {
      var el = document.getElementById(id);
      if (el) el.textContent = texto;
    };

    var pintar = function (s) {
      setText('sug-nombre', s.nombre);
      setText('sug-tipo', s.tipo);
      setText('sug-minutos', '~' + s.minutos + ' min');
      setText('sug-grupo', s.grupo);
      setText('sug-intensidad', 'Intensidad ' + String(s.intensidad || '').toLowerCase());
      setText('sug-ejercicios', s.ejercicios + ' ejercicios');
      setText('sug-motivo', s.motivo);
      // Premium: el contador es el símbolo de infinito (ya está en el HTML), no se toca
      if (!s.ilimitado) setText('sug-contador', '(' + s.indiceVariante + '/' + s.variantes + ')');

      // "Comenzar entrenamiento" debe abrir la variante que se está viendo
      var start = document.getElementById('btn-start');
      if (start) start.setAttribute('href', '/entrenamiento?alt=' + (s.indiceVariante - 1));
    };

    swap.addEventListener('click', function () {
      if (cargando) return;

      // Plan Gratis en 3/3: el modal se abre sin llamar al servidor.
      if (!ilimitado && indice >= variantes) {
        abrirModal();
        return;
      }

      cargando = true;

      // Parpadeo: durante 0,2 s el botón muestra su color original (sin el gris del hover)
      swap.classList.add('is-flash');
      setTimeout(function () { swap.classList.remove('is-flash'); }, 200);

      fetch('/dashboard/sugerencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ alt: indice })
      })
        .then(function (res) {
          // Límite semanal alcanzado: se ofrece Premium.
          if (res.status === 402) {
            abrirModal();
            return null;
          }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (s) {
          if (!s) return;

          // Gratis: el servidor manda la variante ya consumida (1..3).
          // Premium: también devuelve la variante mostrada (rotación infinita).
          indice = s.indiceVariante || 1;
          if (s.variantes) variantes = s.variantes;

          pintar(s);
        })
        .catch(function () {
          // Si falla (p. ej. sesión vencida), recarga la página
          window.location.reload();
        })
        .finally(function () {
          cargando = false;
        });
    });
  }
})();