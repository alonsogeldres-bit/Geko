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

  // Íconos vectoriales del interruptor (solo para [data-theme-icon="svg"], p. ej. el hub de
  // configuración). El resto de páginas siguen usando el emoji de su menú.
  var SVG_ATTR = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  var ICONO_SOL = '<svg class="gk-icon" ' + SVG_ATTR + '><circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity=".18"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.35 5.35l1.55 1.55M17.1 17.1l1.55 1.55M5.35 18.65l1.55-1.55M17.1 6.9l1.55-1.55"/></svg>';
  var ICONO_LUNA = '<svg class="gk-icon" ' + SVG_ATTR + '><path d="M19.6 14.6A8.2 8.2 0 0 1 9.4 4.4a8.2 8.2 0 1 0 10.2 10.2z" fill="currentColor" fill-opacity=".18"/><path d="M17.2 3.6v2.8M15.8 5h2.8"/></svg>';

  function guardar(tema) {
    try { localStorage.setItem(KEY, tema); } catch (e) { /* modo privado: solo en memoria */ }
  }

  // Se aplica de inmediato, antes de que el body exista.
  aplicar(leer());

  function sincronizarBotones() {
    var oscuro = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-checked', oscuro ? 'true' : 'false');
      btn.setAttribute('aria-label', oscuro ? 'Desactivar modo oscuro' : 'Activar modo oscuro');
    });
    document.querySelectorAll('[data-theme-icon]').forEach(function (ico) {
      if (ico.getAttribute('data-theme-icon') === 'svg') {
        ico.innerHTML = oscuro ? ICONO_LUNA : ICONO_SOL;
      } else {
        ico.textContent = oscuro ? '🌙' : '☀️';
      }
    });
    document.querySelectorAll('[data-theme-state]').forEach(function (el) {
      el.textContent = oscuro ? 'Activado' : 'Desactivado';
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
