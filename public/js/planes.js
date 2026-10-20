/* ===========================================
   PLANES - Activación del plan gratuito
   Envía POST /planes/gratis (JSON) y redirige al dashboard.
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var btnGratis = document.getElementById("btn-gratis");
  if (!btnGratis) return;

  var alertBox = document.getElementById("planes-alert");
  var alertMsg = document.getElementById("planes-alert-msg");

  function showAlert(mensaje, variante) {
    if (!alertBox) return;
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", variante || "error");
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

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
});
