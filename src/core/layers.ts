import type { TextLayer, WordOverride } from './types';
import { tokenizeText } from './words';

/**
 * Operações puras sobre camadas e palavras: tirar uma palavra do texto, separar uma linha,
 * mudar a ordem das camadas. O editor usa estas funções para "separar", "excluir" e "duplicar".
 * Os ajustes por palavra (`layer.words`) são indexados pela POSIÇÃO da palavra no texto, por isso
 * toda remoção também reajusta os índices que vêm depois.
 */

type WordMap = Record<string, WordOverride>;

const nonEmpty = (m: WordMap): WordMap | undefined => (Object.keys(m).length ? m : undefined);

/** Texto da palavra na posição `index` (ou '' se não existir). */
export function wordAt(text: string, index: number): string {
  for (const l of tokenizeText(text)) for (const t of l.tokens) if (t.kind === 'word' && t.index === index) return t.text;
  return '';
}

/** Número da linha (0 = primeira) que contém a palavra, ou -1. */
export function lineOfWord(text: string, index: number): number {
  return tokenizeText(text).findIndex((l) => l.count > 0 && index >= l.first && index < l.first + l.count);
}

/**
 * Tira a palavra do texto. Leva junto um espaço vizinho; se a linha ficar vazia, a linha some
 * (sem deixar uma linha em branco no lugar).
 */
export function removeWordFromText(text: string, index: number): string {
  const out: string[] = [];
  for (const l of tokenizeText(text)) {
    const inside = l.count > 0 && index >= l.first && index < l.first + l.count;
    if (!inside) {
      out.push(l.tokens.map((t) => t.text).join(''));
      continue;
    }
    const toks = [...l.tokens];
    const at = toks.findIndex((t) => t.kind === 'word' && t.index === index);
    let from = at;
    let to = at + 1;
    if (toks[to]?.kind === 'space') to++;
    else if (at > 0 && toks[at - 1].kind === 'space') from--;
    toks.splice(from, to - from);
    if (toks.some((t) => t.kind === 'word')) out.push(toks.map((t) => t.text).join(''));
  }
  return out.join('\n');
}

/** Depois de remover a palavra `index`, as seguintes andam uma posição para trás. */
export function shiftWordsAfterRemoval(words: WordMap | undefined, index: number, removed = 1): WordMap | undefined {
  if (!words) return undefined;
  const out: WordMap = {};
  for (const [k, v] of Object.entries(words)) {
    const n = Number(k);
    if (n < index) out[k] = v;
    else if (n >= index + removed) out[String(n - removed)] = v;
  }
  return nonEmpty(out);
}

/** Remove a palavra da camada (texto e ajustes). */
export function removeWord(layer: TextLayer, index: number): void {
  layer.text = removeWordFromText(layer.text, index);
  const w = shiftWordsAfterRemoval(layer.words, index);
  if (w) layer.words = w;
  else delete layer.words;
}

export interface LineCut {
  /** texto da linha retirada */
  text: string;
  /** ajustes das palavras da linha, já com índices a partir de 0 */
  words?: WordMap;
  /** quantidade de palavras na linha */
  count: number;
}

/** Dados da linha `lineIdx` (sem alterar a camada). */
export function readLine(layer: TextLayer, lineIdx: number): LineCut | null {
  const l = tokenizeText(layer.text)[lineIdx];
  if (!l || l.count === 0) return null;
  const words: WordMap = {};
  for (let i = 0; i < l.count; i++) {
    const ov = layer.words?.[String(l.first + i)];
    if (ov) words[String(i)] = ov;
  }
  return { text: l.tokens.map((t) => t.text).join('').trim(), words: nonEmpty(words), count: l.count };
}

/** Remove a linha inteira da camada (texto e ajustes). */
export function removeLine(layer: TextLayer, lineIdx: number): void {
  const lines = tokenizeText(layer.text);
  const l = lines[lineIdx];
  if (!l) return;
  const rest = lines.filter((_, i) => i !== lineIdx).map((x) => x.tokens.map((t) => t.text).join(''));
  layer.text = rest.join('\n');
  const w = shiftWordsAfterRemoval(layer.words, l.first, l.count);
  if (w) layer.words = w;
  else delete layer.words;
}

export type LayerMove = 'up' | 'down' | 'front' | 'back';

/**
 * Muda a ordem de empilhamento. A ordem do array é de baixo para cima: o último fica na frente.
 * Devolve o mesmo array se nada mudar.
 */
export function reorderLayers<T extends { id: string }>(layers: T[], id: string, how: LayerMove): T[] {
  const from = layers.findIndex((l) => l.id === id);
  if (from < 0) return layers;
  const to = how === 'up' ? from + 1 : how === 'down' ? from - 1 : how === 'front' ? layers.length - 1 : 0;
  const clamped = Math.max(0, Math.min(layers.length - 1, to));
  if (clamped === from) return layers;
  const out = layers.slice();
  const [item] = out.splice(from, 1);
  out.splice(clamped, 0, item);
  return out;
}

/** Pode subir/descer? (para desativar itens do menu) */
export function canMoveLayer(layers: { id: string }[], id: string, how: LayerMove): boolean {
  return reorderLayers(layers, id, how) !== layers;
}

/* ------------------------------------------------------------------ */
/* Duplicar, soltar do texto, copiar camada                             */
/* ------------------------------------------------------------------ */

/** Depois de INSERIR `count` palavras a partir da posição `at`, as que estavam em `at` ou depois andam para a frente. */
export function shiftWordsAfterInsert(words: WordMap | undefined, at: number, count = 1): WordMap | undefined {
  if (!words) return undefined;
  const out: WordMap = {};
  for (const [k, v] of Object.entries(words)) {
    const n = Number(k);
    out[n >= at ? String(n + count) : k] = v;
  }
  return nonEmpty(out);
}

/** Repete a palavra logo depois dela (na mesma linha), com os mesmos ajustes. */
export function duplicateWord(layer: TextLayer, index: number): void {
  const lines = tokenizeText(layer.text);
  const li = lines.findIndex((l) => l.count > 0 && index >= l.first && index < l.first + l.count);
  if (li < 0) return;
  const toks = [...lines[li].tokens];
  const at = toks.findIndex((t) => t.kind === 'word' && t.index === index);
  const word = toks[at].text;
  toks.splice(at + 1, 0, { kind: 'space', text: ' ', index: -1 }, { kind: 'word', text: word, index: -1 });
  layer.text = lines.map((l, i) => (i === li ? toks : l.tokens).map((t) => t.text).join('')).join('\n');
  const own = layer.words?.[String(index)];
  const shifted = shiftWordsAfterInsert(layer.words, index + 1) ?? {};
  if (own) shifted[String(index + 1)] = structuredClone(own);
  if (Object.keys(shifted).length) layer.words = shifted;
  else delete layer.words;
}

/** Repete a linha inteira logo abaixo dela, com os mesmos ajustes. */
export function duplicateLine(layer: TextLayer, lineIdx: number): void {
  const lines = tokenizeText(layer.text);
  const l = lines[lineIdx];
  if (!l || l.count === 0) return;
  const texts = lines.map((x) => x.tokens.map((t) => t.text).join(''));
  texts.splice(lineIdx + 1, 0, texts[lineIdx]);
  layer.text = texts.join('\n');
  const shifted = shiftWordsAfterInsert(layer.words, l.first + l.count, l.count) ?? {};
  for (let i = 0; i < l.count; i++) {
    const own = layer.words?.[String(l.first + i)];
    if (own) shifted[String(l.first + l.count + i)] = structuredClone(own);
  }
  if (Object.keys(shifted).length) layer.words = shifted;
  else delete layer.words;
}

/** Dados da palavra `index` (sem alterar a camada). */
export function readWord(layer: TextLayer, index: number): LineCut | null {
  const text = wordAt(layer.text, index);
  if (!text) return null;
  const ov = layer.words?.[String(index)];
  return { text, words: ov ? { '0': structuredClone(ov) } : undefined, count: 1 };
}

/** Índice (depois de remover `removed` palavras a partir de `index`) de uma palavra que ficou; -1 se foi removida. */
export function indexAfterRemoval(old: number, index: number, removed = 1): number {
  if (old < index) return old;
  if (old >= index + removed) return old - removed;
  return -1;
}

export const layerIsEmpty = (layer: TextLayer): boolean => layer.text.trim() === '';

const shortName = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 20 ? `${t.slice(0, 19)}…` : t || 'Texto';
};

/**
 * Camada nova a partir de uma palavra/linha tirada de `src`.
 * O tamanho passa a ser o da própria camada (`geom.fontSize`, já medido na tela); os tamanhos relativos das
 * palavras ficam em relação à maior delas, então o texto continua com as mesmas proporções.
 */
export function detachedLayer(src: TextLayer, cut: LineCut, geom: { x: number; y: number; fontSize: number }, id: string): TextLayer {
  let biggest = 1;
  let any = false;
  for (let i = 0; i < cut.count; i++) {
    const s = cut.words?.[String(i)]?.style?.scale ?? 1;
    biggest = any ? Math.max(biggest, s) : s;
    any = true;
  }
  const words: WordMap = {};
  for (const [k, v] of Object.entries(cut.words ?? {})) {
    const ov: WordOverride = structuredClone(v);
    if (ov.style?.scale !== undefined) {
      const rel = ov.style.scale / biggest;
      if (Math.abs(rel - 1) < 1e-6) delete ov.style.scale;
      else ov.style.scale = Math.round(rel * 1000) / 1000;
      if (!Object.keys(ov.style).length) delete ov.style;
    }
    if (ov.style || ov.anim || ov.colorFx) words[k] = ov;
  }
  const style = { ...structuredClone(src.style), x: geom.x, y: geom.y, fontSize: geom.fontSize, autoWidth: true, equalize: false, align: 'center' as const };
  return { id, role: 'free', name: shortName(cut.text), text: cut.text, visible: true, style, ...(nonEmpty(words) ? { words: nonEmpty(words) } : {}) };
}

/** Cópia da camada, um pouco deslocada para o usuário perceber que existe. */
export function copyLayer(src: TextLayer, id: string): TextLayer {
  const c = structuredClone(src);
  c.id = id;
  c.name = src.name.endsWith(' cópia') ? src.name : `${src.name} cópia`;
  c.style.x = Math.min(100, Math.round((src.style.x + 4) * 10) / 10);
  c.style.y = Math.min(100, Math.round((src.style.y + 6) * 10) / 10);
  if (src.role === 'lyrics') c.role = 'free'; // só a camada original é "a letra" do trecho
  return c;
}
