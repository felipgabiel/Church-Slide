import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newProject, normalizeProject } from '../src/core/defaults';
import { applyImpactToLayer, DEFAULT_IMPACT } from '../src/core/impact';
import { sanitizeWords } from '../src/core/words';

/** Regressão: normalizeProject descartava `words` e `autoLayout`, então todo ajuste por palavra sumia ao reabrir. */
test('ajustes por palavra sobrevivem a salvar → carregar (JSON + normalizeProject)', () => {
  const p = newProject('Teste');
  const layer = p.slides[0].layers[0];
  layer.text = 'Vem sobre mim, Senhor';
  applyImpactToLayer(layer, DEFAULT_IMPACT);
  p.autoLayout = 'impact';

  const loaded = normalizeProject(JSON.parse(JSON.stringify(p)));
  const l = loaded.slides[0].layers[0];
  assert.equal(l.text, 'Vem sobre mim,\nSenhor');
  assert.deepEqual(l.words, layer.words, 'words perdido na normalização');
  assert.equal(l.words?.['3']?.style?.textCase, 'upper');
  assert.ok(l.words?.['3']?.anim, 'animação da palavra perdida');
  assert.equal(loaded.autoLayout, 'impact');
});

test('sanitizeWords descarta lixo e limita valores', () => {
  assert.equal(sanitizeWords(null), undefined);
  assert.equal(sanitizeWords('x'), undefined);
  assert.equal(sanitizeWords({ a: { style: { scale: 2 } } }), undefined, 'chave não numérica');
  assert.equal(sanitizeWords({ '0': { style: { scale: 'grande', color: 5 } } }), undefined, 'tipos errados');
  const ok = sanitizeWords({ '1': { style: { scale: 99, weight: 50, textCase: 'upper', evil: 1 }, anim: { enter: { fade: true, zoom: 'sideways' }, delay: -5 } } });
  assert.deepEqual(ok, { '1': { style: { scale: 10, weight: 100, textCase: 'upper' }, anim: { enter: { fade: true, slide: false, blur: false, zoom: 'none' }, delay: 0 } } });
});

test('projeto sem ajustes continua sem a chave words', () => {
  const p = normalizeProject(JSON.parse(JSON.stringify(newProject('X'))));
  assert.equal('words' in p.slides[0].layers[0], false);
  assert.equal('autoLayout' in p, false);
});

test('troca de cor inválida vinda de arquivo é descartada; válida é mantida', () => {
  const base = normalizeProject({});
  const mk = (colorFx: unknown) =>
    normalizeProject({ ...base, slides: [{ ...base.slides[0], animation: { ...base.theme.animation, colorFx } }], theme: { ...base.theme, animation: { ...base.theme.animation, colorFx } } });
  const bad = mk({ to: 'banana', mode: 'all' });
  assert.equal(bad.slides[0].animation?.colorFx, undefined);
  assert.equal(bad.theme.animation.colorFx, undefined);
  const ok = mk({ to: '#00ff00', mode: 'letter', delay: -5, duration: 999999, stagger: 10 });
  assert.equal(ok.slides[0].animation?.colorFx?.mode, 'letter');
  assert.equal(ok.slides[0].animation?.colorFx?.delay, 0); // limitado à faixa
  assert.equal(ok.theme.animation.colorFx?.duration, 20000);
});
