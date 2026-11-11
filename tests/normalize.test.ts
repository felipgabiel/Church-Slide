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

test('projeto antigo com troca de cor no trecho: vira troca de cor em cada palavra (mesmo resultado)', () => {
  const base = normalizeProject({});
  const layer = { ...base.slides[0].layers[0], text: 'vem sobre\nSENHOR', words: { '2': { colorFx: { to: '#ff0000', mode: 'all', delay: 0, duration: 500, stagger: 0 } } } };
  const old = { to: '#00ff00', mode: 'all', delay: 400, duration: 1400, stagger: 0 };
  const p = normalizeProject({ ...base, slides: [{ ...base.slides[0], layers: [layer], animation: { ...base.theme.animation, colorFx: old } }] });
  const l = p.slides[0].layers[0];
  assert.equal(p.slides[0].animation?.colorFx, undefined, 'não fica mais no trecho');
  assert.deepEqual(l.words?.['0']?.colorFx?.colors, ['#00ff00']);
  assert.equal(l.words?.['0']?.colorFx?.delay, 400, 'mantém o tempo antigo (depois da entrada)');
  assert.deepEqual(l.words?.['1']?.colorFx?.colors, ['#00ff00']);
  assert.deepEqual(l.words?.['2']?.colorFx?.colors, ['#ff0000'], 'a palavra que já tinha a sua continua com a dela');
  // tema com troca de cor vale para trechos que usam a animação do tema
  const q = normalizeProject({ ...base, theme: { ...base.theme, animation: { ...base.theme.animation, colorFx: old } }, slides: [{ ...base.slides[0], layers: [{ ...layer, words: undefined }], animation: null }] });
  assert.equal(q.theme.animation.colorFx, undefined);
  assert.equal(Object.keys(q.slides[0].layers[0].words ?? {}).length, 3);
  // troca de cor inválida é descartada
  const bad = normalizeProject({ ...base, slides: [{ ...base.slides[0], layers: [layer], animation: { ...base.theme.animation, colorFx: { to: 'banana' } } }] });
  assert.equal(bad.slides[0].layers[0].words?.['0'], undefined);
});
