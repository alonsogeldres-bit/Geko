document.addEventListener("DOMContentLoaded", function () {
  console.log("[complete-registration.js] Script cargado y DOM listo");

  var formCompletar = document.getElementById("form-completar");
  var alertBox = document.getElementById("auth-alert");
  var alertMsg = document.getElementById("auth-alert-msg");
  var btnCompletar = document.getElementById("btn-completar");

  if (!formCompletar) {
    console.error("[complete-registration.js] No se encontró el formulario #form-completar");
    return;
  }

  function showAlert(mensaje, variante) {
    if (!alertBox) return;
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", variante || "error");
    alertBox.hidden = false;
  }

  function clearAlert() {
    if (!alertBox) return;
    alertBox.hidden = true;
    alertMsg.textContent = "";
  }

  function setLoading(activo) {
    if (!btnCompletar) return;
    btnCompletar.disabled = activo;
    var label = btnCompletar.querySelector(".btn-label");
    if (label) {
      label.textContent = activo ? "Creando cuenta..." : "Crear mi cuenta";
    }
  }

  formCompletar.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var apellido = document.getElementById("profile-lastname").value.trim();
    var nombre_usuario = document.getElementById("profile-username").value.trim();
    var numero = document.getElementById("profile-phone").value.trim();

    if (!apellido || !nombre_usuario || !numero) {
      showAlert("Completa todos los campos.");
      return;
    }

    setLoading(true);

    fetch("/complete-registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apellido: apellido,
        nombre_usuario: nombre_usuario,
        numero: numero
      })
    })
      .then(function (res) {
        // El alta responde con redirect a /profile, no con JSON.
        // fetch sigue la redireccion, asi que un 200 aqui ya es exito.
        if (res.redirected || res.url.indexOf("/profile") !== -1) {
          return { success: true };
        }

        return res.json().then(function (data) {
          return { status: res.status, data: data };
        }, function () {
          return { status: res.status, data: null };
        });
      })
      .then(function (r) {
        if (r.success || (r.data && r.data.success)) {
          window.location.href = "/profile";
          return;
        }
        setLoading(false);
        showAlert((r.data && r.data.message) || "No pudimos crear tu cuenta.");
      })
      .catch(function () {
        setLoading(false);
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.");
      });
  });
});