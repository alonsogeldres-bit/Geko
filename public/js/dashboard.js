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

  // Cambiar sugerencia: pide la siguiente alternativa al servidor (?alt=N)
  var swap = document.getElementById('btn-swap');
  if (swap) {
    swap.addEventListener('click', function () {
      var url = new URL(window.location.href);
      var alt = parseInt(url.searchParams.get('alt') || '0', 10) + 1;
      url.searchParams.set('alt', alt);
      window.location.href = url.toString();
    });
  }
})();
