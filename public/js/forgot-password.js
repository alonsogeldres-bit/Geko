document.addEventListener("DOMContentLoaded", function () {
  var formForgot = document.getElementById("form-forgot");
  var alertBox = document.getElementById("auth-alert");
  var alertMsg = document.getElementById("auth-alert-msg");
  var btnForgot = document.getElementById("btn-forgot");
  var inputEmail = document.getElementById("forgot-email");

  function showAlert(mensaje, variante) {
    if (!alertBox) return;
    var tipo = variante === "success" ? "success" : variante === "info" ? "info" : "error";
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", tipo);
    alertBox.hidden = false;
  }

  function clearAlert() {
    if (!alertBox) return;
    alertBox.hidden = true;
    alertMsg.textContent = "";
  }

  function setLoading(activo) {
    if (!btnForgot) return;
    btnForgot.disabled = activo;
    if (activo) {
      btnForgot.textContent = "Enviando...";
    } else {
      btnForgot.textContent = "Enviar enlace de recuperación";
    }
  }

  if (!formForgot) {
    console.error("[forgot-password.js] No se encontró el formulario #form-forgot");
    return;
  }

  formForgot.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var correo = inputEmail.value.trim();

    if (!correo) {
      showAlert("Ingresa tu correo electrónico.", "error");
      return;
    }

    setLoading(true);

    fetch("/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo: correo }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        setLoading(false);

        if (r.data && r.data.success) {
          // El mensaje es el mismo exista o no la cuenta, por seguridad.
          showAlert(r.data.message, "success");
          formForgot.reset();
          return;
        }

        showAlert((r.data && r.data.message) || "Ocurrió un problema al enviar el correo.", "error");
      })
      .catch(function () {
        setLoading(false);
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
      });
  });
});
