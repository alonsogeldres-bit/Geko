document.addEventListener("DOMContentLoaded", function () {
  var formReset = document.getElementById("form-reset");
  var alertBox = document.getElementById("auth-alert");
  var alertMsg = document.getElementById("auth-alert-msg");
  var btnReset = document.getElementById("btn-reset");

  if (!formReset) return;

  var inputPassword = document.getElementById("reset-password");
  var inputConfirm = document.getElementById("reset-confirm");
  var token = document.getElementById("reset-token").value;

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
    if (!btnReset) return;
    btnReset.disabled = activo;
    if (activo) {
      btnReset.textContent = "Guardando...";
    } else {
      btnReset.textContent = "Guardar nueva contraseña";
    }
  }

  formReset.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var contrasena = inputPassword.value;
    var confirmacion = inputConfirm.value;

    if (!contrasena || !confirmacion) {
      showAlert("Completa ambos campos.", "error");
      return;
    }

    if (contrasena.length < 6) {
      showAlert("La contraseña debe tener al menos 6 caracteres.", "error");
      return;
    }

    if (contrasena !== confirmacion) {
      showAlert("Las contraseñas no coinciden.", "error");
      return;
    }

    setLoading(true);

    fetch("/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, contrasena: contrasena, confirmacion: confirmacion }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        setLoading(false);

        if (r.data && r.data.success) {
          showAlert(r.data.message + " Redirigiendo al inicio de sesión...", "success");
          window.location.href = "/login";
          return;
        }

        showAlert((r.data && r.data.message) || "No pudimos actualizar tu contraseña.", "error");
      })
      .catch(function () {
        setLoading(false);
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
      });
  });
});
