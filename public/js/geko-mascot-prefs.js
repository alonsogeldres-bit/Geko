/* ===========================================
   PREFERENCIAS DE LA MASCOTA GEKO
   - Las guarda en localStorage ("geko-mascot"), igual que el tema
     claro / oscuro ("geko-theme"): se aplican al instante y no
     necesitan base de datos. Son por navegador / dispositivo.
   - Se carga en el <head> (sin defer) para marcar <html> antes de
     pintar y evitar el parpadeo (ver geko-mascot.css y dashboard.css).
   - Lo usan geko-mascot.js (dashboard y progreso) y
     configuracion-mascota.js (Configuración > Mascota Geko).
   - Los valores por defecto reproducen exactamente el comportamiento
     original de Geko: camina por los laterales, pasea sola y se duerme.

   API pública: window.GekoMascotPrefs
     get()          -> copia de las preferencias actuales
     set(cambios)   -> valida, guarda y avisa a los suscriptores
     reset()        -> vuelve a los valores por defecto
     isDefault()    -> true si no hay nada personalizado
     subscribe(fn)  -> fn(prefs) en cada cambio (también si cambia en
                       otra pestaña). Devuelve una función para darse de baja.
     persistent()   -> false si el navegador no deja guardar (modo privado)
     defaults       -> copia de los valores por defecto
   =========================================== */
(function () {
  'use strict';

  var KEY = 'geko-mascot';
  var root = document.documentElement;

  var DEFAULTS = {
    visible: true,        /* mostrar a Geko */
    area: 'side',         /* 'side' laterales · 'free' toda la pantalla · 'corner' quieta en la esquina inferior derecha */
    wander: true,         /* pasea por su cuenta */
    speed: 'normal',      /* 'slow' | 'normal' | 'fast' */
    size: 'normal',       /* 'small' | 'normal' | 'large' */
    neverSleep: false     /* true = modo activo permanente: nunca se duerme */
  };

  var CHOICES = {
    area: ['side', 'free', 'corner'],
    speed: ['slow', 'normal', 'fast'],
    size: ['small', 'normal', 'large']
  };

  var subscribers = [];
  var canStore = probe();
  var current;

  /* Comprueba si localStorage se puede usar (en modo privado puede lanzar error). */
  function probe() {
    try {
      var k = '__geko_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function copy(p) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = p[k]; });
    return out;
  }

  /* Cualquier valor desconocido, ausente o de tipo incorrecto vuelve a su valor por defecto. */
  function sanitize(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = src[k];
      var d = DEFAULTS[k];
      if (typeof d === 'boolean') out[k] = typeof v === 'boolean' ? v : d;
      else out[k] = CHOICES[k].indexOf(v) !== -1 ? v : d;
    });
    return out;
  }

  function same(a, b) {
    return Object.keys(DEFAULTS).every(function (k) { return a[k] === b[k]; });
  }

  function read() {
    try {
      var txt = localStorage.getItem(KEY);
      return sanitize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      return sanitize(null);
    }
  }

  function write(p) {
    if (!canStore) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch (e) {
      canStore = false;   /* sin espacio o bloqueado: sigue funcionando solo en memoria */
    }
  }

  /* Marca <html>: el CSS oculta la capa de Geko y devuelve el ancho al contenido
     sin esperar a que cargue el resto de scripts. */
  function applyRoot(p) {
    root.setAttribute('data-geko-visible', p.visible ? 'true' : 'false');
    /* "lanes" = Geko usa los carriles laterales, por eso el contenido se estrecha */
    root.setAttribute('data-geko-lanes', p.visible && p.area === 'side' ? 'on' : 'off');
  }

  function notify() {
    var snapshot = copy(current);
    subscribers.slice().forEach(function (fn) {
      try { fn(copy(snapshot)); } catch (e) { /* un suscriptor roto no debe afectar a los demás */ }
    });
  }

  function set(changes) {
    var merged = copy(current);
    Object.keys(changes || {}).forEach(function (k) { merged[k] = changes[k]; });
    var next = sanitize(merged);
    if (same(next, current)) return copy(current);

    current = next;
    write(current);
    applyRoot(current);
    notify();
    return copy(current);
  }

  function reset() {
    current = sanitize(null);
    if (canStore) {
      try { localStorage.removeItem(KEY); } catch (e) { canStore = false; }
    }
    applyRoot(current);
    notify();
    return copy(current);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  /* Se aplica de inmediato, antes de que el body exista. */
  current = read();
  applyRoot(current);

  window.GekoMascotPrefs = {
    get: function () { return copy(current); },
    set: set,
    reset: reset,
    isDefault: function () { return same(current, DEFAULTS); },
    subscribe: subscribe,
    persistent: function () { return canStore; },
    defaults: copy(DEFAULTS)
  };

  /* Si se cambia en otra pestaña (o se borra el almacenamiento), esta se actualiza sola. */
  window.addEventListener('storage', function (e) {
    if (e.key !== null && e.key !== KEY) return;
    current = read();
    applyRoot(current);
    notify();
  });
})();
