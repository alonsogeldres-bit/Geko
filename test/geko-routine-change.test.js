/* ===========================================
   PRUEBAS DEL CHAT DE GEKO: CAMBIOS DE RUTINA
   Cubren lo que rompía el flujo:
     - que la petición se detecte aunque la conjugación cambie;
     - que la IA nunca pueda "confirmar" un cambio que no ocurrió;
     - que, sin IA, un pedido explícito siga produciendo una propuesta.

   Se ejecutan con `npm test` (node --test). No usan la base de datos ni Groq.
   =========================================== */

const test = require('node:test');
const assert = require('node:assert/strict');

const RoutineChanges = require('../services/gekoRoutineChangeService');

const RUTINA = {
  calentamiento: [
    { nombre: 'Movilidad articular', duracionMin: 3, descripcion: 'x' },
  ],
  rutinaPrincipal: [
    { nombre: 'Press de banca', series: 3, repeticiones: '10', descansoSeg: 60, descripcion: 'x' },
    { nombre: 'Sentadilla con mancuernas', series: 3, repeticiones: '12', descansoSeg: 60, descripcion: 'x' },
    { nombre: 'Remo con mancuerna', series: 3, repeticiones: '12', descansoSeg: 60, descripcion: 'x' },
  ],
  estiramiento: [
    { nombre: 'Estiramiento de cuádriceps', duracionMin: 3, descripcion: 'x' },
  ],
};

const PERFIL = {
  objetivo: 'Ganar musculo',
  nivelFisico: 'Medio',
  entorno: 'Gimnasio',
  minutosSesion: 45,
  equipamiento: ['Mancuernas'],
  lesiones: [],
};

const proponer = (mensaje, restricciones = {}) =>
  RoutineChanges.proponerCambios({
    mensaje,
    perfil: PERFIL,
    rutina: RUTINA,
    restricciones,
    usarIA: false,
  });

test('detecta peticiones de cambio en sus conjugaciones más comunes', () => {
  const frases = [
    'cambia mi rutina',
    'cambiame la rutina',
    'me cambias la rutina',
    'podrias cambiarme el ejercicio',
    'puedes cambiarme la rutina',
    'me lo cambias por otro',
    'quiero otra opcion',
    'reemplazame el press',
    'sustituye el press por flexiones',
    'me molesta la rodilla',
    'no puedo con las flexiones',
    'no tengo mancuernas',
    'me duele la rodilla',
  ];

  frases.forEach((frase) => {
    assert.equal(RoutineChanges.detectarPeticion(frase).esCambio, true, `debería detectar: ${frase}`);
  });
});

test('no confunde preguntas de ayuda ni temas de perfil con un cambio de rutina', () => {
  const frases = [
    'hola',
    'que me toca entrenar hoy',
    'donde puedo cambiar mi rutina',
    'como cambio mi rutina',
    'quiero cambiar mi tiempo de sesion',
    'quiero cambiar mi plan por otro',
    'cambio de plan',
  ];

  frases.forEach((frase) => {
    assert.equal(RoutineChanges.detectarPeticion(frase).esCambio, false, `no debería detectar: ${frase}`);
  });
});

test('solo marca como "ya aplicado" una confirmación real de cambio', () => {
  const afirma = [
    'Listo, ya cambié el press por flexiones',
    'Ya lo apliqué',
    'He modificado tu rutina',
    'Tu rutina ya está actualizada',
  ];
  const noAfirma = [
    'Te propongo cambiar el press por flexiones',
    'No he modificado nada',
    'Todavía no he cambiado tu rutina',
    'nunca he cambiado tu rutina',
    'Tu rutina ya está lista para hoy',
  ];

  afirma.forEach((t) => assert.equal(RoutineChanges.reclamaCambioAplicado(t), true, `debería marcarse: ${t}`));
  noAfirma.forEach((t) => assert.equal(RoutineChanges.reclamaCambioAplicado(t), false, `no debería marcarse: ${t}`));
});

test('sin IA, un pedido explícito igual genera una propuesta', async () => {
  const r = await proponer('cambia el press de banca por flexiones');

  assert.equal(r.cambios.length, 1);
  assert.equal(r.cambios[0].deNombre, 'Press de banca');
  assert.equal(r.cambios[0].nuevo.nombre, 'Flexiones');
});

test('sin IA, perder un equipo cambia todos los ejercicios que lo usan', async () => {
  const r = await proponer('no tengo mancuernas', { sinEquipo: ['mancuernas'] });

  assert.ok(r.cambios.length >= 2);
  r.cambios.forEach((c) => assert.match(c.deNombre, /mancuerna/i));
});

test('sin IA, el dolor en una zona cambia los ejercicios que la cargan', async () => {
  const r = await proponer('me duele la rodilla', { zonas: ['rodilla'] });

  assert.ok(r.cambios.some((c) => c.deNombre === 'Sentadilla con mancuernas'));
});

test('si el ejercicio mencionado es ambiguo, no se adivina y se pide aclaración', async () => {
  const rutinaAmb = {
    calentamiento: [],
    rutinaPrincipal: [
      { nombre: 'Press de banca', series: 3, repeticiones: '10', descansoSeg: 60, descripcion: 'x' },
      { nombre: 'Press militar', series: 3, repeticiones: '8', descansoSeg: 60, descripcion: 'x' },
    ],
    estiramiento: [],
  };

  const r = await RoutineChanges.proponerCambios({
    mensaje: 'cambia el press por flexiones',
    perfil: PERFIL,
    rutina: rutinaAmb,
    restricciones: {},
    usarIA: false,
  });

  assert.equal(r.cambios.length, 0);
  assert.match(r.texto, /cuál quieres cambiar/i);
});

test('aplicarCambios reemplaza el ejercicio y no toca la rutina original', () => {
  const cambios = [
    {
      ref: 'P1',
      clave: 'rutinaPrincipal',
      tipo: 'principal',
      etiqueta: 'Rutina principal',
      indice: 0,
      deNombre: 'Press de banca',
      deDetalle: '3 x 10',
      catalogoId: 'flexiones',
      nuevo: { nombre: 'Flexiones', series: 3, repeticiones: '10', descansoSeg: 60, descripcion: 'x' },
    },
  ];

  const { rutina, aplicados, omitidos } = RoutineChanges.aplicarCambios(RUTINA, cambios);

  assert.equal(aplicados.length, 1);
  assert.equal(omitidos.length, 0);
  assert.equal(rutina.rutinaPrincipal[0].nombre, 'Flexiones');
  assert.equal(RUTINA.rutinaPrincipal[0].nombre, 'Press de banca', 'la original no debe cambiar');
});

test('aplicarCambios omite un cambio si la posición ya tiene otro ejercicio', () => {
  const cambios = [
    {
      clave: 'rutinaPrincipal',
      indice: 0,
      deNombre: 'Ejercicio que ya no está',
      nuevo: { nombre: 'Flexiones' },
    },
  ];

  const { aplicados, omitidos } = RoutineChanges.aplicarCambios(RUTINA, cambios);

  assert.equal(aplicados.length, 0);
  assert.equal(omitidos.length, 1);
});
