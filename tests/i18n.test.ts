import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { tr } from '../src/core/i18n';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';

const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

test('tradução: sem idioma escolhido (fora do navegador) fica em português e troca {0}, {1}', () => {
  assert.equal(tr('Novo louvor'), 'Novo louvor');
  assert.equal(tr('Trecho {0} de {1}', 2, 5), 'Trecho 2 de 5');
  assert.equal(tr('texto que não está no dicionário'), 'texto que não está no dicionário');
});

test('tradução: inglês e espanhol mantêm os mesmos marcadores {n} do texto original', () => {
  for (const [name, dict] of [['en', en], ['es', es]] as const) {
    for (const [k, v] of Object.entries(dict)) {
      assert.equal(holes(v), holes(k), `${name}: "${k}" → "${v}"`);
      assert.ok(v.trim(), `${name}: tradução vazia para "${k}"`);
    }
  }
});

test('tradução: todo texto com cara de português no código passa por tr() e tem versão em inglês', () => {
  // varre as chamadas tr('...') do código: as que não são nomes próprios precisam existir no dicionário inglês
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f) && !p.includes('i18n')) files.push(p);
    }
  };
  walk(join(import.meta.dirname, '../src'));
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
      if (/[ãõçáéíóúâêà]|\b(de|do|da|e|o|a|um|uma|para|com|não)\b/i.test(key) && !(key in en)) missing.push(key);
    }
  }
  assert.deepEqual(missing, []);
});
