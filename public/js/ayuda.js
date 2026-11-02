/* ===========================================
   AYUDA - Interacciones del centro de ayuda
   - Buscador y filtros por tema (sin recargar).
   - Abrir / cerrar todas las preguntas.
   - Copiar el correo de soporte.
   =========================================== */
(function () {
  'use strict';

  var searchInput = document.getElementById('ayuda-search');
  var searchClear = document.getElementById('ayuda-search-clear');
  var results = document.getElementById('ayuda-results');
  var empty = document.getElementById('ayuda-empty');
  var faqWrap = document.getElementById('ayuda-faq');
  var toggleAll = document.getElementById('ayuda-toggle-all');
  var filters = Array.prototype.slice.call(document.querySelectorAll('[data-help-filter]'));
  var faqs = Array.prototype.slice.call(document.querySelectorAll('.ayuda-faq[data-help-item]'));
  var cats = Array.prototype.slice.call(document.querySelectorAll('.ayuda-cat[data-help-cat]'));
  var quickCards = Array.prototype.slice.call(document.querySelectorAll('#ayuda-quick .ayuda-quick-card'));

  var activeCat = 'all';

  /** Minúsculas y sin tildes, para que "rutina" encuentre "Rutina". */
  function normalizar(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function visibleFaqs() {
    return faqs.filter(function (el) { return !el.hidden; });
  }

  function actualizarBotonTodas() {
    if (!toggleAll) return;
    var visibles = visibleFaqs();
    var todasAbiertas = visibles.length > 0 && visibles.every(function (el) { return el.open; });
    toggleAll.textContent = todasAbiertas ? 'Cerrar todas' : 'Abrir todas';
    toggleAll.disabled = visibles.length === 0;
  }

  function aplicarFiltros() {
    var consulta = normalizar(searchInput ? searchInput.value.trim() : '');
    var visibles = 0;

    faqs.forEach(function (el) {
      var coincideTexto = !consulta || normalizar(el.textContent).indexOf(consulta) !== -1;
      var coincideCategoria = activeCat === 'all' || el.getAttribute('data-cat') === activeCat;
      var mostrar = coincideTexto && coincideCategoria;

      el.hidden = !mostrar;
      if (mostrar) visibles += 1;
    });

    // Oculta las categorías que se quedaron sin preguntas.
    cats.forEach(function (cat) {
      var hayVisibles = cat.querySelectorAll('.ayuda-faq[data-help-item]:not([hidden])').length > 0;
      cat.hidden = !hayVisibles;
    });

    // El buscador también filtra los accesos rápidos.
    quickCards.forEach(function (card) {
      card.hidden = Boolean(consulta && normalizar(card.textContent).indexOf(consulta) === -1);
    });

    if (searchClear) searchClear.hidden = !consulta;

    if (empty) empty.hidden = visibles > 0;

    if (results) {
      if (consulta) {
        results.textContent = visibles + (visibles === 1 ? ' resultado' : ' resultados') +
          ' para «' + searchInput.value.trim() + '»';
      } else {
        var filtroActivo = filters.filter(function (btn) {
          return btn.getAttribute('aria-pressed') === 'true' && btn.getAttribute('data-help-filter') !== 'all';
        })[0];
        results.textContent = filtroActivo
          ? 'Mostrando ' + visibles + ' preguntas de ' + filtroActivo.textContent.trim().toLowerCase()
          : visibles + ' preguntas disponibles';
      }
    }

    actualizarBotonTodas();
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeCat = btn.getAttribute('data-help-filter') || 'all';
      filters.forEach(function (otro) {
        otro.setAttribute('aria-pressed', otro === btn ? 'true' : 'false');
      });
      aplicarFiltros();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', aplicarFiltros);
    searchInput.addEventListener('search', aplicarFiltros);
  }

  if (searchClear) {
    searchClear.addEventListener('click', function () {
      if (!searchInput) return;
      searchInput.value = '';
      searchInput.focus();
      aplicarFiltros();
    });
  }

  if (toggleAll) {
    toggleAll.addEventListener('click', function () {
      var visibles = visibleFaqs();
      var todasAbiertas = visibles.length > 0 && visibles.every(function (el) { return el.open; });
      visibles.forEach(function (el) { el.open = !todasAbiertas; });
      actualizarBotonTodas();
    });
  }

  if (faqWrap) {
    // El evento toggle no burbujea: se escucha en fase de captura.
    faqWrap.addEventListener('toggle', actualizarBotonTodas, true);
  }

  /* ---------- Copiar el correo de soporte ---------- */

  function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }

    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();

      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) resolve();
        else reject(new Error('No se pudo copiar'));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }

  Array.prototype.slice.call(document.querySelectorAll('[data-copy]')).forEach(function (btn) {
    var label = btn.querySelector('span');
    var textoOriginal = label ? label.textContent : 'Copiar correo';
    var temporizador = null;

    btn.addEventListener('click', function () {
      var texto = btn.getAttribute('data-copy') || '';

      copiarTexto(texto).then(function () {
        if (!label) return;
        label.textContent = 'Correo copiado';
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
          label.textContent = textoOriginal;
        }, 2200);
      }).catch(function () {
        if (!label) return;
        label.textContent = 'No se pudo copiar';
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
          label.textContent = textoOriginal;
        }, 2600);
      });
    });
  });

  // Estado inicial: cuenta las preguntas y deja el botón "Abrir todas" listo.
  aplicarFiltros();
})();
