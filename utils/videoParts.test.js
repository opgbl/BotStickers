'use strict';

// Pruebas: node --test utils/
const test = require('node:test');
const assert = require('node:assert/strict');
const { planParts, planPartsFrom, parseStartArg, partsNotice, _internal } = require('./videoParts');

const { parseDuration, parseFrameSize, bandFromDetection } = _internal;

test('video corto: un solo sticker con su duración', () => {
  assert.deepEqual(planParts(7.5).parts, [{ start: 0, length: 7.5 }]);
  assert.deepEqual(planParts(12).parts, [{ start: 0, length: 12 }]);
});

test('duración desconocida: un sticker de 12 s como antes', () => {
  assert.deepEqual(planParts(null).parts, [{ start: 0, length: 12 }]);
});

test('video de 23 s: tres partes de 8, 8 y 7', () => {
  const plan = planParts(23);
  assert.deepEqual(plan.parts, [{ start: 0, length: 8 }, { start: 8, length: 8 }, { start: 16, length: 7 }]);
  assert.equal(plan.truncated, false);
});

test('cola corta se pega a la parte anterior (18 s → 8 + 10)', () => {
  assert.deepEqual(planParts(18).parts, [{ start: 0, length: 8 }, { start: 8, length: 10 }]);
});

test('video largo: máximo 4 partes y avisa que se cortó', () => {
  const plan = planParts(60);
  assert.equal(plan.parts.length, 4);
  assert.equal(plan.truncated, true);
  assert.equal(plan.covered, 32);
  assert.match(partsNotice(60, plan), /primeros 32 s en 4 stickers/);
});

test('33 s se marca cortado; 32,3 s no', () => {
  const plan = planParts(33);
  assert.equal(plan.parts.length, 4);
  assert.equal(plan.truncated, true);
  const plan2 = planParts(32.3);
  assert.equal(plan2.truncated, false);
});

test('parseDuration lee la salida de ffmpeg', () => {
  assert.equal(parseDuration('  Duration: 00:00:23.45, start: 0'), 23.45);
  assert.equal(parseDuration('Duration: 00:01:02.00,'), 62);
  assert.equal(parseDuration('nada'), null);
});

test('parseFrameSize respeta la rotación', () => {
  assert.deepEqual(parseFrameSize('Stream #0:0: Video: h264, yuv420p, 1080x1920, 30 fps'), { w: 1080, h: 1920 });
  assert.deepEqual(
    parseFrameSize('Video: h264, yuv420p, 1920x1080\n displaymatrix: rotation of -90.00 degrees'),
    { w: 1080, h: 1920 },
  );
});

test('franja 16:9 en video vertical: recorta', () => {
  const frame = { w: 1080, h: 1920 };
  assert.equal(bandFromDetection(frame, { w: 1080, h: 608, x: 0, y: 656 }), 'crop=1080:608:0:656');
});

test('zona detectada algo baja: se ajusta a 16:9 centrado en ella', () => {
  const frame = { w: 1080, h: 1920 };
  assert.equal(bandFromDetection(frame, { w: 1076, h: 546, x: 2, y: 640 }), 'crop=1080:608:0:610');
});

test('franja pegada abajo no se sale del cuadro', () => {
  const frame = { w: 720, h: 1280 };
  assert.equal(bandFromDetection(frame, { w: 720, h: 320, x: 0, y: 960 }), 'crop=720:406:0:874');
});

test('video vertical normal (todo se mueve): no recorta', () => {
  assert.equal(bandFromDetection({ w: 1080, h: 1920 }, { w: 1080, h: 1920, x: 0, y: 0 }), null);
});

test('zona con movimiento angosta (persona hablando): no recorta', () => {
  assert.equal(bandFromDetection({ w: 1080, h: 1920 }, { w: 500, h: 300, x: 290, y: 800 }), null);
});

test('franja que no es 16:9 (cuadrada): no recorta', () => {
  assert.equal(bandFromDetection({ w: 1080, h: 1920 }, { w: 1080, h: 1080, x: 0, y: 420 }), null);
});

test('caso real del ensayo: movimiento 696x600 con lados quietos → franja completa', () => {
  assert.equal(bandFromDetection({ w: 1080, h: 1920 }, { w: 696, h: 600, x: 124, y: 624 }), 'crop=1080:608:0:620');
});

test('video horizontal: nunca recorta la franja', () => {
  assert.equal(bandFromDetection({ w: 1280, h: 720 }, { w: 1280, h: 600, x: 0, y: 60 }), null);
});

test('parseStartArg: número tras el comando', () => {
  assert.deepEqual(parseStartArg('#s+a 4'), { start: 4, body: '#s+a' });
  assert.deepEqual(parseStartArg('#s 4.5 "hola"'), { start: 4.5, body: '#s "hola"' });
  assert.deepEqual(parseStartArg('#s 4,5s'), { start: 4.5, body: '#s' });
  assert.deepEqual(parseStartArg('#s 1:05 completo'), { start: 65, body: '#s completo' });
});

test('parseStartArg: sin número o texto normal no cambia nada', () => {
  assert.deepEqual(parseStartArg('#s+a'), { start: 0, body: '#s+a' });
  assert.deepEqual(parseStartArg('#s "hola"'), { start: 0, body: '#s "hola"' });
  assert.deepEqual(parseStartArg('#s 4x4 al limite'), { start: 0, body: '#s 4x4 al limite' });
});

test('planPartsFrom: arranca en el segundo pedido', () => {
  assert.deepEqual(planPartsFrom(30, 4).parts, [{ start: 4, length: 8 }, { start: 12, length: 8 }, { start: 20, length: 10 }]);
  assert.deepEqual(planPartsFrom(10, 4).parts, [{ start: 4, length: 6 }]);
  assert.deepEqual(planPartsFrom(null, 4).parts, [{ start: 4, length: 12 }]);
});

test('planPartsFrom: inicio fuera del video da mensaje claro', () => {
  assert.throws(() => planPartsFrom(10, 12), (e) => /dura 10 s, no puede empezar en el segundo 12/.test(e.userMsg));
});

test('aviso de partes con inicio', () => {
  assert.equal(partsNotice(30, planPartsFrom(30, 4)), 'Desde el segundo 4 quedan 26 s, va en 3 stickers.');
  assert.equal(partsNotice(100, planPartsFrom(100, 65)), 'Desde el segundo 1:05 quedan 35 s. Van 32 s en 4 stickers.');
});
