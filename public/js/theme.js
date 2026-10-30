/* ===========================================
   TEMA CLARO / OSCURO
   - Claro es el predeterminado.
   - La preferencia se guarda en localStorage ("geko-theme").
   - Se carga en el <head> (sin defer) para aplicar el tema antes
     de pintar y evitar el parpadeo.
   - Premium también respeta el tema: claro por defecto y oscuro
     opcional. Su paleta dorada vive en el CSS de cada tema.
   =========================================== */
(function () {
  var KEY = 'geko-theme';
  var root = document.documentElement;
  var LOGO_CLARO = '/assets/geko-logo.png';
  var LOGO_OSCURO = '/assets/geko.png';

  function leer() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function aplicar(tema) {
    root.setAttribute('data-theme', tema);
    root.style.colorScheme = tema;
    sincronizarLogos();
    sincronizarThemeColor();
  }

  // El logo depende del tema: el de fondo claro para el tema claro y el de
  // fondo oscuro para el tema oscuro. En Premium el tinte dorado lo pone el CSS.
  function sincronizarLogos() {
    var claro = root.getAttribute('data-theme') !== 'dark';
    var src = claro ? LOGO_CLARO : LOGO_OSCURO;
    document.querySelectorAll('img[data-logo]').forEach(function (img) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  // Barra del navegador (móvil) a juego con el fondo real de la página.
  function sincronizarThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var oscuro = root.getAttribute('data-theme') === 'dark';
    var premium = !!document.querySelector('.is-premium');
    var color;
    if (oscuro) color = premium ? '#000000' : '#101C17';
    else color = premium ? '#FFF9E8' : '#F5FAF6';
    meta.setAttribute('content', color);
  }

  function guardar(tema) {
    try { localStorage.setItem(KEY, tema); } catch (e) { /* modo privado: solo en memoria */ }
  }

  // Se aplica de inmediato, antes de que el body exista.
  aplicar(leer());

  function sincronizarBotones() {
    var oscuro = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-checked', oscuro ? 'true' : 'false');
      var ico = btn.querySelector('[data-theme-icon]');
      if (ico) ico.textContent = oscuro ? '🌙' : '☀️';
    });
  }

  function alternar() {
    var siguiente = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    aplicar(siguiente);
    guardar(siguiente);
    sincronizarBotones();
  }

  window.GekoTheme = { get: leer, toggle: alternar };

  document.addEventListener('DOMContentLoaded', function () {
    sincronizarBotones();
    sincronizarLogos();
    sincronizarThemeColor();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', alternar);
    });
  });

  // Si se cambia el tema en otra pestaña, esta se actualiza sola.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) {
      aplicar(e.newValue === 'dark' ? 'dark' : 'light');
      sincronizarBotones();
    }
  });
})();
