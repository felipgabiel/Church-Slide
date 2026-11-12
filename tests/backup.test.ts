import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { sanitizeLayer } from '../src/core/design/model';
import { buildZip } from '../src/core/export/zip';
import { readZip } from '../src/core/storage/backup';

test('backup: o .zip gravado pelo app é lido de volta, arquivo por arquivo (nomes com acento)', async () => {
  const enc = new TextEncoder();
  const zip = await buildZip([
    { name: 'church-slide-backup.json', data: enc.encode('{"ok":true}') },
    { name: 'media/m_abc.mp4', data: new Blob([new Uint8Array([1, 2, 3, 4, 5])]) },
    { name: 'louvor é.txt', data: enc.encode('Santo') },
  ]);
  const files = await readZip(zip);
  assert.deepEqual([...files.keys()], ['church-slide-backup.json', 'media/m_abc.mp4', 'louvor é.txt']);
  assert.equal(await (await files.get('church-slide-backup.json')!()).text(), '{"ok":true}');
  assert.deepEqual([...new Uint8Array(await (await files.get('media/m_abc.mp4')!()).arrayBuffer())], [1, 2, 3, 4, 5]);
  assert.equal(await (await files.get('louvor é.txt')!()).text(), 'Santo');
});

test('backup: aceita um .zip recompactado (deflate)', async () => {
  // monta um zip "deflate" trocando o método e o conteúdo do que o app grava
  const text = 'Grande é o Senhor e muito digno de louvor '.repeat(20);
  const raw = new TextEncoder().encode(text);
  const comp = deflateRawSync(raw);
  const store = new Uint8Array(await (await buildZip([{ name: 'a.txt', data: raw }])).arrayBuffer());
  const nameLen = 5;
  const local = store.slice(0, 30 + nameLen);
  const dvL = new DataView(local.buffer);
  dvL.setUint16(8, 8, true);
  dvL.setUint32(18, comp.length, true);
  const cdStart = 30 + nameLen + raw.length;
  const cd = store.slice(cdStart, cdStart + 46 + nameLen);
  const dvC = new DataView(cd.buffer);
  dvC.setUint16(10, 8, true);
  dvC.setUint32(20, comp.length, true);
  const end = store.slice(cdStart + 46 + nameLen);
  const dvE = new DataView(end.buffer);
  dvE.setUint32(16, 30 + nameLen + comp.length, true);
  const files = await readZip(new Blob([local, comp, cd, end]));
  assert.equal(await (await files.get('a.txt')!()).text(), text);
});

test('backup: arquivo que não é zip dá erro claro', async () => {
  await assert.rejects(readZip(new Blob(['não sou um zip'])), /backup/);
});

test('camada "Imagem ou vídeo": guarda o arquivo, o tipo e o encaixe; id inválido é descartado', () => {
  const l = sanitizeLayer({ kind: 'media', mediaId: 'm_abc123def456', mediaKind: 'video', fit: 'free', w: 80, h: 45 })!;
  assert.equal(l.kind, 'media');
  assert.equal(l.mediaId, 'm_abc123def456');
  assert.equal(l.mediaKind, 'video');
  assert.equal(l.fit, 'free');
  const bad = sanitizeLayer({ kind: 'media', mediaId: '../x', fit: 'xx' })!;
  assert.equal(bad.mediaId, undefined);
  assert.equal(bad.fit, 'cover');
  assert.equal(bad.mediaKind, 'image');
  assert.equal(sanitizeLayer({ kind: 'shape' })!.mediaId, undefined, 'outras camadas não ganham campos de mídia');
});
