document.addEventListener("DOMContentLoaded", function () {
  var tabLogin = document.getElementById("tab-login");
  var tabRegister = document.getElementById("tab-register");
  var formLogin = document.getElementById("form-login");
  var formRegister = document.getElementById("form-register");
  var errorEl = document.getElementById("auth-error");
  var successEl = document.getElementById("auth-success");

  function clearMessages() {
    errorEl.textContent = "";
    successEl.textContent = "";
  }

  function showTab(tab) {
    clearMessages();
    if (tab === "login") {
      tabLogin.classList.add("active");
      tabRegister.classList.remove("active");
      formLogin.classList.remove("hidden");
      formRegister.classList.add("hidden");
    } else {
      tabRegister.classList.add("active");
      tabLogin.classList.remove("active");
      formRegister.classList.remove("hidden");
      formLogin.classList.add("hidden");
    }
  }

  tabLogin.addEventListener("click", function () { showTab("login"); });
  tabRegister.addEventListener("click", function () { showTab("register"); });

  // ---------- LOGIN ----------
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
          successEl.textContent = data.message;
          window.location.href = "/profile";
        } else {
          errorEl.textContent = data.message;
        }
      })
      .catch(function () {
        errorEl.textContent = "Error de conexión con el servidor.";
      });
  });

  // ---------- REGISTRO ----------
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
          successEl.textContent = data.message + " Ya puedes iniciar sesión.";
          showTab("login");
        } else {
          errorEl.textContent = data.message;
        }
      })
      .catch(function () {
        errorEl.textContent = "Error de conexión con el servidor.";
      });
  });
});