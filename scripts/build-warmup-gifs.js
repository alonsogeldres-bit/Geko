/**
 * Genera los GIF de calentamiento/movilidad que no existen en el dataset
 * principal (hasaneyldrm/exercises-dataset).
 *
 * Fuente: yuhonas/free-exercise-db (Unlicense / dominio público).
 * Cada ejercicio trae dos fotos (inicio y fin); las unimos en un GIF de dos
 * frames para conservar el pipeline actual (`gifUrl` -> `imgUrl` -> ocultar).
 *
 * Uso: npm run build:warmup-gifs
 * Los GIF resultantes se guardan en public/media/calentamiento/ y se pueden
 * commitear: en producción no hace falta ejecutar este script.
 */

const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const DESTINO = path.join(__dirname, '..', 'public', 'media', 'calentamiento');

const ANCHO = 600;
const ALTO = 400;
const DELAY_MS = 900;

const EJERCICIOS = [
  { archivo: 'arm-circles.gif', id: 'Arm_Circles' },
  { archivo: 'hip-circles.gif', id: 'Standing_Hip_Circles' },
  { archivo: 'shoulder-circles.gif', id: 'Shoulder_Circles' },
];

const descargar = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} -> ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

/** Redimensionado bilineal simple de RGBA. */
const redimensionar = (origen, anchoOrigen, altoOrigen, ancho, alto) => {
  const salida = new Uint8Array(ancho * alto * 4);

  for (let y = 0; y < alto; y += 1) {
    const sy = ((y + 0.5) * altoOrigen) / alto - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(altoOrigen - 1, y0 + 1);
    const wy = Math.max(0, Math.min(1, sy - y0));

    for (let x = 0; x < ancho; x += 1) {
      const sx = ((x + 0.5) * anchoOrigen) / ancho - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(anchoOrigen - 1, x0 + 1);
      const wx = Math.max(0, Math.min(1, sx - x0));

      const destino = (y * ancho + x) * 4;

      for (let c = 0; c < 4; c += 1) {
        const p00 = origen[(y0 * anchoOrigen + x0) * 4 + c];
        const p10 = origen[(y0 * anchoOrigen + x1) * 4 + c];
        const p01 = origen[(y1 * anchoOrigen + x0) * 4 + c];
        const p11 = origen[(y1 * anchoOrigen + x1) * 4 + c];

        const arriba = p00 + (p10 - p00) * wx;
        const abajo = p01 + (p11 - p01) * wx;
        salida[destino + c] = Math.round(arriba + (abajo - arriba) * wy);
      }
    }
  }

  return salida;
};

const leerFrame = async (id, indice) => {
  const url = `${BASE_URL}/${id}/${indice}.jpg`;
  const buffer = await descargar(url);
  const imagen = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });

  if (!imagen.width || !imagen.height) {
    throw new Error(`No se pudo decodificar ${url}`);
  }

  return redimensionar(imagen.data, imagen.width, imagen.height, ANCHO, ALTO);
};

const generarGif = (frames, archivo) => {
  // Una sola paleta para ambos frames: evita que el color "parpadee" al loopear.
  const juntos = new Uint8Array(frames[0].length * frames.length);
  frames.forEach((frame, i) => juntos.set(frame, i * frame.length));

  const paleta = quantize(juntos, 256);
  const gif = GIFEncoder();

  frames.forEach((frame, i) => {
    const opciones = { palette: paleta, delay: DELAY_MS };
    if (i === 0) opciones.repeat = 0;

    gif.writeFrame(applyPalette(frame, paleta), ANCHO, ALTO, opciones);
  });

  gif.finish();
  const salida = path.join(DESTINO, archivo);
  fs.writeFileSync(salida, gif.bytes());

  return salida;
};

const main = async () => {
  fs.mkdirSync(DESTINO, { recursive: true });

  for (const ejercicio of EJERCICIOS) {
    process.stdout.write(`[warmup] ${ejercicio.id}... `);

    const frames = await Promise.all([leerFrame(ejercicio.id, 0), leerFrame(ejercicio.id, 1)]);
    const salida = generarGif(frames, ejercicio.archivo);

    console.log(`${(fs.statSync(salida).size / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), salida)}`);
  }
};

main().catch((err) => {
  console.error('\n[warmup] error:', err.message);
  process.exitCode = 1;
});
