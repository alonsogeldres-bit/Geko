/* Dashboard: menú del avatar y botón "Cambiar sugerencia" */
(function () {
  var wrap = document.getElementById('user-menu');
  var btn = document.getElementById('avatar-btn');
  var menu = document.getElementById('user-dropdown');
  if (!wrap || !btn || !menu) return;

  function open() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () {
    menu.hidden ? open() : close();
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) close();
  });

  // Cerrar con Escape y devolver el foco al avatar
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
  });

  // Los ítems de plantilla (href="#") no navegan
  menu.querySelectorAll('.is-soon').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

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
})();/* Dashboard: menú del avatar y botón "Cambiar sugerencia" */
(function () {
  var wrap = document.getElementById('user-menu');
  var btn = document.getElementById('avatar-btn');
  var menu = document.getElementById('user-dropdown');
  if (!wrap || !btn || !menu) return;

  function open() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () {
    menu.hidden ? open() : close();
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', function (e) {
    if (!wrap.contains(e.target)) close();
  });

  // Cerrar con Escape y devolver el foco al avatar
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
  });

  // Los ítems de plantilla (href="#") no navegan
  menu.querySelectorAll('.is-soon').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

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