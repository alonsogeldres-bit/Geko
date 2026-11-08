/* ===========================================
   Comprueba que TODO ejercicio que Geko puede proponer en el chat tiene su GIF.
   Úsalo después de editar services/routineCatalogService.js o de regenerar
   data/exercises-index.json:

     npm run check:routine-catalog

   Muestra, para cada ejercicio del catálogo, con qué animación del dataset se
   resuelve. Termina con error (código 1) si alguno no tiene GIF o apunta a otro.
   =========================================== */

const { buscarMedia } = require('../services/exerciseMediaService');
const { CATALOGO, DESCARTADOS } = require('../services/routineCatalogService');

console.log(`Ejercicios válidos en el catálogo: ${CATALOGO.length}\n`);

CATALOGO.forEach((e) => {
  const media = buscarMedia(e.nombre);
  console.log(`OK   ${e.nombre.padEnd(38)} -> ${media.nombreDataset}`);
});

if (DESCARTADOS.length) {
  console.log(`\nSIN GIF VERIFICADO (${DESCARTADOS.length}): no se ofrecen en el chat`);
  DESCARTADOS.forEach((d) => {
    console.log(`FALLA ${d.nombre.padEnd(37)} esperado: ${d.ref} | obtenido: ${d.obtenido || 'ninguno'}`);
  });
  process.exit(1);
}

console.log('\nTodos los ejercicios del catálogo tienen demostración.');
