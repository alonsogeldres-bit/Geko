#!/usr/bin/env node
/**
 * Genera un índice compacto de ejercicios a partir del dataset público
 * hasaneyldrm/exercises-dataset (el mismo que usa openGym).
 *
 * El JSON original pesa ~17 MB porque trae instrucciones en 10 idiomas.
 * Para el matching en Geko solo necesitamos nombre, equipo, zona y las
 * instrucciones en español, así que guardamos un archivo mucho más pequeño.
 *
 * Uso:
 *   node scripts/build-exercise-index.js
 */

const fs = require('fs');
const path = require('path');

const DATASET_URL =
  'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json';
const OUTPUT = path.join(__dirname, '..', 'data', 'exercises-index.json');

const basename = (value) => String(value || '').split('/').pop();

const limpiar = (value, max) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

async function main() {
  console.log('[exercise-index] descargando dataset…');

  const res = await fetch(DATASET_URL, {
    headers: { 'User-Agent': 'Geko/1.0 (exercise media index)' },
  });

  if (!res.ok) {
    throw new Error(`No se pudo descargar el dataset: HTTP ${res.status}`);
  }

  const ejercicios = await res.json();
  if (!Array.isArray(ejercicios) || !ejercicios.length) {
    throw new Error('El dataset no trae ejercicios.');
  }

  const indice = ejercicios.map((ex) => ({
    id: String(ex.id || ''),
    n: limpiar(ex.name, 120),
    g: basename(ex.gif_url),
    i: basename(ex.image),
    eq: limpiar(ex.equipment, 60),
    bp: limpiar(ex.body_part, 60),
    tg: limpiar(ex.target, 60),
    mg: limpiar(ex.muscle_group, 60),
    es: limpiar(ex.instructions && ex.instructions.es, 900),
  }));

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(indice), 'utf8');

  const kb = Math.round(fs.statSync(OUTPUT).size / 1024);
  console.log(`[exercise-index] ${indice.length} ejercicios guardados en ${OUTPUT} (${kb} KB)`);
}

main().catch((err) => {
  console.error('[exercise-index] error:', err.message);
  process.exitCode = 1;
});
