import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rotatedHalf, snapAxis } from '../src/core/snap';

test('encaixe: perto da borda gruda alinhado a ela', () => {
  // objeto com 20% de largura (meia = 10): a borda esquerda encosta em 0 quando o centro está em 10
  assert.deepEqual(snapAxis(11.5, 10, 2), { pos: 10, hit: 'start' });
  assert.deepEqual(snapAxis(8.7, 10, 2), { pos: 10, hit: 'start' }); // um pouco para fora ainda gruda
  assert.deepEqual(snapAxis(89.2, 10, 2), { pos: 90, hit: 'end' });
});

test('encaixe: continuar arrastando para fora solta o objeto', () => {
  assert.deepEqual(snapAxis(7, 10, 2), { pos: 7, hit: null });
  assert.deepEqual(snapAxis(94, 10, 2), { pos: 94, hit: null });
});

test('encaixe: centro e opções', () => {
  assert.deepEqual(snapAxis(50.8, 10, 2), { pos: 50, hit: 'center' });
  assert.deepEqual(snapAxis(50.8, 10, 2, { center: false }), { pos: 50.8, hit: null });
  assert.deepEqual(snapAxis(11, 10, 2, { edges: false }), { pos: 11, hit: null });
  // o alvo mais perto vence
  assert.equal(snapAxis(47.5, 46, 2).hit, 'start');
});

test('encaixe: caixa girada ocupa mais espaço', () => {
  const r = rotatedHalf(20, 10, 90);
  assert.ok(Math.abs(r.hw - 5) < 1e-9 && Math.abs(r.hh - 10) < 1e-9);
  assert.deepEqual(rotatedHalf(20, 10, 0), { hw: 10, hh: 5 });
});
