/* ===========================================
   CONFIGURACIÓN - Seguridad
   Cambio de contraseña vía POST /configuracion/seguridad.
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var btnSave = document.getElementById("btn-save");
  if (!btnSave) return; // cuenta de Google: no hay formulario

  var actual = document.getElementById("actual");
  var nueva = document.getElementById("nueva");
  var confirmacion = document.getElementById("confirmacion");

  var alertBox = document.getElementById("config-alert");
  var alertMsg = document.getElementById("config-alert-msg");

  function showAlert(mensaje, variante) {
    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", variante || "error");
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearAlert() {
    alertBox.hidden = true;
    alertMsg.textContent = "";
  }

  function setError(campo, mensaje) {
    var el = document.getElementById("err-" + campo);
    if (el) el.textContent = mensaje || "";
  }

  function clearErrors() {
    setError("actual", "");
    setError("nueva", "");
    setError("confirmacion", "");
  }

  function validate() {
    clearErrors();
    var valid = true;

    if (!actual.value) {
      setError("actual", "Ingresa tu contraseña actual.");
      valid = false;
    }
    if (nueva.value.length < 6) {
      setError("nueva", "Mínimo 6 caracteres.");
      valid = false;
    }
    if (nueva.value !== confirmacion.value) {
      setError("confirmacion", "Las contraseñas no coinciden.");
      valid = false;
    }
    if (nueva.value && nueva.value === actual.value) {
      setError("nueva", "Debe ser distinta a la actual.");
      valid = false;
    }

    return valid;
  }

  btnSave.addEventListener("click", function () {
    clearAlert();

    if (!validate()) {
      showAlert("Revisa los campos marcados antes de guardar.", "error");
      return;
    }

    btnSave.disabled = true;
    var labelOriginal = btnSave.textContent;
    btnSave.textContent = "Guardando...";

    fetch("/configuracion/seguridad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actual: actual.value,
        nueva: nueva.value,
        confirmacion: confirmacion.value,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        btnSave.disabled = false;
        btnSave.textContent = labelOriginal;

        if (result.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!result.data || !result.data.success) {
          showAlert((result.data && result.data.message) || "No pudimos cambiar tu contraseña.", "error");
          return;
        }

        actual.value = "";
        nueva.value = "";
        confirmacion.value = "";
        showAlert(result.data.message || "Contraseña actualizada correctamente.", "success");
      })
      .catch(function () {
        btnSave.disabled = false;
        btnSave.textContent = labelOriginal;
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
      });
  });
});
