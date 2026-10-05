document.addEventListener("DOMContentLoaded", function () {
  console.log("[login.js] Script cargado y DOM listo");

  var formLogin = document.getElementById("form-login");
  var errorEl = document.getElementById("auth-error");
  var successEl = document.getElementById("auth-success");

  if (!formLogin) {
    console.error("[login.js] No se encontró el formulario #form-login");
    return;
  }

  function clearMessages() {
    errorEl.textContent = "";
    successEl.textContent = "";
  }

  formLogin.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMessages();

    var correo = document.getElementById("login-email").value.trim();
    var contrasena = document.getElementById("login-password").value;

    if (!correo || !contrasena) {
      errorEl.textContent = "Completa correo y contraseña.";
      return;
    }

    fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo: correo, contrasena: contrasena }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          window.location.href = "/profile";
        } else {
          errorEl.textContent = data.message;
        }
      })
      .catch(function () {
        errorEl.textContent = "Error de conexión con el servidor.";
      });
  });
});
