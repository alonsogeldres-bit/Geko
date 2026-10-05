document.addEventListener('DOMContentLoaded', () => {
  // Anima las barras de progreso y el gráfico semanal de 0 -> valor final
  document.querySelectorAll('.progress-fill, .bar').forEach((el) => {
    const target = el.style.width || el.style.height;
    const prop = el.style.width ? 'width' : 'height';
    el.style[prop] = '0%';
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.style.transition = `${prop} 0.8s ease`;
        el.style[prop] = target;
      }, 80);
    });
  });

  // Botón "Comenzar entrenamiento" (placeholder de interacción)
  const startBtn = document.querySelector('[data-action="start-training"]');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startBtn.textContent = '✔ ¡Entrenamiento iniciado!';
      startBtn.disabled = true;
    });
  }
});