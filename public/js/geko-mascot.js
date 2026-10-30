/* ===========================================
   MASCOTA GEKO (dashboard)
   - Escritorio: camina sola por los márgenes laterales; el contenido
     (tarjetas) es un muro. Si sale por un lado de la pantalla reaparece
     por el opuesto (también arriba/abajo).
   - Teléfono (pantallas angostas, sin márgenes): se queda quieta en la
     esquina inferior derecha del viewport.
   - En ambos casos se duerme cada 20-30 s; al hacerle clic despierta y saluda.
   - Al hacer clic emite "geko:click" en window (futuro chat con IA).
   =========================================== */
(function () {
  'use strict';

  var layer = document.getElementById('geko-layer');
  if (!layer) return;

  var G = document.getElementById('geko');
  var SH = document.getElementById('geko-shadow');
  var SAFE = document.getElementById('geko-safe');
  var ZG = document.getElementById('zg');
  var CLMP = document.getElementById('cl-mp');
  var SV = G.querySelector('svg');
  var main = document.querySelector('.dash-main');

  var cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, k) { return a + (b - a) * Math.min(1, k); };
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Solo rotación + traslación: nunca escala, así la silueta no cambia */
  var P = function (e, a, x, y) {
    if (e) e.setAttribute('transform', 'translate(' + (x || 0) + ' ' + (y || 0) + ') rotate(' + (a || 0) + ' ' + e._p[0] + ' ' + e._p[1] + ')');
  };
  var md = function (cx, cy, w, t, b) {
    return 'M' + (cx - w) + ' ' + cy + 'Q' + cx + ' ' + (cy + t) + ' ' + (cx + w) + ' ' + cy + 'Q' + cx + ' ' + (cy + b) + ' ' + (cx - w) + ' ' + cy + 'Z';
  };

  var V = {};
  ['front', 'side', 'back', 'sleep'].forEach(function (n) {
    var el = document.getElementById('v-' + n);
    el.querySelectorAll('[data-p]').forEach(function (e) { e._p = e.dataset.p.split(' ').map(Number); });
    var p = {};
    ['tail', 'arm-l', 'arm-r', 'leg-l', 'leg-r'].forEach(function (k) { p[k] = el.querySelector('.' + k); });
    V[n] = {
      el: el, p: p,
      lids: [].slice.call(el.querySelectorAll('.lid')),
      pupils: [].slice.call(el.querySelectorAll('.pupil')),
      m: el.querySelector('.m'), tn: el.querySelector('.tn')
    };
  });

  var GAP = 10;                    /* separación mínima con las tarjetas */
  var CORNER_X = 14, CORNER_Y = 10; /* margen de la esquina en el teléfono */
  var Wd = 0, Ht = 0, W = 0, H = 0, hw = 0, vis = 0, SPD = 120;
  var mode = 'side';               /* 'side' = camina por los márgenes · 'corner' = quieta en la esquina */
  var wallL = 0, wallR = 0;
  var x = null, y = 0;
  var dir = 'down', view = 'front', flip = 1;
  var phase = 0, walkK = 0, hk = 0, happy = 0, idle = 1, sst = 0, sT = 0, slp = 25, aw = 0;
  var nsl = 20 + Math.random() * 10, wt = 2, t = 0, nb = 2, b0 = -9, ex = 0.8;
  var route = null;                /* { d: 'left'|'right'|'up'|'down', rem: px por recorrer } */
  var ptr = { x: 0, y: 0 };
  var last = performance.now();

  /* ---------- Geometría ---------- */
  function layout() {
    Wd = layer.clientWidth;
    Ht = layer.clientHeight;

    /* Borde izquierdo/derecho real del contenido */
    var l = Infinity, r = -Infinity;
    if (main) {
      main.querySelectorAll('.card, .dash-title, .subtitle').forEach(function (e) {
        var b = e.getBoundingClientRect();
        if (b.width) { l = Math.min(l, b.left); r = Math.max(r, b.right); }
      });
    }
    if (!isFinite(l)) { l = Wd / 2; r = Wd / 2; }

    var laneMin = Math.min(l - GAP, Wd - r - GAP);
    var next = laneMin >= 110 ? 'side' : 'corner';

    if (next === 'side') W = cl(Math.min(laneMin / 0.8, Ht * 0.3, 170), 96, 170);
    else W = cl(Wd * 0.23, 76, 116);
    H = W * 1.2;
    hw = W * 0.36;                 /* media anchura del cuerpo (colisión) */
    vis = W * 0.5;                 /* media anchura visible (para salir de pantalla) */
    SPD = cl(W * 0.8, 80, 140);
    wallL = l - GAP;
    wallR = r + GAP;

    G.style.width = W + 'px';
    G.style.height = H + 'px';
    SH.style.width = W * 0.5 + 'px';

    var firstTime = x === null;
    mode = next;
    document.body.classList.toggle('geko-corner', mode === 'corner');

    if (mode === 'corner') {
      /* Teléfono: quieta en la esquina inferior derecha, mirando al frente.
         #geko-safe es una sonda invisible que mide el safe-area inferior,
         para que la mascota no quede bajo el gesto del sistema. */
      var inset = SAFE ? SAFE.getBoundingClientRect().height : 0;
      x = Wd - CORNER_X - W / 2;
      y = Ht - CORNER_Y - inset;
      dir = 'down';
      route = null;
    } else {
      if (firstTime) {
        /* Empieza en el margen más ancho */
        x = (l >= Wd - r) ? wallL / 2 : (wallR + Wd) / 2;
        y = Ht * 0.62;
      }
      /* Si el muro se movió encima de Geko, lo deja en el margen más cercano */
      if (x + hw > wallL && x - hw < wallR) {
        x = x < (wallL + wallR) / 2 ? wallL - hw : wallR + hw;
      }
    }
  }

  var onScreen = function () {
    if (mode === 'corner') return true;       /* quieta y siempre entera a la vista */
    return x - vis >= 2 && x + vis <= Wd - 2 && y - H >= 2 && y <= Ht - 2;
  };

  /* Distancia que puede avanzar antes de chocar. Infinity = da la vuelta y reaparece. */
  function room(d) {
    if (mode === 'corner') return 0;          /* en el teléfono no camina */
    if (d === 'up' || d === 'down') return Infinity;
    var left = x < (wallL + wallR) / 2;
    if (d === 'left') return left ? Infinity : Math.max(0, x - hw - wallR);
    return left ? Math.max(0, wallL - hw - x) : Infinity;
  }

  function wrap() {
    if (mode === 'corner') return;
    if (x + vis < 0) x = Wd + vis;
    else if (x - vis > Wd) x = -vis;
    if (y - H > Ht) y = 0;
    else if (y < 0) y = Ht + H;
  }

  /* ---------- Sueño ---------- */
  /* sst: 0 despierto · 1 con sueño (cierra los ojos) · 2 dormido */
  function wake() { sst = 0; aw = 0; idle = 0; nsl = 20 + Math.random() * 10; }
  function doze() { if (!sst) { sst = 1; sT = 0; route = null; dir = 'down'; } }

  /* ---------- Entrada: solo clic en Geko ---------- */
  function poke() {
    var estabaDormido = sst > 0;
    wake();
    happy = 1.5;
    if (onScreen()) route = null;  /* si está cruzando el borde, termina de cruzar */
    dir = 'down';
    idle = 0;
    window.dispatchEvent(new CustomEvent('geko:click', { detail: { estabaDormido: estabaDormido } }));
  }
  G.addEventListener('pointerdown', function (e) { e.stopPropagation(); poke(); });
  G.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); }
  });
  window.addEventListener('pointermove', function (e) { ptr = { x: e.clientX, y: e.clientY }; });

  /* ---------- Paseo autónomo (solo escritorio) ---------- */
  function startWander() {
    if (mode !== 'side') return;
    var c = [];
    ['left', 'right', 'up', 'down'].forEach(function (d) {
      var r = room(d);
      if (r < 40) return;
      c.push([d, r]);
      if (d === 'up' || d === 'down') c.push([d, r]);   /* más peso a caminar por el lateral */
    });
    if (c.length) {
      var pick = c[Math.random() * c.length | 0];
      var vert = pick[0] === 'up' || pick[0] === 'down';
      var dist = vert ? 220 + Math.random() * 520 : 160 + Math.random() * 260;
      route = { d: pick[0], rem: Math.min(pick[1], dist) };
    }
    wt = 2 + Math.random() * 3;
    idle = 0;
  }

  /* ---------- Bucle ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.033, (now - last) / 1e3);
    last = now;
    t += dt;

    if (sst === 1) { sT += dt; if (sT > 1.5) { sst = 2; sT = 0; slp = 20 + Math.random() * 10; } }
    else if (sst === 2) { sT += dt; if (sT > slp) wake(); }
    if (!sst && !happy) aw += dt;
    if (!sst && aw > nsl && !route && onScreen()) doze();

    var moved = false;
    if (sst) { route = null; dir = 'down'; }
    else if (route) {
      var mv = SPD * dt, m = Math.min(mv, room(route.d));
      if (m <= 0.01) route = null;                 /* chocó con el contenido */
      else {
        if (route.d === 'left') x -= m;
        else if (route.d === 'right') x += m;
        else if (route.d === 'up') y -= m;
        else y += m;
        wrap();
        route.rem -= mv;
        dir = route.d; moved = true; idle = 0; happy = 0;
        /* No se detiene hasta estar completamente a la vista */
        if ((route.rem <= 0 && onScreen()) || route.rem < -4000) route = null;
      }
    }
    if (!moved) {
      idle += dt;
      if (idle > 1.2 && !route) dir = 'down';
      if (mode === 'side' && !RM && !sst && !route && idle > wt && !happy) startWander();
    }

    /* Vista según la dirección: arriba = espalda, abajo = frente, lados = perfil */
    var want = sst === 2 ? 'sleep' : sst === 1 ? 'front' : (dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side');
    if (want !== view) {
      var z = want === 'sleep' || view === 'sleep';
      view = want;
      for (var k in V) V[k].el.classList.toggle('on', k === view);
      if (z && !RM) SV.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 280 });
    }
    if (dir === 'left') flip = -1; else if (dir === 'right') flip = 1;
    SV.style.transform = view === 'side' && flip < 0 ? 'scaleX(-1)' : '';
    happy = Math.max(0, happy - dt);
    for (var kk in V) V[kk].el.classList.toggle('happy', happy > 0 && kk === view);

    var pv = V[view], p = pv.p;

    /* Parpadeo y mirada (sigue el puntero por toda la ventana) */
    if (t > nb) { b0 = t; nb = t + 2 + Math.random() * 3.5; }
    var bk = (t - b0) / 0.17;
    var lid = bk < 1 ? Math.sin(Math.PI * Math.max(0, bk)) : 0;
    if (sst === 1) { var q = Math.min(1, sT / 1.1); lid = Math.max(lid, q * q * (3 - 2 * q)); }
    pv.lids.forEach(function (l) { l.setAttribute('height', l.dataset.h * lid); });
    var lx = cl((ptr.x - x) / 320, -1, 1), ly = cl((ptr.y - (y - H * 0.55)) / 320, -1, 1);
    pv.pupils.forEach(function (pp) {
      var dx = view === 'side' ? cl(lx * flip * 4, -6, 2) : lx * 6;
      pp.setAttribute('transform', 'translate(' + dx + ' ' + (ly * 5) + ')');
    });
    ex = lerp(ex, happy > 0 ? 1 : moved ? 0.4 : 0.8, dt * 10);
    if (view === 'front' && pv.m) {
      var w = 20 + 8 * ex, b = 6 + 50 * ex, dd = md(150, 146, w, 2, b);
      pv.m.setAttribute('d', dd);
      CLMP.setAttribute('d', dd);
      pv.tn.setAttribute('cy', 146 + b * 0.4);
      pv.tn.setAttribute('rx', w * 0.55);
    }

    /* Caminata rígida: ciclo de extremidades, sin escalar ni deformar el cuerpo */
    walkK = lerp(walkK, moved ? 1 : 0, dt * 10);
    if (moved) phase += SPD * dt * 0.075;
    var sw = Math.sin(t * 1.3), s = Math.sin(phase), i = 1 - walkK;
    var tail = 5 * Math.sin(phase - 1) * walkK + 3 * sw * i;
    var T;
    if (view === 'side') T = { al: -20 * s * walkK + 2 * sw * i, ar: 0, ll: 24 * s * walkK, lr: -24 * s * walkK, ly: 0, ry: 0 };
    else T = { al: 9 * s * walkK + 2 * sw * i, ar: 9 * s * walkK - 2 * sw * i, ll: 0, lr: 0, ly: -9 * Math.max(0, s) * walkK, ry: -9 * Math.max(0, -s) * walkK };
    hk = lerp(hk, happy > 0 ? 1 : 0, dt * 12);
    var al = T.al * (1 - hk) + (view === 'side' ? -100 - 10 * Math.sin(t * 12) : 100 + 10 * Math.sin(t * 12)) * hk;
    var ar = T.ar * (1 - hk) + (-100 - 10 * Math.sin(t * 12 + 1)) * hk;
    P(p.tail, tail); P(p['arm-l'], al); P(p['arm-r'], ar);
    P(p['leg-l'], T.ll, 0, T.ly); P(p['leg-r'], T.lr, 0, T.ry);

    /* Posición: solo traslación; tamaño y sombra constantes */
    G.style.transform = 'translate(' + (x - W / 2) + 'px,' + (y - H) + 'px)';
    SH.style.transform = 'translate(' + (x - W * 0.25) + 'px,' + (y - H * 0.03 - 6) + 'px)';
    SH.style.opacity = view === 'sleep' ? 0 : '';
    G.classList.toggle('zz', view === 'sleep');
    if (view === 'sleep' && !RM) ZG.setAttribute('transform', 'translate(150 346) scale(.4 ' + (0.4 * (1 + 0.014 * Math.sin(t * 1.8))) + ') translate(-654 -850)');
  }

  /* ---------- Arranque ---------- */
  var pend = false;
  function relayout() {
    if (pend) return;
    pend = true;
    requestAnimationFrame(function () { pend = false; layout(); });
  }
  layout();
  ptr = { x: Wd / 2, y: Ht / 2 };
  window.addEventListener('resize', relayout);
  window.addEventListener('load', relayout);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(relayout);
    ro.observe(layer);
    if (main) ro.observe(main);
  }
  requestAnimationFrame(frame);
})();
