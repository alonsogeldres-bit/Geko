/* ===========================================
   CONFIGURACION - Perfil de entrenamiento
   Sección /configuracion/entrenamiento.
   Carga el estado inicial desde window.__PERFIL__
   (lo embebe la vista) y guarda vía POST /profile,
   el mismo endpoint del wizard.
   =========================================== */

document.addEventListener("DOMContentLoaded", function () {
  var inicial = window.__PERFIL__ || {};

  // ---------- Estado del formulario (copia del perfil guardado) ----------
  var state = {
    sex: inicial.sex || "masculino",
    heightCm: inicial.heightCm != null ? String(inicial.heightCm) : "",
    weightKg: inicial.weightKg != null ? String(inicial.weightKg) : "",
    level: inicial.level || "principiante",
    goals: Array.isArray(inicial.goals) ? inicial.goals.slice() : [],
    injuries: Array.isArray(inicial.injuries) && inicial.injuries.length
      ? inicial.injuries.slice()
      : ["Ninguna"],
    injuriesText: inicial.injuriesText || "",
    hasSurgeries: Array.isArray(inicial.surgeries) && inicial.surgeries.length ? "si" : "no",
    surgeries: Array.isArray(inicial.surgeries)
      ? inicial.surgeries.map(function (s) {
          return {
            descripcion: s.descripcion || "",
            fecha: s.fecha || "",
            observaciones: s.observaciones || "",
          };
        })
      : [],
    environment: inicial.environment || "gimnasio",
    equipment: Array.isArray(inicial.equipment) && inicial.equipment.length
      ? inicial.equipment.slice()
      : ["Ninguno"],
    days: Array.isArray(inicial.days) ? inicial.days.slice() : [],
    minutesPerSession: String(inicial.minutesPerSession || 45),
  };

  // ---------- Helpers de selección (mismos del wizard) ----------
  function setupSingleSelect(groupSelector, stateKey) {
    var group = document.querySelector('[data-group="' + groupSelector + '"]');
    if (!group) return;
    var buttons = group.querySelectorAll("button");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.getAttribute("data-value");
        buttons.forEach(function (b) {
          b.classList.remove("active", "level-option-active", "chip-active");
        });
        if (btn.classList.contains("segmented-opt")) btn.classList.add("active");
        if (btn.classList.contains("level-option")) btn.classList.add("level-option-active");
        if (btn.classList.contains("chip")) btn.classList.add("chip-active");
      });
    });
  }

  function setupMultiSelect(groupSelector, stateKey, exclusiveValue) {
    var group = document.querySelector('[data-group="' + groupSelector + '"]');
    if (!group) return;
    var buttons = group.querySelectorAll("button");

    function applyExclusive() {
      if (!exclusiveValue) return;
      var exclusiveOn = state[stateKey].indexOf(exclusiveValue) !== -1;
      buttons.forEach(function (b) {
        if (b.getAttribute("data-value") !== exclusiveValue) {
          b.disabled = exclusiveOn;
          b.classList.toggle("chip-disabled", exclusiveOn);
        }
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = btn.getAttribute("data-value");
        var idx = state[stateKey].indexOf(value);

        if (idx === -1) {
          if (exclusiveValue && value === exclusiveValue) {
            state[stateKey] = [exclusiveValue];
            buttons.forEach(function (b) {
              b.classList.toggle("chip-active", b === btn);
            });
          } else {
            state[stateKey].push(value);
            btn.classList.add("chip-active");
          }
        } else {
          state[stateKey].splice(idx, 1);
          btn.classList.remove("chip-active");
        }

        applyExclusive();
      });
    });
  }

  // Días de entrenamiento: selección múltiple, cada clic activa/desactiva el día.
  // Se guardan por nombre ("Lunes", "Jueves"...), igual que en el wizard (/profile).
  function setupDays() {
    var group = document.querySelector('[data-group="days"]');
    if (!group) return;
    var buttons = group.querySelectorAll("button");

    function paint(btn) {
      var on = state.days.indexOf(btn.getAttribute("data-value")) !== -1;
      btn.classList.toggle("active", on);
    }

    buttons.forEach(function (btn) {
      paint(btn); // estado inicial (los días que ya venían guardados)
      btn.addEventListener("click", function () {
        var value = btn.getAttribute("data-value");
        var idx = state.days.indexOf(value);
        if (idx === -1) state.days.push(value);
        else state.days.splice(idx, 1);
        paint(btn);
        var err = document.getElementById("err-days");
        if (err) err.textContent = "";
      });
    });
  }

  setupSingleSelect("sex", "sex");
  setupSingleSelect("level", "level");
  setupSingleSelect("environment", "environment");
  setupDays();
  setupSingleSelect("minutesPerSession", "minutesPerSession");
  setupMultiSelect("goals", "goals");
  setupMultiSelect("injuries", "injuries", "Ninguna");
  setupMultiSelect("equipment", "equipment", "Ninguno");

  // ---------- Pintado inicial del estado guardado ----------
  function marcarSeleccionado(groupSelector, valor) {
    var group = document.querySelector('[data-group="' + groupSelector + '"]');
    if (!group) return;
    group.querySelectorAll("button").forEach(function (b) {
      var activo = b.getAttribute("data-value") === String(valor);
      b.classList.toggle("active", activo && b.classList.contains("segmented-opt"));
      b.classList.toggle("level-option-active", activo && b.classList.contains("level-option"));
      b.classList.toggle("chip-active", activo && b.classList.contains("chip"));
    });
  }

  function marcarMulti(groupSelector, valores) {
    var group = document.querySelector('[data-group="' + groupSelector + '"]');
    if (!group) return;
    group.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("chip-active", valores.indexOf(b.getAttribute("data-value")) !== -1);
    });
  }

  marcarSeleccionado("sex", state.sex);
  marcarSeleccionado("level", state.level);
  marcarSeleccionado("environment", state.environment);
  marcarSeleccionado("minutesPerSession", state.minutesPerSession);
  marcarMulti("goals", state.goals);
  marcarMulti("injuries", state.injuries);
  marcarMulti("equipment", state.equipment);

  // "Ninguna"/"Ninguno" bloquean el resto de los chips (igual que en el wizard)
  var grupoInjuries = document.querySelector('[data-group="injuries"]');
  if (grupoInjuries && state.injuries.indexOf("Ninguna") !== -1) {
    grupoInjuries.querySelectorAll("button").forEach(function (b) {
      if (b.getAttribute("data-value") !== "Ninguna") {
        b.disabled = true;
        b.classList.add("chip-disabled");
      }
    });
  }
  var grupoEquipment = document.querySelector('[data-group="equipment"]');
  if (grupoEquipment && state.equipment.indexOf("Ninguno") !== -1) {
    grupoEquipment.querySelectorAll("button").forEach(function (b) {
      if (b.getAttribute("data-value") !== "Ninguno") {
        b.disabled = true;
        b.classList.add("chip-disabled");
      }
    });
  }

  // ---------- Inputs ----------
  var heightInput = document.getElementById("height");
  var weightInput = document.getElementById("weight");
  var injuriesTextInput = document.getElementById("injuries-text");

  heightInput.value = state.heightCm;
  weightInput.value = state.weightKg;
  injuriesTextInput.value = state.injuriesText;

  heightInput.addEventListener("input", function () { state.heightCm = heightInput.value; });
  weightInput.addEventListener("input", function () { state.weightKg = weightInput.value; });
  injuriesTextInput.addEventListener("input", function () { state.injuriesText = injuriesTextInput.value; });

  // ---------- Cirugías (mismo comportamiento que el wizard) ----------
  var MAX_SURGERIES = 10;
  var surgeriesBox = document.getElementById("surgeries-box");
  var surgeriesList = document.getElementById("surgeries-list");
  var btnAddSurgery = document.getElementById("btn-add-surgery");

  function todayString() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function makeField(labelText, control, errId) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var label = document.createElement("label");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(control);
    var err = document.createElement("span");
    err.className = "field-error";
    err.id = errId;
    wrap.appendChild(err);
    return wrap;
  }

  function renderSurgeries() {
    surgeriesList.innerHTML = "";

    state.surgeries.forEach(function (surgery, i) {
      var card = document.createElement("div");
      card.className = "surgery-card";

      var head = document.createElement("div");
      head.className = "surgery-card-head";
      var title = document.createElement("span");
      title.className = "surgery-card-title";
      title.textContent = "Cirugía " + (i + 1);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "surgery-remove";
      remove.textContent = "Quitar";
      remove.addEventListener("click", function () {
        state.surgeries.splice(i, 1);
        if (state.surgeries.length === 0) {
          setHasSurgeries("no");
        } else {
          renderSurgeries();
        }
      });
      head.appendChild(title);
      head.appendChild(remove);
      card.appendChild(head);

      var desc = document.createElement("input");
      desc.type = "text";
      desc.className = "input";
      desc.maxLength = 255;
      desc.placeholder = "Ej: Operación de rodilla izquierda";
      desc.value = surgery.descripcion;
      desc.addEventListener("input", function () { surgery.descripcion = desc.value; });
      card.appendChild(makeField("¿Qué cirugía fue?", desc, "err-surgery-desc-" + i));

      var date = document.createElement("input");
      date.type = "date";
      date.className = "input";
      date.max = todayString();
      date.value = surgery.fecha;
      date.addEventListener("input", function () { surgery.fecha = date.value; });
      card.appendChild(makeField("Fecha (opcional)", date, "err-surgery-date-" + i));

      var obs = document.createElement("textarea");
      obs.className = "input textarea";
      obs.maxLength = 500;
      obs.placeholder = "Secuelas, restricciones médicas...";
      obs.value = surgery.observaciones;
      obs.addEventListener("input", function () { surgery.observaciones = obs.value; });
      card.appendChild(makeField("Observaciones (opcional)", obs, "err-surgery-obs-" + i));

      surgeriesList.appendChild(card);
    });

    btnAddSurgery.disabled = state.surgeries.length >= MAX_SURGERIES;
  }

  function addSurgery() {
    if (state.surgeries.length >= MAX_SURGERIES) return;
    state.surgeries.push({ descripcion: "", fecha: "", observaciones: "" });
    renderSurgeries();
  }

  function setHasSurgeries(value) {
    state.hasSurgeries = value;
    document.querySelectorAll('[data-group="hasSurgeries"] button').forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-value") === value);
    });
    var show = value === "si";
    surgeriesBox.classList.toggle("hidden", !show);
    if (show && state.surgeries.length === 0) addSurgery();
    else renderSurgeries();
  }

  document.querySelectorAll('[data-group="hasSurgeries"] button').forEach(function (b) {
    b.addEventListener("click", function () {
      setHasSurgeries(b.getAttribute("data-value"));
    });
  });
  btnAddSurgery.addEventListener("click", addSurgery);

  // Estado inicial de cirugías (las que ya venían guardadas)
  setHasSurgeries(state.hasSurgeries);

  // ---------- Validación (mismas reglas del wizard) ----------
  function clearErrors() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.textContent = "";
    });
  }

  function validate() {
    clearErrors();
    var valid = true;

    var height = Number(state.heightCm);
    if (!state.heightCm || height < 100 || height > 250) {
      document.getElementById("err-heightCm").textContent = "Altura entre 100 y 250 cm.";
      valid = false;
    }
    var weight = Number(state.weightKg);
    if (!state.weightKg || weight < 30 || weight > 300) {
      document.getElementById("err-weightKg").textContent = "Peso entre 30 y 300 kg.";
      valid = false;
    }

    if (state.goals.length === 0) {
      document.getElementById("err-goals").textContent = "Selecciona al menos un objetivo.";
      valid = false;
    }

    if (state.equipment.length === 0) {
      document.getElementById("err-equipment").textContent = "Selecciona el equipamiento.";
      valid = false;
    }

    if (state.days.length === 0) {
      document.getElementById("err-days").textContent = "Selecciona al menos un día.";
      valid = false;
    }

    if (state.hasSurgeries === "si") {
      var today = todayString();
      state.surgeries.forEach(function (surgery, i) {
        if (!surgery.descripcion.trim()) {
          var elDesc = document.getElementById("err-surgery-desc-" + i);
          if (elDesc) elDesc.textContent = "Describe la cirugía.";
          valid = false;
        }
        if (surgery.fecha && surgery.fecha > today) {
          var elFecha = document.getElementById("err-surgery-date-" + i);
          if (elFecha) elFecha.textContent = "La fecha no puede ser futura.";
          valid = false;
        }
      });
    }

    return valid;
  }

  // ---------- Alertas ----------
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

  // ---------- Guardado ----------
  var btnSave = document.getElementById("btn-save");

  btnSave.addEventListener("click", function () {
    clearAlert();

    if (!validate()) {
      showAlert("Revisa los campos marcados antes de guardar.", "error");
      return;
    }

    var perfil = {
      sex: state.sex,
      heightCm: Number(state.heightCm),
      weightKg: Number(state.weightKg),
      level: state.level,
      goals: state.goals,
      injuries: state.injuries,
      injuriesText: state.injuriesText.trim(),
      surgeries:
        state.hasSurgeries === "si"
          ? state.surgeries.map(function (sg) {
              return {
                descripcion: sg.descripcion.trim(),
                fecha: sg.fecha,
                observaciones: sg.observaciones.trim(),
              };
            })
          : [],
      environment: state.environment,
      equipment: state.equipment,
      days: state.days.slice(),
      minutesPerSession: Number(state.minutesPerSession),
    };

    btnSave.disabled = true;
    var labelOriginal = btnSave.textContent;
    btnSave.textContent = "Guardando...";

    fetch("/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perfil),
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
          showAlert((result.data && result.data.message) || "No pudimos guardar los cambios.", "error");
          return;
        }

        // Estado local actualizado con lo que se guardó (misma fuente que el envío).
        window.__PERFIL__ = perfil;
        showAlert("Cambios guardados correctamente.", "success");
      })
      .catch(function () {
        btnSave.disabled = false;
        btnSave.textContent = labelOriginal;
        showAlert("Error de conexión con el servidor. Inténtalo de nuevo.", "error");
      });
  });
});
