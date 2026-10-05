
(function () {
  var SPLASH_DURATION = 2600; 

  function goToWelcome() {
    window.location.replace("/login");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var timer = setTimeout(goToWelcome, SPLASH_DURATION);

    window.addEventListener("beforeunload", function () {
      clearTimeout(timer);
    });
  });
})();

setTimeout(function () {
  var lastPage = sessionStorage.getItem("lastPage");
  window.location.replace(lastPage || "/login");
}, SPLASH_DURATION);
