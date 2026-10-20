/* ===========================================
   PLANES - Plan Gratis, Paywall Premium y
   estados de retorno del pago (?pago=...).
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var alertBox = document.getElementById("planes-alert");
  var alertMsg = document.getElementById("planes-alert-msg");

  function showAlert(mensaje, variante) {
    if (!alertBox) return;
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", variante || "error");
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- Resultado del pago al volver de Mercado Pago ---------- */

  var params = new URLSearchParams(window.location.search);
  var estadoPago = params.get("pago");
  if (estadoPago) {
    var mensajesPago = {
      aprobado: ["¡Pago aprobado! Tu plan Premium ya está activo.", "success"],
      rechazado: ["El pago fue rechazado. Puedes intentarlo de nuevo.", "error"],
      cancelado: ["Pago cancelado. No se realizó ningún cobro.", "error"],
      pendiente: ["Tu pago está en revisión. Te avisaremos cuando se confirme.", "success"],
      reembolsado: ["El pago fue reembolsado. Contacta a soporte si tienes dudas.", "error"],
      error: ["No pudimos verificar tu pago. Si realizaste el cobro, contáctanos.", "error"],
    };
    var infoPago = mensajesPago[estadoPago];
    if (infoPago) showAlert(infoPago[0], infoPago[1]);
    // Limpia la URL para que F5 no repita la notificación.
    window.history.replaceState({}, "", window.location.pathname);
  }

  /* ---------- Plan Gratuito ---------- */

  var btnGratis = document.getElementById("btn-gratis");
  if (btnGratis) {
    btnGratis.addEventListener("click", function () {
      btnGratis.disabled = true;
      var labelOriginal = btnGratis.textContent;
      btnGratis.textContent = "Activando...";

      fetch("/planes/gratis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(function (res) {
          return res.json().then(
            function (data) { return { status: res.status, data: data }; },
            function () { return { status: res.status, data: null }; }
          );
        })
        .then(function (result) {
          if (result.status === 401) {
            window.location.href = "/login";
            return;
          }

          if (!result.data || !result.data.success) {
            btnGratis.disabled = false;
            btnGratis.textContent = labelOriginal;
            showAlert(
              (result.data && result.data.message) || "No pudimos activar tu plan.",
              "error"
            );
            return;
          }

          window.location.href = result.data.redirect || "/dashboard";
        })
        .catch(function () {
          btnGratis.disabled = false;
          btnGratis.textContent = labelOriginal;
          showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
        });
    });
  }

  /* ---------- Paywall Premium ---------- */

  var btnPremium = document.getElementById("btn-premium");
  var modal = document.getElementById("paywall-modal");
  if (!btnPremium || !modal) return;

  var btnCerrar = document.getElementById("paywall-close");
  var btnConfirmar = document.getElementById("paywall-confirm");
  var paywallAlert = document.getElementById("paywall-alert");
  var paywallMsg = document.getElementById("paywall-alert-msg");
  var nombreEl = document.getElementById("paywall-plan-nombre");
  var precioEl = document.getElementById("paywall-plan-precio");

  function showPaywallAlert(mensaje) {
    if (!paywallAlert) return;
    paywallMsg.textContent = mensaje;
    paywallAlert.hidden = false;
  }

  function hidePaywallAlert() {
    if (paywallAlert) paywallAlert.hidden = true;
  }

  function abrirModal() {
    nombreEl.textContent = btnPremium.dataset.planNombre || "Premium";
    precioEl.textContent = btnPremium.dataset.planPrecio || "";
    hidePaywallAlert();
    modal.hidden = false;
    document.body.classList.add("paywall-abierto");
    btnConfirmar.focus();
  }

  function cerrarModal() {
    modal.hidden = true;
    document.body.classList.remove("paywall-abierto");
    btnPremium.focus();
  }

  function setProcesando(activo) {
    btnConfirmar.disabled = activo;
    if (activo) {
      btnConfirmar.dataset.label = btnConfirmar.textContent;
      btnConfirmar.textContent = "Procesando...";
      btnConfirmar.classList.add("is-loading");
    } else {
      btnConfirmar.textContent = btnConfirmar.dataset.label || "Confirmar suscripción";
      btnConfirmar.classList.remove("is-loading");
    }
  }

  btnPremium.addEventListener("click", abrirModal);
  btnCerrar.addEventListener("click", cerrarModal);

  modal.addEventListener("click", function (evento) {
    if (evento.target === modal) cerrarModal();
  });

  document.addEventListener("keydown", function (evento) {
    if (evento.key === "Escape" && !modal.hidden) cerrarModal();
  });

  btnConfirmar.addEventListener("click", function () {
    setProcesando(true);
    hidePaywallAlert();

    fetch("/planes/premium", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ idPlan: Number(btnPremium.dataset.planId) }),
    })
      .then(function (res) {
        return res.json().then(
          function (data) { return { status: res.status, data: data }; },
          function () { return { status: res.status, data: null }; }
        );
      })
      .then(function (result) {
        setProcesando(false);

        if (result.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (!result.data || !result.data.success) {
          var mensaje = (result.data && result.data.message) || "No pudimos iniciar el pago.";
          // Errores que afectan a la página completa (perfil incompleto,
          // suscripción ya activa): se cierra el modal y se usa la alerta general.
          if (result.data && result.data.redirect) {
            cerrarModal();
            showAlert(mensaje, "error");
            return;
          }
          showPaywallAlert(mensaje);
          return;
        }

        // Éxito: la pasarela de Mercado Pago se abre en la misma pestaña.
        if (result.data.initPoint) {
          btnConfirmar.textContent = "Redirigiendo a Mercado Pago...";
          btnConfirmar.disabled = true;
          window.location.href = result.data.initPoint;
          return;
        }

        showPaywallAlert("No pudimos generar el enlace de pago. Inténtalo de nuevo.");
      })
      .catch(function () {
        setProcesando(false);
        showPaywallAlert("Error de conexión con el servidor. Inténtalo de nuevo.");
      });
  });
});
