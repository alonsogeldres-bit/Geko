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
  // la tarjeta, sin recargar la página. El límite (3) lo marca el servidor.
  var swap = document.getElementById('btn-swap');
  if (swap) {
    var alt = 0;           // sugerencia que se está viendo (0 = 1/3)
    var cargando = false;

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
      setText('sug-contador', '(' + s.indiceVariante + '/' + s.variantes + ')');

      // "Comenzar entrenamiento" debe abrir la variante que se está viendo
      var start = document.getElementById('btn-start');
      if (start) start.setAttribute('href', '/entrenamiento?alt=' + (s.indiceVariante - 1));

      // Límite alcanzado (p. ej. 3/3): el botón se desactiva
      swap.disabled = s.indiceVariante >= s.variantes;
    };

    swap.addEventListener('click', function () {
      if (cargando || swap.disabled) return;
      cargando = true;

      // Parpadeo: durante 0,2 s el botón muestra su color original (sin el gris del hover)
      swap.classList.add('is-flash');
      setTimeout(function () { swap.classList.remove('is-flash'); }, 200);

      fetch('/dashboard/sugerencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ alt: alt + 1 })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (s) {
          alt = s.indiceVariante - 1;
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
