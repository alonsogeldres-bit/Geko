/* ===========================================
   CONFIGURACIÓN - Mascota Geko
   Cada cambio se guarda al instante con window.GekoMascotPrefs
   (public/js/geko-mascot-prefs.js); no hay botón "Guardar" ni POST.
   La pantalla siempre se pinta a partir de las preferencias guardadas,
   así también refleja los cambios hechos en otra pestaña.
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var Prefs = window.GekoMascotPrefs;

  var alertBox = document.getElementById("config-alert");
  var alertMsg = document.getElementById("config-alert-msg");
  var status = document.getElementById("pref-status");
  var resetBtn = document.getElementById("pref-reset");
  var noteHidden = document.getElementById("pref-note-hidden");
  var noteMotion = document.getElementById("pref-note-motion");
  var areaHint = document.getElementById("pref-area-hint");

  var inputs = [].slice.call(document.querySelectorAll("[data-pref]"));
  var items = [].slice.call(document.querySelectorAll(".pref-item"));

  function showAlert(mensaje, variante) {
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", variante || "error");
    alertBox.hidden = false;
  }

  // Sin el módulo de preferencias no hay nada que guardar: se avisa y se bloquea.
  if (!Prefs) {
    showAlert("No pudimos cargar las preferencias de Geko. Recarga la página.", "error");
    inputs.forEach(function (el) { el.disabled = true; });
    items.forEach(function (item) { item.classList.add("is-disabled"); });
    resetBtn.disabled = true;
    return;
  }

  // Si el sistema pide reducir el movimiento, Geko no pasea por su cuenta.
  var reducirMovimiento = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  noteMotion.hidden = !reducirMovimiento;

  var avisoSinGuardado = false;
  function avisarSiNoSeGuarda() {
    if (Prefs.persistent() || avisoSinGuardado) return;
    avisoSinGuardado = true;
    showAlert(
      "Tu navegador no permite guardar ajustes. Los cambios valen solo mientras tengas esta pestaña abierta.",
      "error"
    );
  }

  // Mensaje breve junto al botón de restablecer ("Cambios guardados.")
  var timer = null;
  function confirmar(mensaje) {
    status.textContent = mensaje;
    status.classList.add("is-saved");
    clearTimeout(timer);
    timer = setTimeout(function () {
      status.textContent = status.getAttribute("data-default");
      status.classList.remove("is-saved");
    }, 2500);
  }

  // Dibuja toda la pantalla a partir de las preferencias.
  function render(p) {
    var oculta = !p.visible;

    inputs.forEach(function (el) {
      var clave = el.getAttribute("data-pref");

      if (el.type === "checkbox") {
        el.checked = Boolean(p[clave]);
      } else {
        el.checked = el.value === p[clave];
        var opcion = el.closest(".segmented-opt");
        if (opcion) opcion.classList.toggle("active", el.checked);
      }

      // Qué ajustes no tienen sentido ahora mismo
      var bloqueado = false;
      if (clave !== "visible" && oculta) bloqueado = true;              // Geko oculto
      if (clave === "wander" && p.area === "corner") bloqueado = true;  // quieto en la esquina
      if (clave === "speed" && (p.area === "corner" || !p.wander)) bloqueado = true;
      el.disabled = bloqueado;
    });

    // Atenúa los bloques cuyos controles están todos bloqueados
    items.forEach(function (item) {
      var controles = [].slice.call(item.querySelectorAll("[data-pref]"));
      var todosBloqueados = controles.length > 0 && controles.every(function (c) { return c.disabled; });
      item.classList.toggle("is-disabled", todosBloqueados);
    });

    // Descripción de la zona elegida
    var zona = document.querySelector('input[name="area"]:checked');
    if (zona && areaHint) areaHint.textContent = zona.getAttribute("data-hint") || "";

    noteHidden.hidden = !oculta;
    resetBtn.disabled = Prefs.isDefault();
  }

  inputs.forEach(function (el) {
    el.addEventListener("change", function () {
      var cambio = {};
      cambio[el.getAttribute("data-pref")] = el.type === "checkbox" ? el.checked : el.value;
      Prefs.set(cambio);
      avisarSiNoSeGuarda();
      confirmar("Cambios guardados.");
    });
  });

  resetBtn.addEventListener("click", function () {
    Prefs.reset();
    confirmar("Valores restablecidos.");
  });

  Prefs.subscribe(render);
  render(Prefs.get());
  avisarSiNoSeGuarda();
});
