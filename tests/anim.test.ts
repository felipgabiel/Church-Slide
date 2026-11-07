import test from 'node:test';
import assert from 'node:assert/strict';
import { cubicBezier, easePeakSpeed, getEase } from '../src/core/anim/easing';
import { phaseTiming, totalDuration, unitState } from '../src/core/anim/engine';
import { ANIMATION_PRESETS, applyPreset, baseAnimation } from '../src/core/anim/presets';

const geo = { w: 1920, h: 1080 };

test('cubic-bezier: extremos e monotonia', () => {
  const ease = getEase('ease-out');
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  let prev = 0;
  for (let i = 1; i <= 20; i++) {
    const v = ease(i / 20);
    assert.ok(v >= prev - 1e-9, 'ease-out deve ser monotônica');
    prev = v;
  }
  assert.ok(cubicBezier(0, 0, 1, 1)(0.37) === 0.37);
});

test('curva "back" passa de 1 (leve elasticidade)', () => {
  const ease = getEase('back');
  const max = Math.max(...Array.from({ length: 50 }, (_, i) => ease((i + 1) / 50)));
  assert.ok(max > 1);
});

test('entrada começa invisível/deslocada e termina no repouso', () => {
  const cfg = { ...baseAnimation(), motionBlur: 50 };
  const ease = getEase(cfg.easing);
  const peak = easePeakSpeed(cfg.easing);
  const start = unitState(cfg, 'enter', 0, geo, ease, peak);
  const end = unitState(cfg, 'enter', 1, geo, ease, peak);
  assert.equal(start.opacity, 0);
  assert.ok(start.ty > 0, 'slide up: começa abaixo da posição final');
  assert.equal(end.opacity, 1);
  assert.equal(end.ty, 0);
  assert.equal(end.scale, 1);
  assert.equal(end.blurX + end.blurY, 0);
});

test('saída continua o movimento e termina invisível', () => {
  const cfg = baseAnimation();
  const ease = getEase(cfg.easing);
  const peak = easePeakSpeed(cfg.easing);
  const end = unitState(cfg, 'exit', 1, geo, ease, peak);
  assert.equal(end.opacity, 0);
  assert.ok(end.ty < 0, 'slide up: sai para cima');
});

test('Motion Blur é direcional e proporcional à velocidade', () => {
  const cfg = { ...baseAnimation(), direction: 'up' as const, motionBlur: 100 };
  const ease = getEase(cfg.easing);
  const peak = easePeakSpeed(cfg.easing);
  const early = unitState(cfg, 'enter', 0.05, geo, ease, peak);
  const late = unitState(cfg, 'enter', 0.95, geo, ease, peak);
  assert.equal(early.blurX, 0, 'slide vertical não borra no eixo X');
  assert.ok(early.blurY > 1, 'borra no eixo do movimento');
  assert.ok(early.blurY > late.blurY * 3, 'mais rápido no início => mais borrão');

  const horizontal = unitState({ ...cfg, direction: 'left' }, 'enter', 0.05, geo, ease, peak);
  assert.ok(horizontal.blurX > 1);
  assert.equal(horizontal.blurY, 0);

  const off = unitState({ ...cfg, motionBlur: 0 }, 'enter', 0.05, geo, ease, peak);
  assert.equal(off.blurY, 0);
});

test('zoom in cresce até 1; zoom out encolhe até 1', () => {
  const ease = getEase('linear');
  const peak = easePeakSpeed('linear');
  const zin = { ...baseAnimation(), enter: { fade: true, slide: false, zoom: 'in' as const, blur: false } };
  const zout = { ...zin, enter: { ...zin.enter, zoom: 'out' as const } };
  assert.ok(unitState(zin, 'enter', 0, geo, ease, peak).scale < 1);
  assert.ok(unitState(zout, 'enter', 0, geo, ease, peak).scale > 1);
  assert.equal(unitState(zin, 'enter', 1, geo, ease, peak).scale, 1);
});

test('tempo total considera atraso, stagger e velocidade', () => {
  const cfg = { ...baseAnimation(), duration: 1000, stagger: 100, delay: 200, speed: 2 };
  const t = phaseTiming(cfg, 'enter');
  assert.equal(t.duration, 500);
  assert.equal(t.stagger, 50);
  assert.equal(t.delay, 100);
  assert.equal(totalDuration(cfg, 'enter', 5), 100 + 4 * 50 + 500);
  assert.ok(phaseTiming(cfg, 'exit').duration <= 650);
});

test('todos os presets produzem configurações válidas', () => {
  for (const p of ANIMATION_PRESETS) {
    const cfg = applyPreset(p.id);
    assert.equal(cfg.preset, p.id);
    assert.ok(cfg.duration >= 1);
    assert.ok(['block', 'line', 'word'].includes(cfg.unit));
  }
  assert.ok(ANIMATION_PRESETS.length >= 14);
});
