/**
 * PROFILE - Lógica del wizard multi-paso
 * Equivalente al componente React Profile.jsx: maneja el estado del
 * formulario, la validación por paso y el guardado final.
 *
 * El guardado final (finish()) envía el perfil a POST /profile.
 */

document.addEventListener("DOMContentLoaded", function () {
  // ---------- Definición de pasos ----------
  var stepTitles = [
    "Datos básicos",
    "Nivel y objetivos",
    "Limitaciones",
    "Entrena",
    "Tiempo",
  ];

  var stepDescriptions = [
    "Cuéntanos lo básico para personalizar tu entrenamiento.",
    "Tu nivel y lo que quieres lograr marcan la diferencia.",
    "Queremos adaptar todo a tu cuerpo y evitar riesgos.",
    "Tu entorno define qué rutinas te recomendamos.",
    "Ajustamos el plan a tu disponibilidad real.",
  ];

  // Un ícono SVG simple por paso (User, Target, Shield, Activity, Clock)
  var stepIcons = [
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"></path></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>',
  ];

  var TOTAL_STEPS = stepTitles.length;

  // ---------- Estado del formulario ----------
  var state = {
    heightCm: "",
    weightKg: "",
    sex: "masculino",
    level: "principiante",
    goals: ["perder_grasa"],
    injuries: [],
    injuriesText: "",
    hasSurgeries: "no",
    surgeries: [],
    environment: "gimnasio",
    equipment: ["Mancuernas"],
    daysPerWeek: "3",
    minutesPerSession: "45",
  };

  var step = 0;

  // ---------- Referencias al DOM ----------
  var stepCounter = document.getElementById("step-counter");
  var stepsIndicator = document.getElementById("steps-indicator");
  var stepIcon = document.getElementById("step-icon");
  var stepTitleEl = document.getElementById("step-title");
  var stepDescEl = document.getElementById("step-desc");
  var panels = document.querySelectorAll(".step-panel");
  var btnBack = document.getElementById("btn-back");
  var btnNext = document.getElementById("btn-next");

  var heightInput = document.getElementById("height");
  var weightInput = document.getElementById("weight");
  var injuriesTextInput = document.getElementById("injuries-text");

  // ---------- Helpers de selección (segmented / chips / level) ----------
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

    // Bloquea o desbloquea los demás chips según si "Ninguno/Ninguna" está activo
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
            // "Ninguno": se descartan todas las demás selecciones
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

  setupSingleSelect("sex", "sex");
  setupSingleSelect("level", "level");
  setupSingleSelect("environment", "environment");
  setupSingleSelect("daysPerWeek", "daysPerWeek");
  setupSingleSelect("minutesPerSession", "minutesPerSession");
  setupMultiSelect("goals", "goals");
  setupMultiSelect("injuries", "injuries", "Ninguna");
  setupMultiSelect("equipment", "equipment", "Ninguno");

  heightInput.addEventListener("input", function () {
    state.heightCm = heightInput.value;
  });
  weightInput.addEventListener("input", function () {
    state.weightKg = weightInput.value;
  });
  injuriesTextInput.addEventListener("input", function () {
    state.injuriesText = injuriesTextInput.value;
  });

  // ---------- Cirugías ----------
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
      desc.addEventListener("input", function () {
        surgery.descripcion = desc.value;
      });
      card.appendChild(makeField("¿Qué cirugía fue?", desc, "err-surgery-desc-" + i));

      var date = document.createElement("input");
      date.type = "date";
      date.className = "input";
      date.max = todayString();
      date.value = surgery.fecha;
      date.addEventListener("input", function () {
        surgery.fecha = date.value;
      });
      card.appendChild(makeField("Fecha (opcional)", date, "err-surgery-date-" + i));

      var obs = document.createElement("textarea");
      obs.className = "input textarea";
      obs.maxLength = 500;
      obs.placeholder = "Secuelas, restricciones médicas...";
      obs.value = surgery.observaciones;
      obs.addEventListener("input", function () {
        surgery.observaciones = obs.value;
      });
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

  // Sincroniza el selector Sí/No, el estado y la caja de cirugías
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

  // ---------- Validación por paso ----------
  function clearErrors() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.textContent = "";
    });
  }

  function validateStep(s) {
    clearErrors();
    var valid = true;

    if (s === 0) {
      var height = Number(state.heightCm);
      if (!state.heightCm || height < 100 || height > 250) {
        document.getElementById("err-heightCm").textContent = "Altura en cm.";
        valid = false;
      }
      var weight = Number(state.weightKg);
      if (!state.weightKg || weight < 30 || weight > 300) {
        document.getElementById("err-weightKg").textContent = "Peso en kg.";
        valid = false;
      }
    }

    if (s === 1 && state.goals.length === 0) {
      document.getElementById("err-goals").textContent = "Selecciona al menos un objetivo.";
      valid = false;
    }

    if (s === 2 && state.hasSurgeries === "si") {
      var today = todayString();
      state.surgeries.forEach(function (surgery, i) {
        if (!surgery.descripcion.trim()) {
          document.getElementById("err-surgery-desc-" + i).textContent = "Describe la cirugía.";
          valid = false;
        }
        if (surgery.fecha && surgery.fecha > today) {
          document.getElementById("err-surgery-date-" + i).textContent = "La fecha no puede ser futura.";
          valid = false;
        }
      });
    }

    if (s === 3 && state.equipment.length === 0) {
      document.getElementById("err-equipment").textContent = "Selecciona el equipamiento.";
      valid = false;
    }

    return valid;
  }

  // ---------- Render del paso actual ----------
  function renderStep() {
    stepCounter.textContent = "Paso " + (step + 1) + " de " + TOTAL_STEPS;

    stepsIndicator.querySelectorAll(".step-dot").forEach(function (dot, i) {
      dot.classList.remove("current", "done");
      if (i < step) dot.classList.add("done");
      if (i === step) dot.classList.add("current");
    });

    stepIcon.innerHTML = stepIcons[step];
    stepTitleEl.textContent = stepTitles[step];
    stepDescEl.textContent = stepDescriptions[step];

    panels.forEach(function (panel) {
      var panelStep = Number(panel.getAttribute("data-step"));
      panel.classList.toggle("hidden", panelStep !== step);
    });

    btnNext.innerHTML =
      step < TOTAL_STEPS - 1
        ? 'Continuar <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'
        : 'Crear mi plan <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
  }

  // ---------- Navegación ----------
  btnBack.addEventListener("click", function () {
    if (step === 0) {
      window.location.href = "/login";
    } else {
      step -= 1;
      renderStep();
    }
  });

  btnNext.addEventListener("click", function () {
    if (!validateStep(step)) return;

    if (step < TOTAL_STEPS - 1) {
      step += 1;
      renderStep();
    } else {
      finish();
    }
  });

  // ---------- Guardado final ----------
  function finish() {
    if (!validateStep(step)) return;

    var profile = {
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
      daysPerWeek: Number(state.daysPerWeek),
      minutesPerSession: Number(state.minutesPerSession),
    };

    btnNext.disabled = true;
    btnNext.textContent = "Guardando...";

    function showError(message) {
      btnNext.disabled = false;
      renderStep();
      alert(message || "No pudimos guardar tu perfil. Inténtalo de nuevo.");
    }

    fetch("/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!result.data.success) {
          showError(result.data.message);
          return;
        }
        window.location.href = result.data.redirect || "/dashboard";
      })
      .catch(function () {
        showError();
      });
  }

  // ---------- Inicio ----------
  renderStep();
});