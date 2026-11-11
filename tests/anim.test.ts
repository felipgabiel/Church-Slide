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


test('trocar o efeito preserva a granularidade (Palavra por palavra) e o intervalo', () => {
  const byWord = { ...baseAnimation(), unit: 'word' as const, stagger: 70 };
  const effects = ANIMATION_PRESETS.filter((p) => p.group !== 'Por texto' && p.id !== 'none');
  assert.ok(effects.length >= 10);
  for (const p of effects) {
    const out = applyPreset(p.id, byWord);
    assert.equal(out.unit, 'word', `${p.id} desligou "Palavra"`);
    assert.equal(out.stagger, 70, `${p.id} zerou o intervalo`);
    assert.equal(out.preset, p.id);
  }
});

test('"Sem animação" não destrói a granularidade escolhida', () => {
  const out = applyPreset('none', { ...baseAnimation(), unit: 'word', stagger: 70 });
  assert.equal(out.unit, 'word');
});

import { planTotal, planUnits } from '../src/core/anim/engine';
import { patchWord, pruneWords, tokenizeText, wordCount } from '../src/core/words';
import type { AnimPhase, TextLayer } from '../src/core/types';

test('planUnits sem ajustes é idêntico à regra antiga (atraso + i × intervalo)', () => {
  const cfg = { ...baseAnimation(), unit: 'word' as const, stagger: 70, delay: 100, duration: 600 };
  const plans = planUnits(cfg, 'enter', 4);
  plans.forEach((p, i) => {
    assert.equal(p.start, 100 + i * 70);
    assert.equal(p.duration, 600);
    assert.equal(p.cfg, cfg);
  });
  assert.equal(planTotal(plans), totalDuration(cfg, 'enter', 4));
});

test('ajuste por palavra: início, duração e efeitos próprios, só na entrada', () => {
  const cfg = { ...baseAnimation(), unit: 'word' as const, stagger: 100, delay: 0, duration: 500, speed: 1 };
  const zoom: AnimPhase = { fade: true, slide: false, zoom: 'in', blur: true };
  const ov = [undefined, undefined, { enter: zoom, delay: 300, duration: 900, intensity: 80 }];
  const enter = planUnits(cfg, 'enter', 3, ov);
  assert.equal(enter[2].start, 200 + 300);
  assert.equal(enter[2].duration, 900);
  assert.equal(enter[2].cfg.intensity, 80);
  assert.deepEqual(enter[2].cfg.enter, zoom);
  assert.equal(enter[0].cfg, cfg);
  const exit = planUnits(cfg, 'exit', 3, ov);
  assert.equal(exit[2].cfg, cfg, 'a saída não usa o ajuste da palavra');
});

test('velocidade global também escala o atraso e a duração do ajuste', () => {
  const cfg = { ...baseAnimation(), stagger: 0, delay: 0, duration: 800, speed: 2 };
  const p = planUnits(cfg, 'enter', 1, [{ enter: cfg.enter, delay: 400, duration: 1000 }])[0];
  assert.equal(p.start, 200);
  assert.equal(p.duration, 500);
});

const layer = (text: string): TextLayer => ({ id: 'L', role: 'lyrics', name: 'Letra', text, visible: true, style: {} as TextLayer['style'] });

test('tokenizeText numera as palavras através das linhas', () => {
  const lines = tokenizeText('vem sobre mim\nSenhor');
  assert.deepEqual(lines.map((l) => [l.first, l.count]), [[0, 3], [3, 1]]);
  assert.equal(wordCount('a  b\n\nc'), 3);
  assert.deepEqual(tokenizeText('a  b')[0].tokens.map((t) => t.kind), ['word', 'space', 'word']);
});

test('patchWord mescla, remove com null e limpa o que ficar vazio', () => {
  const l = layer('a b c');
  patchWord(l, 1, { style: { scale: 2, weight: 900 } });
  const words = () => l.words as TextLayer['words'];
  assert.deepEqual(words(), { '1': { style: { scale: 2, weight: 900 } } });
  patchWord(l, 1, { style: { scale: null } });
  assert.deepEqual(words()?.['1'].style, { weight: 900 });
  patchWord(l, 1, { anim: { enter: { fade: true, slide: false, zoom: 'in', blur: false }, delay: 100 } });
  assert.ok(words()?.['1'].anim);
  patchWord(l, 1, { style: { weight: null }, anim: null });
  assert.equal(words(), undefined, 'sem ajustes, a chave "words" some');
});

test('pruneWords descarta ajustes de palavras que não existem mais', () => {
  const l = layer('a b c');
  patchWord(l, 0, { style: { scale: 2 } });
  patchWord(l, 2, { style: { scale: 3 } });
  l.text = 'a b';
  pruneWords(l);
  assert.deepEqual(Object.keys(l.words ?? {}), ['0']);
});

test('"Palavra por palavra": TODO efeito altera cada palavra e as palavras entram em sequência', () => {
  // regressão do relato "a maioria das animações não funciona com Palavra por Palavra"
  const base = { ...baseAnimation(), unit: 'word' as const, stagger: 90 };
  const EFFECT_PRESETS = ANIMATION_PRESETS.filter((p) => !['none', 'by-line', 'by-phrase'].includes(p.id));
  assert.ok(EFFECT_PRESETS.length >= 12);
  for (const p of EFFECT_PRESETS) {
    const cfg = applyPreset(p.id, base);
    assert.equal(cfg.unit, 'word', `${p.id}: perdeu a unidade Palavra`);
    assert.ok(cfg.stagger > 0, `${p.id}: sem intervalo entre palavras`);
    const plans = planUnits(cfg, 'enter', 4);
    for (let i = 1; i < plans.length; i++) assert.ok(plans[i].start > plans[i - 1].start, `${p.id}: palavras não entram em sequência`);
    const ease = getEase(cfg.easing);
    const peak = easePeakSpeed(cfg.easing);
    plans.forEach((pl, i) => {
      // no começo de CADA palavra ela tem que estar fora do estado final (invisível, deslocada, escalada ou borrada)
      const s = unitState(pl.cfg, 'enter', 0.25, geo, ease, peak);
      const changed = s.opacity < 0.999 || s.tx !== 0 || s.ty !== 0 || s.scale !== 1 || s.blurX > 0 || s.blurY > 0;
      assert.ok(changed, `${p.id}: a palavra ${i + 1} não muda durante a animação`);
      // e termina exatamente no estado final
      const end = unitState(pl.cfg, 'enter', 1, geo, ease, peak);
      assert.equal(end.opacity, 1);
      assert.equal(end.scale, 1);
      assert.equal(Math.abs(end.tx) + Math.abs(end.ty), 0);
    });
  }
});
