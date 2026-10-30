/* ===========================================
   CONFIGURACIÓN - Datos personales
   Valida en el navegador y guarda vía
   POST /configuracion/datos (JSON).
   El servidor vuelve a validar todo.
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var inicial = window.__CUENTA__ || {};

  var inputs = {
    nombre: document.getElementById("nombre"),
    apellido: document.getElementById("apellido"),
    nombre_usuario: document.getElementById("nombre_usuario"),
    correo: document.getElementById("correo"),
    numero: document.getElementById("numero"),
    fecha_nacimiento: document.getElementById("fecha_nacimiento"),
  };

  var btnSave = document.getElementById("btn-save");
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
    Object.keys(inputs).forEach(function (campo) {
      setError(campo, "");
    });
  }

  function hoyString() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function validate() {
    clearErrors();
    var valid = true;

    var nombre = inputs.nombre.value.trim();
    if (nombre.length < 2 || nombre.length > 50) {
      setError("nombre", "Entre 2 y 50 caracteres.");
      valid = false;
    }

    var apellido = inputs.apellido.value.trim();
    if (!apellido || apellido.length > 50) {
      setError("apellido", "Ingresa tu apellido (máximo 50 caracteres).");
      valid = false;
    }

    var usuario = inputs.nombre_usuario.value.trim();
    if (usuario.length < 3 || usuario.length > 50) {
      setError("nombre_usuario", "Entre 3 y 50 caracteres.");
      valid = false;
    }

    if (inicial.esLocal) {
      var correo = inputs.correo.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        setError("correo", "El correo no tiene un formato válido.");
        valid = false;
      }
    }

    var numero = inputs.numero.value.trim();
    if (!/^[\d\s+]{8,20}$/.test(numero)) {
      setError("numero", "El número de teléfono no es válido.");
      valid = false;
    }

    var fecha = inputs.fecha_nacimiento.value;
    if (!fecha || fecha > hoyString() || fecha < "1900-01-01") {
      setError("fecha_nacimiento", "Ingresa una fecha de nacimiento válida.");
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

    var payload = {
      nombre: inputs.nombre.value.trim(),
      apellido: inputs.apellido.value.trim(),
      nombre_usuario: inputs.nombre_usuario.value.trim(),
      correo: inicial.esLocal ? inputs.correo.value.trim() : inicial.correo,
      numero: inputs.numero.value.trim(),
      fecha_nacimiento: inputs.fecha_nacimiento.value,
    };

    btnSave.disabled = true;
    var labelOriginal = btnSave.textContent;
    btnSave.textContent = "Guardando...";

    fetch("/configuracion/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
          showAlert((result.data && result.data.message) || "No pudimos guardar tus datos.", "error");
          return;
        }

        // Estado local actualizado con lo que se guardó.
        inicial = Object.assign({}, inicial, payload);
        window.__CUENTA__ = inicial;
        showAlert(result.data.message || "Datos actualizados correctamente.", "success");
      })
      .catch(function () {
        btnSave.disabled = false;
        btnSave.textContent = labelOriginal;
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
      });
  });
});
