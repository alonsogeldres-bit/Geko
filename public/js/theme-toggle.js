// GEKO Theme Toggle
(function() {
  const root = document.documentElement;
  const STORAGE_THEME = 'geko-theme';
  const STORAGE_PLAN = 'geko-plan';
  
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }
  
  function applyPlan(plan) {
    if (plan === 'premium') {
      root.setAttribute('data-plan', 'premium');
    } else {
      root.removeAttribute('data-plan');
    }
  }
  
  // Initialize
  const savedTheme = localStorage.getItem(STORAGE_THEME);
  const savedPlan = localStorage.getItem(STORAGE_PLAN);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
  if (savedPlan) applyPlan(savedPlan);
  
  // Expose API
  window.GekoTheme = {
    setTheme: function(theme) {
      localStorage.setItem(STORAGE_THEME, theme);
      applyTheme(theme);
    },
    toggleTheme: function() {
      const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_THEME, next);
      applyTheme(next);
      return next;
    },
    setPlan: function(plan) {
      localStorage.setItem(STORAGE_PLAN, plan);
      applyPlan(plan);
    },
    getTheme: function() {
      return root.getAttribute('data-theme') || 'light';
    }
  };
})();
