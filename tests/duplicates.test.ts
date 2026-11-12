import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDuplicate, numberedName } from '../src/core/duplicates';

const P = (name: string, artist = '', extra: object = {}) => ({ name, artist, isTemplate: false, deletedAt: null, ...extra }) as never;

test('duplicado: mesmo nome e autor, sem ligar para maiúsculas, acentos e espaços', () => {
  const list = [P('Grande é o Senhor', 'Adhemar de Campos'), P('Oceanos', ''), P('Modelo', '', { isTemplate: true }), P('Lixo', '', { deletedAt: 1 })];
  assert.ok(findDuplicate(list, '  grande e o  senhor ', 'adhemar de campos'));
  assert.equal(findDuplicate(list, 'Grande é o Senhor', 'Outro autor'), null, 'autor diferente não é repetido');
  assert.ok(findDuplicate(list, 'oceanos', ''));
  assert.equal(findDuplicate(list, 'Modelo', ''), null, 'modelos não contam');
  assert.equal(findDuplicate(list, 'Lixo', ''), null, 'o que está na lixeira não conta');
});

test('duplicado: nome numerado (1), (2)…', () => {
  assert.equal(numberedName('Oceanos', ['Oceanos']), 'Oceanos (1)');
  assert.equal(numberedName('Oceanos', ['Oceanos', 'Oceanos (1)']), 'Oceanos (2)');
  assert.equal(numberedName('Oceanos (1)', ['Oceanos', 'Oceanos (1)', 'oceanos (2)']), 'Oceanos (3)');
});
