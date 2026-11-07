/* ===========================================
   CONSEJOS DE LA MASCOTA GEKO (plan Gratis)
   - El chat directo con Geko es exclusivo de Premium. En el plan Gratis
     Geko se comporta igual, pero en vez de abrir el chat muestra consejos
     predeterminados en una burbuja junto a él.
   - Los mensajes son fijos (están aquí abajo). No los genera la IA ni se
     piden al servidor: son consejos de uso de la app escritos de antemano.
   - Se muestra uno al entrar (tras unos segundos) y luego cada cierto
     tiempo. Al hacer clic en Geko aparece el siguiente al instante.
   - La burbuja sigue la posición real de la mascota (window.GekoMascot),
     igual que hace el chat, y se coloca encima en el teléfono.
   - Estilos: public/css/geko-tips.css
   =========================================== */
(function () {
  'use strict';

  var panel = document.getElementById('geko-tips');
  if (!panel) return;

  var bubble = panel.querySelector('.geko-tips-bubble');
  var textEl = document.getElementById('geko-tips-text');
  var closeBtn = document.getElementById('geko-tips-close');

  /* Consejos fijos del plan Gratis (20 mensajes). */
  var TIPS = [
    'Puedes cambiar tu peso, estatura y nivel en Configuración > Perfil de entrenamiento. Así ajusto mejor tus rutinas.',
    'Si sientes alguna molestia o dolor, déjalo claro en tu perfil de entrenamiento. Lo tendré en cuenta para no exigirte de más.',
    'En Configuración > Perfil de entrenamiento puedes cambiar los días, el tiempo y el lugar donde entrenas.',
    'Si entrenas en casa y no tienes equipo, dilo en tu perfil de entrenamiento: buscaré ejercicios que puedas hacer igual.',
    'Registra cada entrenamiento al terminarlo. Así puedo ver tu progreso y celebrar tus avances contigo.',
    'La constancia vale más que la perfección. Con 3 días a la semana ya estás construyendo un hábito.',
    'En Mi progreso puedes ver cómo cambian tus medidas con el tiempo. No te compares con nadie más.',
    'Antes de empezar, dedica unos minutos a calentar. Tu cuerpo te lo va a agradecer.',
    'Si un ejercicio te resulta muy difícil, baja el peso o las repeticiones. La técnica va primero.',
    'Descansar también es entrenar. Intenta dormir bien para que tus músculos se recuperen.',
    'Puedes ocultarme o cambiar mi tamaño en Configuración > Mascota Geko. Me adapto a tu pantalla.',
    '¿Tienes dudas sobre planes o tu cuenta? En Ayuda encontrarás respuestas rápidas.',
    'No olvides hidratarte durante el entrenamiento. Pequeños sorbos, pero constantes.',
    'Si cambias de objetivo, actualízalo en Configuración > Perfil de entrenamiento. Así tus rutinas seguirán teniendo sentido.',
    'El chat directo conmigo está disponible en el plan Premium. En Gratis te acompaño con consejos como este.',
    'Registrar una molestia a tiempo ayuda a evitar lesiones. Si algo te duele, escríbelo en tu perfil de entrenamiento.',
    'La racha no se trata de no fallar nunca, sino de volver. Un día libre no borra tu esfuerzo.',
    'Revisa tus datos personales en Configuración > Datos personales. Tu fecha de nacimiento ayuda a calcular tus calorías.',
    'Estira al terminar. Cinco minutos de estiramiento ayudan a que mañana no te duela todo.',
    'Si tienes poco tiempo, elige una rutina más corta pero constante. Lo que cuenta es moverte.'
  ];

  var PRIMER_MS = 9000;         /* primer consejo al entrar */
  var MIN_MS = 30000;           /* espera mínima entre consejos */
  var MAX_MS = 50000;           /* espera máxima entre consejos */
  var VISIBLE_MS = 12000;       /* tiempo que queda visible cada consejo */
  var PAD = 12;                 /* margen mínimo con el borde de la pantalla */
  var GAP = 14;                 /* separación entre Geko y la burbuja */

  var orden = [];
  var visible = false;
  var timer = 0;
  var hideTimer = 0;
  var rafId = 0;
  var ancho = 0;
  var alto = 0;

  /* ---------- Utilidades ---------- */

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function barajar() {
    orden = TIPS.map(function (_, i) { return i; });
    for (var i = orden.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = orden[i];
      orden[i] = orden[j];
      orden[j] = tmp;
    }
  }

  function siguiente() {
    if (!orden.length) barajar();
    return TIPS[orden.pop()];
  }

  function medir() {
    ancho = bubble.offsetWidth;
    alto = bubble.offsetHeight;
  }

  function rectGeko() {
    var api = window.GekoMascot;
    if (!api || typeof api.rect !== 'function') return null;
    return api.rect();
  }

  /* ---------- Posición: siempre junto a Geko ---------- */

  function colocar() {
    var g = rectGeko();
    if (!g) { ocultar(); return; }

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = ancho || bubble.offsetWidth;
    var h = alto || bubble.offsetHeight;
    if (!w || !h) return;

    var cx = g.x;
    var pies = g.y;
    var altoGeko = g.h;
    var cabeza = pies - altoGeko;
    var anchorY = pies - altoGeko * 0.55;       /* centro del cuerpo de Geko */
    var movil = vw <= 720 || g.mode === 'corner';

    var izq = 0;
    var top = 0;
    var pos = 'right';

    if (movil) {
      /* Encima de Geko, sin taparlo. */
      pos = 'above';
      izq = clamp(cx - w / 2, PAD, vw - w - PAD);
      top = clamp(cabeza - h - GAP, PAD, vh - h - PAD);
    } else {
      var espacioDer = vw - (cx + g.w / 2);
      var espacioIzq = cx - g.w / 2;

      if (espacioDer >= w + GAP) {
        pos = 'right';
        izq = cx + g.w / 2 + GAP;
      } else if (espacioIzq >= w + GAP) {
        pos = 'left';
        izq = cx - g.w / 2 - GAP - w;
      } else {
        pos = 'above';
        izq = clamp(cx - w / 2, PAD, vw - w - PAD);
      }

      if (pos === 'above') {
        top = clamp(cabeza - h - GAP, PAD, vh - h - PAD);
      } else {
        top = clamp(anchorY - h / 2, PAD, vh - h - PAD);
      }
      izq = clamp(izq, PAD, vw - w - PAD);
    }

    panel.classList.remove('pos-right', 'pos-left', 'pos-above');
    panel.classList.add('pos-' + pos);

    /* La flecha apunta al cuerpo de Geko. */
    if (pos === 'above') {
      bubble.style.setProperty('--arrow-x', clamp(cx - izq, 20, w - 20) + 'px');
    } else {
      bubble.style.setProperty('--arrow-y', clamp(anchorY - top, 20, h - 20) + 'px');
    }

    bubble.style.transform = 'translate3d(' + Math.round(izq) + 'px,' + Math.round(top) + 'px,0)';
  }

  function bucle() {
    if (!visible) { rafId = 0; return; }
    if (!rectGeko()) { ocultar(); return; }
    colocar();
    rafId = requestAnimationFrame(bucle);
  }

  /* ---------- Mostrar / ocultar ---------- */

  function mostrar(forzar) {
    /* Si Geko está oculto o todavía no se midió, no hay dónde poner la burbuja. */
    if (!rectGeko()) return;

    /* No interrumpir mientras el usuario escribe en un campo (salvo clic en Geko). */
    if (!forzar) {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
    }

    if (visible) ocultar();

    /* Geko se despierta y mira al frente para decir el consejo. */
    window.dispatchEvent(new CustomEvent('geko:tip'));

    panel.hidden = false;
    textEl.textContent = siguiente();
    visible = true;
    medir();
    colocar();
    if (!rafId) rafId = requestAnimationFrame(bucle);

    clearTimeout(hideTimer);
    hideTimer = setTimeout(ocultar, VISIBLE_MS);
  }

  function ocultar() {
    if (!visible) return;
    visible = false;
    panel.hidden = true;
    clearTimeout(hideTimer);
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function programar(primera) {
    clearTimeout(timer);
    var espera = primera
      ? PRIMER_MS
      : MIN_MS + Math.random() * (MAX_MS - MIN_MS);

    timer = setTimeout(function () {
      if (document.hidden) { programar(false); return; }
      mostrar();
      programar(false);
    }, espera);
  }

  /* Al hacer clic en Geko se muestra el siguiente consejo al instante. */
  window.addEventListener('geko:click', function () {
    clearTimeout(timer);
    mostrar(true);
    programar(false);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      ocultar();
    });
  }

  /* Si el usuario acerca el cursor o entra con el teclado, el consejo no se
     oculta solo: le da tiempo a leerlo o a pulsar "Ver planes". */
  function mantenerVisible() {
    clearTimeout(hideTimer);
  }

  function reanudarOcultar() {
    clearTimeout(hideTimer);
    if (visible) hideTimer = setTimeout(ocultar, VISIBLE_MS);
  }

  bubble.addEventListener('mouseenter', mantenerVisible);
  bubble.addEventListener('mouseleave', reanudarOcultar);
  bubble.addEventListener('focusin', mantenerVisible);
  bubble.addEventListener('focusout', function (e) {
    if (!bubble.contains(e.relatedTarget)) reanudarOcultar();
  });

  /* Si el usuario oculta a Geko desde Configuración, la burbuja se va con él. */
  if (window.GekoMascotPrefs && typeof window.GekoMascotPrefs.subscribe === 'function') {
    window.GekoMascotPrefs.subscribe(function (p) {
      if (!p.visible) ocultar();
    });
  }

  /* Con la pestaña en segundo plano no se muestran consejos. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) ocultar();
    else programar(false);
  });

  window.addEventListener('resize', function () {
    if (!visible) return;
    medir();
    colocar();
  });

  programar(true);
})();
