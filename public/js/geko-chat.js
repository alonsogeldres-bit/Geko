/* ===========================================
   CHAT DE LA MASCOTA GEKO
   - Se abre al hacer clic en Geko (evento "geko:click") y se cierra con la X,
     con Esc, con un clic vacío fuera del panel o volviendo a hacer clic en la
     mascota.
   - Mientras el chat está abierto Geko se queda quieto; la ventana se coloca a
     su lado leyendo su posición real (window.GekoMascot.rect()), así también
     queda bien si cambia el tamaño de la ventana o sus preferencias. En móvil
     (Geko en la esquina) el panel se abre encima de él.
   - Envía las preguntas a POST /geko/chat. El servidor añade el contexto de la
     página y los datos del usuario.
   - Si el usuario pide cambiar la rutina ("no tengo mancuernas"), el servidor
     responde con una propuesta y aquí se muestra una tarjeta "Cambiar X por -> Y"
     con Aceptar / Rechazar. La rutina solo cambia si el usuario acepta
     (POST /geko/chat/rutina/aceptar); el perfil nunca se modifica.
   - Estilos: public/css/geko-chat.css
   =========================================== */
(function () {
  'use strict';

  var panel = document.getElementById('geko-chat');
  if (!panel) return;

  var card = panel.querySelector('.geko-chat-card');
  var log = document.getElementById('geko-chat-log');
  var chips = document.getElementById('geko-chat-chips');
  var form = document.getElementById('geko-chat-form');
  var input = document.getElementById('geko-chat-input');
  var sendBtn = document.getElementById('geko-chat-send');
  var closeBtn = document.getElementById('geko-chat-close');
  var geko = document.getElementById('geko');

  var pagina = panel.getAttribute('data-pagina') || 'dashboard';
  var nombre = (panel.getAttribute('data-nombre') || '').trim();
  var LOGO = '/assets/geko-logo.png';
  var PAD = 12;                        /* margen mínimo con el borde de la pantalla */
  var GAP = 14;                        /* separación entre Geko y la ventana */

  var abierto = false;
  var enviando = false;
  var saludoMostrado = false;
  var rafId = 0;
  var anchoPanel = 0;
  var altoPanel = 0;
  var maxAplicado = '';

  /* ---------- Utilidades ---------- */

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function scrollAbajo() {
    log.scrollTop = log.scrollHeight;
  }

  function medir() {
    anchoPanel = card.offsetWidth;
    altoPanel = card.offsetHeight;
  }

  function rectGeko() {
    var api = window.GekoMascot;
    if (!api || typeof api.rect !== 'function') return null;
    return api.rect();
  }

  /* ---------- Mensajes ---------- */

  function crearMini() {
    var mini = document.createElement('span');
    mini.className = 'geko-mini';
    var img = document.createElement('img');
    img.src = LOGO;
    img.alt = '';
    img.width = 22;
    img.height = 22;
    mini.appendChild(img);
    return mini;
  }

  function agregarMensaje(texto, tipo) {
    var fila = document.createElement('div');
    fila.className = 'geko-msg from-' + (tipo === 'user' ? 'user' : 'bot') +
      (tipo === 'error' ? ' is-error' : '');

    if (tipo !== 'user') fila.appendChild(crearMini());

    var burbuja = document.createElement('div');
    burbuja.className = 'geko-bubble';
    burbuja.textContent = texto;
    fila.appendChild(burbuja);

    log.appendChild(fila);
    scrollAbajo();

    /* Un mensaje nuevo cambia el alto del panel: se remide y se recoloca. */
    medir();
    colocar();
    return fila;
  }

  /* ---------- Propuesta de cambio de rutina ---------- */

  var tarjetaActiva = null;

  function crearEl(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function cerrarTarjeta(t, estado, texto) {
    if (!t) return;
    t.classList.remove('is-busy');
    t.classList.add('is-' + estado);
    var acciones = t.querySelector('.geko-change-actions');
    if (acciones) acciones.remove();
    var pie = t.querySelector('.geko-change-status');
    if (pie) pie.textContent = texto;
    medir();
    colocar();
  }

  function responderPropuesta(accion, propuesta, t) {
    var botones = t.querySelectorAll('button');
    botones.forEach(function (b) { b.disabled = true; });
    t.classList.add('is-busy');

    fetch('/geko/chat/rutina/' + accion, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id: propuesta.id })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (data) { return { ok: res.ok, data: data || {} }; });
      })
      .then(function (r) {
        if (r.ok && r.data.ok) {
          if (tarjetaActiva === t) tarjetaActiva = null;
          cerrarTarjeta(t, accion === 'aceptar' ? 'done' : 'rejected',
            accion === 'aceptar' ? 'Cambio aplicado' : 'Cambio descartado');
          agregarMensaje(r.data.mensaje || (accion === 'aceptar' ? 'Listo, cambié tu rutina.' : 'Entendido.'), 'bot');
        } else {
          t.classList.remove('is-busy');
          botones.forEach(function (b) { b.disabled = false; });
          /* 409/410: la propuesta ya no vale (rutina distinta o caducada). */
          if (r.data.message && /ya no está vigente|caducó|cambió|ya es distinta/.test(r.data.message)) {
            if (tarjetaActiva === t) tarjetaActiva = null;
            cerrarTarjeta(t, 'stale', 'Propuesta no vigente');
          }
          agregarMensaje(r.data.message || 'No pude completar la acción. Inténtalo de nuevo.', 'error');
        }
      })
      .catch(function () {
        t.classList.remove('is-busy');
        botones.forEach(function (b) { b.disabled = false; });
        agregarMensaje('No pude conectarme. Revisa tu conexión e inténtalo otra vez.', 'error');
      });
  }

  /* Tarjeta: "Cambiar X por -> Y" por cada ejercicio, con Aceptar / Rechazar. */
  function agregarPropuesta(propuesta) {
    if (!propuesta || !propuesta.cambios || !propuesta.cambios.length) return;

    /* Solo la última propuesta está vigente: la anterior se marca como reemplazada. */
    if (tarjetaActiva) cerrarTarjeta(tarjetaActiva, 'stale', 'Propuesta reemplazada');

    var fila = crearEl('div', 'geko-msg from-bot geko-msg-change');
    fila.appendChild(crearMini());

    var t = crearEl('div', 'geko-change');
    t.setAttribute('role', 'group');
    t.setAttribute('aria-label', 'Propuesta de cambio de rutina');
    t.appendChild(crearEl('div', 'geko-change-title', 'Cambio propuesto en tu rutina'));

    var lista = crearEl('ul', 'geko-change-list');
    propuesta.cambios.forEach(function (c) {
      var li = crearEl('li', 'geko-change-item');
      li.appendChild(crearEl('span', 'geko-change-block', c.bloque));

      var linea = crearEl('span', 'geko-change-line');
      linea.appendChild(document.createTextNode('Cambiar '));
      linea.appendChild(crearEl('strong', 'geko-change-from', c.de));
      linea.appendChild(document.createTextNode(' por \u2192 '));
      linea.appendChild(crearEl('strong', 'geko-change-to', c.a));
      li.appendChild(linea);

      if (c.detalle) li.appendChild(crearEl('span', 'geko-change-detail', c.detalle));
      lista.appendChild(li);
    });
    t.appendChild(lista);

    var acciones = crearEl('div', 'geko-change-actions');
    var aceptar = crearEl('button', 'geko-change-btn is-accept', 'Aceptar');
    aceptar.type = 'button';
    var rechazar = crearEl('button', 'geko-change-btn is-reject', 'Rechazar');
    rechazar.type = 'button';
    aceptar.addEventListener('click', function () { responderPropuesta('aceptar', propuesta, t); });
    rechazar.addEventListener('click', function () { responderPropuesta('rechazar', propuesta, t); });
    acciones.appendChild(aceptar);
    acciones.appendChild(rechazar);
    t.appendChild(acciones);

    var pie = crearEl('div', 'geko-change-status');
    pie.setAttribute('role', 'status');
    t.appendChild(pie);

    fila.appendChild(t);
    log.appendChild(fila);
    tarjetaActiva = t;
    scrollAbajo();
    medir();
    colocar();
  }

  function mostrarEscribiendo() {
    quitarEscribiendo();

    var fila = document.createElement('div');
    fila.className = 'geko-msg from-bot';
    fila.id = 'geko-typing';
    fila.setAttribute('aria-label', 'Geko está escribiendo');

    var mini = crearMini();
    var burbuja = document.createElement('div');
    burbuja.className = 'geko-bubble geko-typing';
    burbuja.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) burbuja.appendChild(document.createElement('i'));

    fila.appendChild(mini);
    fila.appendChild(burbuja);
    log.appendChild(fila);
    scrollAbajo();
    medir();
    colocar();
  }

  function quitarEscribiendo() {
    var t = document.getElementById('geko-typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  function saludar() {
    if (saludoMostrado) return;
    saludoMostrado = true;

    var saludo = (nombre ? '¡Hola, ' + nombre + '! ' : '¡Hola! ') +
      'Soy Geko, tu mascota. Puedo explicarte tu rutina, tus datos o cómo usar la app. ' +
      'Si algo de tu rutina no te sirve (por ejemplo, "no tengo mancuernas"), te propongo un cambio y tú decides si lo aceptas. ' +
      'Tus datos personales no los modifico. ¿Qué necesitas?';
    agregarMensaje(saludo, 'bot');
  }

  /* ---------- Posición: siempre al lado de Geko ---------- */

  /* Ajusta el alto máximo del panel al espacio libre y devuelve el alto real. */
  function ajustarAlto(espacio) {
    var maxCss = Math.max(200, Math.min(540, Math.round(espacio))) + 'px';
    if (maxCss !== maxAplicado) {
      card.style.maxHeight = maxCss;
      maxAplicado = maxCss;
      medir();
    }
    return altoPanel;
  }

  function liberarAlto() {
    if (maxAplicado) {
      card.style.maxHeight = '';
      maxAplicado = '';
      medir();
    }
    return altoPanel;
  }

  function colocar() {
    var g = rectGeko();

    /* Sin API de la mascota (por ejemplo, si aún no cargó): rincón inferior. */
    if (!g) {
      if (!abierto) return;
      g = { x: window.innerWidth - 70, y: window.innerHeight - 16, w: 110, h: 130, mode: 'corner' };
    }

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = anchoPanel || card.offsetWidth;
    var h = altoPanel || card.offsetHeight;
    if (!w || !h) return;

    var cx = g.x;
    var pies = g.y;
    var altoGeko = g.h;
    var cabeza = pies - altoGeko;
    var anchorY = pies - altoGeko * 0.55;         /* centro del cuerpo de Geko */
    var movil = vw <= 720 || g.mode === 'corner';

    var izq = 0;
    var top = 0;
    var pos = 'right';

    if (movil) {
      /* Encima de Geko, con el alto justo para no taparlo. */
      pos = 'above';
      h = ajustarAlto(cabeza - PAD - GAP);
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
        /* No cabe a los lados: se pone encima de Geko. */
        pos = 'above';
        izq = clamp(cx - w / 2, PAD, vw - w - PAD);
      }

      if (pos === 'above') {
        h = ajustarAlto(cabeza - PAD - GAP);
        top = clamp(cabeza - h - GAP, PAD, vh - h - PAD);
      } else {
        h = liberarAlto();
        top = clamp(anchorY - h / 2, PAD, vh - h - PAD);
      }
      izq = clamp(izq, PAD, vw - w - PAD);
    }

    panel.classList.remove('pos-right', 'pos-left', 'pos-above');
    panel.classList.add('pos-' + pos);

    /* La flecha apunta al cuerpo de Geko, no al borde del panel. */
    if (pos === 'above') {
      card.style.setProperty('--arrow-x', clamp(cx - izq, 24, w - 24) + 'px');
    } else {
      card.style.setProperty('--arrow-y', clamp(anchorY - top, 24, h - 24) + 'px');
    }

    card.style.transform = 'translate3d(' + Math.round(izq) + 'px,' + Math.round(top) + 'px,0)';
  }

  function bucle() {
    if (!abierto) { rafId = 0; return; }

    /* Si ocultan a Geko desde Configuración, el chat se cierra solo.
       (Si aún no hay posición pero la mascota sigue visible, se usa la de respaldo.) */
    if (window.GekoMascot && !rectGeko()) {
      var prefs = window.GekoMascotPrefs && window.GekoMascotPrefs.get();
      if (prefs && prefs.visible === false) { cerrar(); return; }
    }

    colocar();
    rafId = requestAnimationFrame(bucle);
  }

  /* ---------- Abrir / cerrar ---------- */

  function bloquear(estado) {
    enviando = estado;
    sendBtn.disabled = estado;
    input.disabled = estado;
  }

  function abrir() {
    if (abierto) return;
    abierto = true;
    panel.hidden = false;
    document.body.classList.add('geko-chat-open');
    window.dispatchEvent(new CustomEvent('geko:chat-open'));
    if (geko) {
      geko.setAttribute('aria-expanded', 'true');
      geko.setAttribute('aria-controls', 'geko-chat');
    }

    saludar();
    medir();
    colocar();
    if (!rafId) rafId = requestAnimationFrame(bucle);

    /* El teclado virtual en móvil taparía media pantalla: solo se enfoca con ratón. */
    if (window.matchMedia('(pointer: fine)').matches) {
      setTimeout(function () { if (abierto) input.focus(); }, 60);
    }
  }

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    panel.hidden = true;
    document.body.classList.remove('geko-chat-open');
    window.dispatchEvent(new CustomEvent('geko:chat-close'));
    if (geko) geko.setAttribute('aria-expanded', 'false');
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }

    /* Devuelve el foco a Geko para no perder la posición del teclado. */
    if (geko && document.activeElement && panel.contains(document.activeElement)) {
      geko.focus();
    }
  }

  function alternar() {
    if (abierto) cerrar();
    else abrir();
  }

  /* ---------- Envío ---------- */

  function terminar() {
    bloquear(false);
    medir();
    colocar();
    if (abierto && window.matchMedia('(pointer: fine)').matches) input.focus();
  }

  function enviar(texto) {
    if (enviando) return;

    var mensaje = String(texto || '').trim();
    if (!mensaje) return;

    bloquear(true);
    chips.hidden = true;
    input.value = '';
    input.style.height = '';

    agregarMensaje(mensaje, 'user');
    mostrarEscribiendo();

    fetch('/geko/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ mensaje: mensaje, pagina: pagina })
    })
      .then(function (res) {
        return res.json()
          .catch(function () { return {}; })
          .then(function (data) { return { status: res.status, ok: res.ok, data: data || {} }; });
      })
      .then(function (r) {
        quitarEscribiendo();

        if (r.ok && r.data.ok && (r.data.respuesta || r.data.propuesta)) {
          if (r.data.respuesta) agregarMensaje(r.data.respuesta, 'bot');
          if (r.data.propuesta) agregarPropuesta(r.data.propuesta);
        } else if (r.status === 401) {
          agregarMensaje('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.', 'error');
        } else {
          agregarMensaje(r.data.message || 'No pude responder ahora mismo. Inténtalo de nuevo.', 'error');
        }
        terminar();
      })
      .catch(function () {
        quitarEscribiendo();
        agregarMensaje('No pude conectarme. Revisa tu conexión e inténtalo otra vez.', 'error');
        terminar();
      });
  }

  /* ---------- Eventos ---------- */

  window.addEventListener('geko:click', alternar);

  closeBtn.addEventListener('click', cerrar);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abierto) cerrar();
  });

  /* Click "vacío" fuera del chat: se cierra. Si el clic cae en un botón, enlace
     o control (de la página o del chat), se respeta y la ventana sigue abierta. */
  document.addEventListener('click', function (e) {
    if (!abierto) return;

    var t = e.target;
    if (!t || !t.closest) return;
    if (panel.contains(t)) return;
    if (geko && (t === geko || geko.contains(t))) return;

    var control = t.closest(
      'a, button, input, select, textarea, label, summary, ' +
      '[role="button"], [role="menuitem"], [role="menuitemcheckbox"], [contenteditable="true"]'
    );
    if (control && control !== document.body) return;

    cerrar();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    enviar(input.value);
  });

  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(110, input.scrollHeight) + 'px';
    /* La caja crece al escribir: se recoloca para seguir pegado a Geko. */
    if (abierto) {
      medir();
      colocar();
    }
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar(input.value);
    }
  });

  chips.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-q]') : null;
    if (!btn) return;
    enviar(btn.getAttribute('data-q'));
  });

  window.addEventListener('resize', function () {
    if (!abierto) return;
    card.style.maxHeight = '';
    maxAplicado = '';
    medir();
    colocar();
  });

  /* Si la mascota se oculta desde Configuración, no se queda un panel huérfano. */
  if (window.GekoMascotPrefs && typeof window.GekoMascotPrefs.subscribe === 'function') {
    window.GekoMascotPrefs.subscribe(function (p) {
      if (!p.visible) cerrar();
    });
  }
})();
