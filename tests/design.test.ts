import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyDesign, motionsFor, newDesign, newDesignLayer, sanitizeDesign, sanitizeLayer } from '../src/core/design/model';
import { layerState, mixHex, paletteAt, rng, twinkleAlpha } from '../src/core/design/motion';
import { STARTERS } from '../src/core/design/starters';
import { normalizeBackground, normalizeProject } from '../src/core/defaults';
import type { DesignLayer } from '../src/core/types';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('fundo: todo movimento fecha o loop (fase 0 = fase 1)', () => {
  const kinds = ['drift', 'breathe', 'spin', 'flow', 'colors', 'twinkle'] as const;
  for (const cycles of [1, 2, 3, 4]) {
    const layer: DesignLayer = newDesignLayer('shape', {
      motions: kinds.map((kind) => ({ kind, amount: 73, cycles, ...(kind === 'colors' ? { colors: ['#ff0000', '#00ff00', '#0000ff'] } : {}) })),
    });
    const a = layerState(layer, 0);
    const b = layerState(layer, 1);
    assert.ok(close(a.dx, b.dx) && close(a.dy, b.dy) && close(a.scale, b.scale) && close(a.alpha, b.alpha), `posição/escala/opacidade (${cycles} voltas)`);
    // giro e fluxo andam períodos inteiros: o desenho é o mesmo
    assert.ok(close(((b.rot - a.rot) % 360 + 360) % 360, 0), 'giro em voltas inteiras');
    assert.ok(close(b.flow - a.flow - Math.round(b.flow - a.flow), 0), 'fluxo em períodos inteiros');
    assert.deepEqual(a.fill.stops.map((s) => s.color), b.fill.stops.map((s) => s.color), 'cores');
  }
});

test('fundo: sem movimento, a camada fica parada', () => {
  const l = newDesignLayer('glow', { motions: [] });
  const s = layerState(l, 0.37);
  assert.equal(s.dx, 0);
  assert.equal(s.scale, 1);
  assert.equal(s.alpha, 1);
  assert.equal(s.fill, l.fill);
});

test('fundo: mistura e paleta circular', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(paletteAt(['#ff0000', '#0000ff'], 0), '#ff0000');
  assert.equal(paletteAt(['#ff0000', '#0000ff'], 0.5), '#0000ff');
  assert.equal(paletteAt(['#ff0000', '#0000ff'], 1), '#ff0000'); // volta para a primeira
  assert.equal(twinkleAlpha(null, 0.3), 1);
});

test('fundo: gerador pseudoaleatório é determinístico', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('fundo: validação corrige dados ruins sem perder o que é bom', () => {
  const d = sanitizeDesign({
    name: '  ',
    loopSec: 999,
    base: 'azul',
    layers: [{ kind: 'nada', opacity: 500, fill: { type: 'x', stops: [{ color: '#abc', at: 200 }] }, motions: [{ kind: 'girar' }, { kind: 'spin', cycles: 9 }] }, 'lixo', null],
  })!;
  assert.equal(d.name, 'Fundo sem nome');
  assert.equal(d.loopSec, 60);
  assert.equal(d.base, '#0b0b12');
  assert.equal(d.layers.length, 1);
  const l = d.layers[0];
  assert.equal(l.kind, 'gradient');
  assert.equal(l.opacity, 100);
  assert.equal(l.fill.stops[0].color, '#aabbcc');
  assert.equal(l.fill.stops[0].at, 100);
  assert.deepEqual(l.motions, [{ kind: 'spin', amount: 50, cycles: 4 }]);
  assert.equal(sanitizeDesign('x'), null);
  assert.equal(sanitizeLayer(3), null);
});

test('fundo: modelos de partida são válidos e estáveis', () => {
  for (const s of STARTERS) {
    const a = s.make();
    const b = s.make();
    assert.ok(a.layers.length > 0, s.name);
    assert.deepEqual(sanitizeDesign(a)!.layers, a.layers, `${s.name} passa pela validação sem mudar`);
    assert.deepEqual(a.layers.map((l) => l.id), b.layers.map((l) => l.id), `${s.name}: ids fixos (partículas iguais na miniatura)`);
    for (const l of a.layers) for (const m of l.motions) assert.ok(motionsFor(l.kind).includes(m.kind), `${s.name}/${l.name}: ${m.kind}`);
  }
});

test('fundo: cópia é independente do original', () => {
  const d = newDesign('A', [newDesignLayer('shape')]);
  const c = copyDesign(d);
  c.layers[0].x = 10;
  assert.notEqual(c.id, d.id);
  assert.equal(d.layers[0].x, 50);
});

test('louvor: fundo do Estúdio é validado ao abrir; dados ruins viram degradê', () => {
  const ok = normalizeBackground({ kind: 'design', design: { name: 'Sol', layers: [{ kind: 'shape' }] } });
  assert.equal(ok.kind, 'design');
  assert.equal(ok.design?.layers[0].kind, 'shape');
  const bad = normalizeBackground({ kind: 'design', design: 'quebrado' });
  assert.equal(bad.kind, 'gradient');
  const weird = normalizeBackground({ kind: 'holograma' });
  assert.equal(weird.kind, 'gradient');
  assert.equal('design' in normalizeBackground({ kind: 'solid', design: { name: 'x' } }), false);

  const p = normalizeProject({ theme: { background: { kind: 'design', design: STARTERS[0].make() } }, slides: [{ background: { kind: 'design', design: STARTERS[1].make() } }] });
  assert.equal(p.theme.background.design?.name, 'Sol poente');
  assert.equal(p.slides[0].background?.design?.name, 'Portais');
});
