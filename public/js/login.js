document.addEventListener("DOMContentLoaded", function () {
  console.log("[login.js] Script cargado y DOM listo");

  var formLogin = document.getElementById("form-login");
  var alertBox = document.getElementById("auth-alert");
  var alertMsg = document.getElementById("auth-alert-msg");
  var alertActions = document.getElementById("auth-alert-actions");
  var alertRetry = document.getElementById("auth-alert-retry");
  var btnLogin = document.getElementById("btn-login");
  var ssoLinks = document.querySelectorAll("[data-sso]");

  var VARIANTES = ["error", "success", "info"];

  // ---------- Alerta ----------

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

  // ---------- Botón ocupado ----------

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

  // ---------- Errores que llegan por redirect (fallo de SSO) ----------

  // En un fallo del proveedor la contraseña no es el problema,
  // por eso aquí solo se ofrece reintentar, no recuperar contraseña.
  var ERRORES_SSO = {
    sso_no_configurado: "El acceso con Google todavía no está disponible. Inténtalo más tarde.",
    sso_denegado: "Google no autorizó el acceso a tu cuenta.",
    sso_cancelado: "Cancelaste el inicio de sesión con Google.",
    sso_error: "No pudimos completar el inicio de sesión con Google.",
    sso_estado: "La solicitud de acceso no es válida o expiró.",
    sso_correo: "Google no entregó un correo verificado para esa cuenta.",
    sso_registro: "Tu sesión de registro expiró. Vuelve a entrar con Google.",
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

  // ---------- Formulario ----------

  if (formLogin) {
    formLogin.addEventListener("submit", function (e) {
      e.preventDefault();
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
  } else {
    console.error("[login.js] No se encontró el formulario #form-login");
  }

  // ---------- SSO: redirección de página completa (OAuth) ----------

  for (var i = 0; i < ssoLinks.length; i++) {
    ssoLinks[i].addEventListener("click", function () {
      this.classList.add("is-loading");
      clearAlert();
    });
  }

  leerErrorDeUrl();
});