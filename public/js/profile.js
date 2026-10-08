/**
 * PROFILE - LÃ³gica del wizard multi-paso
 * Equivalente al componente React Profile.jsx: maneja el estado del
 * formulario, la validaciÃ³n por paso y el guardado final.
 *
 * NOTA: el guardado final (finish()) por ahora solo escribe en
 * localStorage y redirige a /paywall. Cuando tengas el endpoint,
 * reemplaza ese bloque por un fetch() a tu backend (ver el TODO).
 */

document.addEventListener("DOMContentLoaded", function () {
  // ---------- DefiniciÃ³n de pasos ----------
  var stepTitles = [
    "Datos bÃ¡sicos",
    "Nivel y objetivos",
    "Limitaciones",
    "Entrena",
    "Tiempo",
  ];

  var stepDescriptions = [
    "CuÃ©ntanos lo bÃ¡sico para personalizar tu entrenamiento.",
    "Tu nivel y lo que quieres lograr marcan la diferencia.",
    "Queremos adaptar todo a tu cuerpo y evitar riesgos.",
    "Tu entorno define quÃ© rutinas te recomendamos.",
    "Ajustamos el plan a tu disponibilidad real.",
  ];

  // Un Ã­cono SVG simple por paso (User, Target, Shield, Activity, Clock)
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
    firstName: "",
    age: "",
    heightCm: "",
    weightKg: "",
    sex: "masculino",
    level: "principiante",
    goals: ["perder_grasa"],
    injuries: [],
    injuriesText: "",
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

  var firstNameInput = document.getElementById("first-name");
  var ageInput = document.getElementById("age");
  var heightInput = document.getElementById("height");
  var weightInput = document.getElementById("weight");
  var injuriesTextInput = document.getElementById("injuries-text");

  // ---------- Helpers de selecciÃ³n (segmented / chips / level) ----------
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

  function setupMultiSelect(groupSelector, stateKey) {
    var group = document.querySelector('[data-group="' + groupSelector + '"]');
    if (!group) return;
    var buttons = group.querySelectorAll("button");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = btn.getAttribute("data-value");
        var idx = state[stateKey].indexOf(value);
        if (idx === -1) {
          state[stateKey].push(value);
          btn.classList.add("chip-active");
        } else {
          state[stateKey].splice(idx, 1);
          btn.classList.remove("chip-active");
        }
      });
    });
  }

  setupSingleSelect("sex", "sex");
  setupSingleSelect("level", "level");
  setupSingleSelect("environment", "environment");
  setupSingleSelect("daysPerWeek", "daysPerWeek");
  setupSingleSelect("minutesPerSession", "minutesPerSession");
  setupMultiSelect("goals", "goals");
  setupMultiSelect("injuries", "injuries");
  setupMultiSelect("equipment", "equipment");

  firstNameInput.addEventListener("input", function () {
    state.firstName = firstNameInput.value;
  });
  ageInput.addEventListener("input", function () {
    state.age = ageInput.value;
  });
  heightInput.addEventListener("input", function () {
    state.heightCm = heightInput.value;
  });
  weightInput.addEventListener("input", function () {
    state.weightKg = weightInput.value;
  });
  injuriesTextInput.addEventListener("input", function () {
    state.injuriesText = injuriesTextInput.value;
  });

  // ---------- ValidaciÃ³n por paso ----------
  function clearErrors() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.textContent = "";
    });
  }

  function validateStep(s) {
    clearErrors();
    var valid = true;

    if (s === 0) {
      if (!state.firstName.trim()) {
        document.getElementById("err-firstName").textContent = "Ingresa tu nombre.";
        valid = false;
      }
      var age = Number(state.age);
      if (!state.age || age < 12 || age > 100) {
        document.getElementById("err-age").textContent = "Edad vÃ¡lida (12-100).";
        valid = false;
      }
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

  // ---------- NavegaciÃ³n ----------
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

    var injuries =
      state.injuriesText.trim() ||
      (state.injuries.includes("Ninguna") || state.injuries.length === 0
        ? "Ninguna"
        : state.injuries.join(", "));

    var profile = {
      firstName: state.firstName,
      age: Number(state.age),
      heightCm: Number(state.heightCm),
      weightKg: Number(state.weightKg),
      sex: state.sex,
      level: state.level,
      goals: state.goals,
      injuries: injuries,
      environment: state.environment,
      daysPerWeek: Number(state.daysPerWeek),
      minutesPerSession: Number(state.minutesPerSession),
      equipment: state.equipment,
      plan: "freemium",
      createdAt: new Date().toISOString(),
    };

    btnNext.disabled = true;
    btnNext.textContent = "Guardando...";

    // Guardado temporal en el cliente (sin backend todavÃ­a)
    try {
      localStorage.setItem("geko_profile", JSON.stringify(profile));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage:", e);
    }

    // TODO: conectar al backend
    // fetch("/profile", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(profile),
    // })
    //   .then(function (res) { return res.json(); })
    //   .then(function () { window.location.href = "/dashboard"; })
    //   .catch(function () {
    //     btnNext.disabled = false;
    //     renderStep();
    //   });

    console.log("Perfil guardado (sin backend todavÃ­a):", profile);
    window.location.href = "/dashboard";
  }

  // ---------- Inicio ----------
  renderStep();
});
