import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignKey, DEFAULT_BINDINGS, keyToAction, normKey, removeKey, sanitizeBindings, shortcutHelp, type Bindings } from '../src/core/present/shortcuts';

const ev = (key: string, extra: Record<string, unknown> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra }) as unknown as KeyboardEvent;

test('teclas padrão continuam funcionando', () => {
  assert.deepEqual(keyToAction(ev('ArrowRight'), DEFAULT_BINDINGS), { type: 'next' });
  assert.deepEqual(keyToAction(ev(' '), DEFAULT_BINDINGS), { type: 'next' });
  assert.deepEqual(keyToAction(ev('Backspace'), DEFAULT_BINDINGS), { type: 'prev' });
  assert.deepEqual(keyToAction(ev('Escape'), DEFAULT_BINDINGS), { type: 'exit' });
  assert.deepEqual(keyToAction(ev('x'), DEFAULT_BINDINGS), null);
});

test('Caps Lock não quebra os atalhos de letra', () => {
  assert.equal(normKey('B'), 'b');
  assert.deepEqual(keyToAction(ev('B'), DEFAULT_BINDINGS), { type: 'blackout' });
  assert.deepEqual(keyToAction(ev('F'), DEFAULT_BINDINGS), { type: 'fullscreen' });
});

test('1–9 vão direto ao trecho e são fixos', () => {
  assert.deepEqual(keyToAction(ev('1'), DEFAULT_BINDINGS), { type: 'jump', index: 0 });
  assert.deepEqual(keyToAction(ev('9'), DEFAULT_BINDINGS), { type: 'jump', index: 8 });
  assert.equal(keyToAction(ev('0'), DEFAULT_BINDINGS), null);
  const r = assignKey(DEFAULT_BINDINGS, 'blackout', '5');
  assert.equal(r.ok, false);
});

test('Ctrl/Alt/⌘ e campos de texto são ignorados', () => {
  assert.equal(keyToAction(ev('ArrowRight', { ctrlKey: true }), DEFAULT_BINDINGS), null);
  assert.equal(keyToAction(ev('b', { metaKey: true }), DEFAULT_BINDINGS), null);
  assert.equal(keyToAction(ev(' ', { target: { tagName: 'TEXTAREA' } }), DEFAULT_BINDINGS), null);
});

test('atribuir uma tecla já usada MOVE a tecla e avisa de quem saiu', () => {
  const r = assignKey(DEFAULT_BINDINGS, 'blackout', 'f'); // f era tela cheia
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.stolenFrom, 'fullscreen');
  assert.ok(r.bindings.blackout.includes('f'));
  assert.ok(!r.bindings.fullscreen.includes('f'));
  assert.deepEqual(keyToAction(ev('f'), r.bindings), { type: 'blackout' });
  // o original não é mutado
  assert.ok(DEFAULT_BINDINGS.fullscreen.includes('f'));
});

test('não deixa Próximo/Anterior sem tecla (segurança ao vivo)', () => {
  const only: Bindings = { ...DEFAULT_BINDINGS, next: ['n'] };
  // roubar a única tecla de "próximo" é recusado
  const steal = assignKey(only, 'blackout', 'n');
  assert.equal(steal.ok, false);
  // remover a única tecla também
  assert.equal(removeKey(only, 'next', 'n').ok, false);
  // remover uma de várias é permitido
  assert.ok(removeKey(DEFAULT_BINDINGS, 'next', 'Enter').ok);
});

test('teclas modificadoras/mortas não podem ser atribuídas', () => {
  for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Tab']) assert.equal(assignKey(DEFAULT_BINDINGS, 'replay', k).ok, false, k);
});

test('sanitizeBindings: lixo vira padrão; duplicatas são removidas; ação obrigatória vazia volta ao padrão', () => {
  assert.deepEqual(sanitizeBindings(null), DEFAULT_BINDINGS);
  assert.deepEqual(sanitizeBindings('oi'), DEFAULT_BINDINGS);
  const s = sanitizeBindings({ next: [], prev: ['p', 'p', 7, '5'], blackout: ['p'] });
  assert.deepEqual(s.next, DEFAULT_BINDINGS.next.filter((k) => k !== 'p'));
  assert.deepEqual(s.prev, ['p']); // duplicada, número e dígito reservado descartados
  assert.ok(!s.blackout.includes('p')); // 'p' já pertence a "prev"
});

test('lista de ajuda reflete as teclas atuais', () => {
  const custom = assignKey(DEFAULT_BINDINGS, 'replay', 'q');
  assert.ok(custom.ok);
  if (!custom.ok) return;
  const rows = shortcutHelp(custom.bindings);
  assert.ok(rows.some((r) => r.label === 'Repetir animação' && r.keys.includes('Q')));
  assert.ok(rows.some((r) => r.keys === '1 – 9'));
});
