/* ===========================================
   TEMA CLARO / OSCURO (modo Gratis)
   - Claro es el predeterminado.
   - La preferencia se guarda en localStorage ("geko-theme").
   - Se carga en el <head> (sin defer) para aplicar el tema antes
     de pintar y evitar el parpadeo.
   - El Premium ignora el tema: su paleta está fija en el CSS.
   =========================================== */
(function () {
  var KEY = 'geko-theme';
  var root = document.documentElement;
  var LOGO_CLARO = '/assets/Geko_nigger.png';
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
  }

  // El logo depende del tema: oscuro en modo claro, claro en modo oscuro.
  // Premium siempre tiene fondo oscuro, así que mantiene el logo claro.
  function sincronizarLogos() {
    var claro = root.getAttribute('data-theme') !== 'dark' &&
                !document.querySelector('.is-premium');
    var src = claro ? LOGO_CLARO : LOGO_OSCURO;
    document.querySelectorAll('img[data-logo]').forEach(function (img) {
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
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
