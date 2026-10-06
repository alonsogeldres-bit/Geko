document.addEventListener("DOMContentLoaded", function () {
  console.log("[login.js] Script cargado y DOM listo");

  var tabLogin = document.getElementById("tab-login");
  var tabRegister = document.getElementById("tab-register");
  var formLogin = document.getElementById("form-login");
  var formRegister = document.getElementById("form-register");
  var errorEl = document.getElementById("auth-error");
  var successEl = document.getElementById("auth-success");
  var acceptTerms = document.getElementById("accept-terms");
  var acceptPrivacy = document.getElementById("accept-privacy");
  var registerSubmit = document.getElementById("register-submit");
  var alertBox = document.getElementById("auth-alert");
  var alertMsg = document.getElementById("auth-alert-msg");
  var alertActions = document.getElementById("auth-alert-actions");
  var alertRetry = document.getElementById("auth-alert-retry");
  var btnLogin = document.getElementById("btn-login");
  var ssoLinks = document.querySelectorAll("[data-sso]");

  var VARIANTES = ["error", "success", "info"];

  function clearMessages() {
    if (errorEl) errorEl.textContent = "";
    if (successEl) successEl.textContent = "";
  }

  function showAlert(mensaje, variante, opciones) {
    if (!alertBox) return;

    var config = opciones || {};
    var tipo = VARIANTES.indexOf(variante) !== -1 ? variante : "error";

    alertMsg.textContent = mensaje;
    alertBox.setAttribute("data-variant", tipo);

    if (alertActions) {
      alertActions.hidden = !(config.recuperar || config.reintentar);
    }
    if (alertRetry) {
      alertRetry.hidden = !config.reintentar;
    }

    alertBox.hidden = false;
  }

  function clearAlert() {
    if (!alertBox) return;
    alertBox.hidden = true;
    alertMsg.textContent = "";
    if (alertActions) alertActions.hidden = true;
  }

  function mostrarError(mensaje) {
    showAlert(mensaje, "error", { recuperar: true, reintentar: true });
  }

  function setLoading(activo) {
    if (btnLogin) btnLogin.disabled = activo;
    if (activo && btnLogin) {
      var label = btnLogin.querySelector(".btn-label");
      if (label) label.textContent = "Verificando...";
    } else if (btnLogin) {
      var texto = btnLogin.querySelector(".btn-label");
      if (texto) texto.textContent = "Iniciar sesión";
    }
  }

  function showTab(tab) {
    clearMessages();
    clearAlert();

    if (tab === "login") {
      if (tabLogin) tabLogin.classList.add("active");
      if (tabRegister) tabRegister.classList.remove("active");
      if (formLogin) formLogin.classList.remove("hidden");
      if (formRegister) formRegister.classList.add("hidden");
    } else {
      if (tabRegister) tabRegister.classList.add("active");
      if (tabLogin) tabLogin.classList.remove("active");
      if (formRegister) formRegister.classList.remove("hidden");
      if (formLogin) formLogin.classList.add("hidden");
    }
  }

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", function () { showTab("login"); });
    tabRegister.addEventListener("click", function () { showTab("register"); });
  }

  if (acceptTerms && registerSubmit) {
    acceptTerms.addEventListener("change", function () {
      registerSubmit.disabled = !acceptTerms.checked;
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", function (e) {
      e.preventDefault();
      clearMessages();
      clearAlert();

      var correo = document.getElementById("login-email").value.trim();
      var contrasena = document.getElementById("login-password").value;

      if (!correo || !contrasena) {
        mostrarError("Completa tu correo y tu contraseña.");
        return;
      }

      setLoading(true);

      fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: correo, contrasena: contrasena }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { status: res.status, data: data };
          });
        })
        .then(function (r) {
          if (r.data && r.data.success) {
            if (successEl) {
              successEl.textContent = r.data.message;
            }
            window.location.href = "/profile";
            return;
          }

          setLoading(false);
          mostrarError((r.data && r.data.message) || "Correo o contraseña incorrectos.");
        })
        .catch(function () {
          setLoading(false);
          mostrarError("Error de conexión con el servidor. Inténtalo de nuevo.");
        });
    });
  }

  if (formRegister) {
    formRegister.addEventListener("submit", function (e) {
      e.preventDefault();
      clearMessages();
      clearAlert();

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
      if (acceptTerms && !acceptTerms.checked) {
        errorEl.textContent = "Debes aceptar los Términos y Condiciones.";
        return;
      }

      fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre,
          apellido: apellido,
          nombre_usuario: nombre_usuario,
          correo: correo,
          numero: numero,
          contrasena: contrasena,
          acepta_terminos: acceptTerms ? acceptTerms.checked : true,
          acepta_privacidad: acceptPrivacy ? acceptPrivacy.checked : false
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success) {
            if (successEl) {
              successEl.textContent = data.message + " Ya puedes iniciar sesión.";
            }
            formRegister.reset();
            if (registerSubmit) registerSubmit.disabled = true;
            showTab("login");
          } else if (errorEl) {
            errorEl.textContent = data.message;
          }
        })
        .catch(function () {
          if (errorEl) {
            errorEl.textContent = "Error de conexión con el servidor.";
          }
        });
    });
  }

  for (var i = 0; i < ssoLinks.length; i++) {
    ssoLinks[i].addEventListener("click", function () {
      this.classList.add("is-loading");
      clearAlert();
    });
  }

  var ERRORES_SSO = {
    sso_not_configured: "El acceso con Google todavía no está disponible. Inténtalo más tarde.",
    sso_denied: "Google no autorizó el acceso a tu cuenta.",
    sso_cancelled: "Cancelaste el inicio de sesión con Google.",
    sso_error: "No pudimos completar el inicio de sesión con Google.",
    sso_state: "La solicitud de acceso no es válida o expiró.",
    sso_email: "Google no entregó un correo verificado para esa cuenta.",
    sso_registration: "Tu sesión de registro expiró. Vuelve a entrar con Google."
  };

  function leerErrorDeUrl() {
    var params = new URLSearchParams(window.location.search);
    var error = params.get("error");
    if (!error) return;

    showAlert(
      ERRORES_SSO[error] || "Ocurrió un problema al iniciar sesión.",
      "error",
      { reintentar: true }
    );

    window.history.replaceState({}, "", window.location.pathname);
  }

  leerErrorDeUrl();
});
