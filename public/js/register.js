document.addEventListener("DOMContentLoaded", function () {
  console.log("[register.js] Script cargado y DOM listo");

  var formRegister = document.getElementById("form-register");
  var errorEl = document.getElementById("auth-error");
  var successEl = document.getElementById("auth-success");

  if (!formRegister) {
    console.error("[register.js] No se encontró el formulario #form-register");
    return;
  }

  function clearMessages() {
    errorEl.textContent = "";
    successEl.textContent = "";
  }

  formRegister.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMessages();

    var nombre = document.getElementById("register-name").value.trim();
    var apellido = document.getElementById("register-lastname").value.trim();
    var nombre_usuario = document.getElementById("register-username").value.trim();
    var correo = document.getElementById("register-email").value.trim();
    var numero = document.getElementById("register-phone").value.trim();
    var contrasena = document.getElementById("register-password").value;
    var confirm = document.getElementById("register-confirm").value;

    if (!nombre || !apellido || !nombre_usuario || !correo || !numero || !contrasena || !confirm) {
      errorEl.textContent = "Completa todos los campos.";
      return;
    }
    if (contrasena !== confirm) {
      errorEl.textContent = "Las contraseñas no coinciden.";
      return;
    }
    if (contrasena.length < 6) {
      errorEl.textContent = "La contraseña debe tener al menos 6 caracteres.";
      return;
    }

    fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre, apellido: apellido, nombre_usuario: nombre_usuario, correo: correo, numero: numero, contrasena: contrasena }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          window.location.href = "/login";
        } else {
          errorEl.textContent = data.message;
        }
      })
      .catch(function () {
        errorEl.textContent = "Error de conexión con el servidor.";
      });
  });
});
