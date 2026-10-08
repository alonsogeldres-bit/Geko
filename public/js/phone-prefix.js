// Deja un prefijo fijo (por ejemplo +56) al inicio de los campos con data-prefijo.
document.addEventListener("DOMContentLoaded", function () {
  var inputs = document.querySelectorAll("input[data-prefijo]");

  Array.prototype.forEach.call(inputs, function (input) {
    var prefijo = input.getAttribute("data-prefijo");
    var digitosPrefijo = prefijo.replace(/\D/g, "");

    function normalizar() {
      var valor = input.value;
      if (valor.indexOf(prefijo) === 0) return;

      // El usuario borró parte del prefijo: se restaura.
      if (prefijo.indexOf(valor) === 0) {
        input.value = prefijo;
        return;
      }

      // Se pegó o autocompletó un número sin prefijo: se antepone.
      var digitos = valor.replace(/\D/g, "");
      if (digitos.indexOf(digitosPrefijo) === 0) {
        digitos = digitos.slice(digitosPrefijo.length);
      }
      input.value = prefijo + digitos;
    }

    function alFinal() {
      var largo = input.value.length;
      try { input.setSelectionRange(largo, largo); } catch (e) { /* tipo tel sin soporte */ }
    }

    input.addEventListener("input", normalizar);
    input.addEventListener("blur", normalizar);
    input.addEventListener("focus", function () {
      normalizar();
      setTimeout(alFinal, 0);
    });

    normalizar();
  });
});