import { sanitizeColorFx } from './anim/colorfx';
import type { ColorFx, TextLayer, WordAnim, WordOverride, WordStyle } from './types';

/**
 * Palavras de uma camada de texto.
 * Uma "palavra" é qualquer sequência sem espaço; a posição conta através das linhas.
 * Funções puras — usadas pelo palco, pelo painel e pelo exportador de vídeo.
 */

export interface Token {
  kind: 'word' | 'space';
  text: string;
  /** posição da palavra no texto da camada (somente kind = 'word') */
  index: number;
}

export interface LineTokens {
  tokens: Token[];
  /** posição da primeira palavra da linha */
  first: number;
  /** quantidade de palavras da linha */
  count: number;
}

export function tokenizeText(text: string): LineTokens[] {
  let next = 0;
  return text.split('\n').map((line) => {
    const first = next;
    const tokens: Token[] = [];
    for (const part of line.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) tokens.push({ kind: 'space', text: part, index: -1 });
      else tokens.push({ kind: 'word', text: part, index: next++ });
    }
    return { tokens, first, count: next - first };
  });
}

export function wordCount(text: string): number {
  const lines = tokenizeText(text);
  return lines.reduce((n, l) => n + l.count, 0);
}

export function wordsOf(text: string): string[] {
  return tokenizeText(text).flatMap((l) => l.tokens.filter((t) => t.kind === 'word').map((t) => t.text));
}

export const overrideOf = (layer: TextLayer, index: number): WordOverride | undefined => layer.words?.[String(index)];

export function hasWordAnim(layers: TextLayer[]): boolean {
  return layers.some((l) => l.visible && l.words && Object.values(l.words).some((w) => !!w.anim));
}

export interface WordTarget {
  layerId: string;
  index: number;
}

/** `null` apaga o campo; `undefined` deixa como está. `anim: null` remove a animação da palavra. */
export type WordPatch = {
  style?: { [K in keyof WordStyle]?: WordStyle[K] | null };
  anim?: WordAnim | null;
  /** troca de cor própria da palavra; `null` remove */
  colorFx?: ColorFx | null;
};

/** Aplica um ajuste em uma palavra (altera `layer`), limpando o que ficar vazio. */
export function patchWord(layer: TextLayer, index: number, patch: WordPatch): void {
  const key = String(index);
  const words = { ...(layer.words ?? {}) };
  const cur: WordOverride = { ...(words[key] ?? {}) };

  if (patch.style) {
    const style: Record<string, unknown> = { ...(cur.style ?? {}) };
    for (const [k, v] of Object.entries(patch.style)) {
      if (v === null) delete style[k];
      else if (v !== undefined) style[k] = v;
    }
    if (Object.keys(style).length) cur.style = style as WordStyle;
    else delete cur.style;
  }
  if (patch.anim === null) delete cur.anim;
  else if (patch.anim) cur.anim = patch.anim;
  if (patch.colorFx === null) delete cur.colorFx;
  else if (patch.colorFx) cur.colorFx = patch.colorFx;

  if (cur.style || cur.anim || cur.colorFx) words[key] = cur;
  else delete words[key];

  if (Object.keys(words).length) layer.words = words;
  else delete layer.words;
}

export function clearWord(layer: TextLayer, index: number): void {
  if (!layer.words) return;
  const words = { ...layer.words };
  delete words[String(index)];
  if (Object.keys(words).length) layer.words = words;
  else delete layer.words;
}

/** Remove ajustes de palavras que não existem mais (texto ficou mais curto). */
export function pruneWords(layer: TextLayer): void {
  if (!layer.words) return;
  const n = wordCount(layer.text);
  const words: Record<string, WordOverride> = {};
  for (const [k, v] of Object.entries(layer.words)) if (Number(k) < n) words[k] = v;
  if (Object.keys(words).length) layer.words = words;
  else delete layer.words;
}

/* ------------------------------------------------------------------ */
/* Validação de dados vindos do armazenamento / de arquivos importados  */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

function cleanStyle(raw: unknown): WordStyle | undefined {
  if (!isObj(raw)) return undefined;
  const s: WordStyle = {};
  if (typeof raw.fontFamily === 'string' && raw.fontFamily) s.fontFamily = raw.fontFamily;
  const scale = num(raw.scale, 0.1, 10);
  if (scale !== undefined) s.scale = scale;
  const weight = num(raw.weight, 100, 900);
  if (weight !== undefined) s.weight = weight;
  if (typeof raw.color === 'string' && raw.color) s.color = raw.color;
  if (typeof raw.italic === 'boolean') s.italic = raw.italic;
  if (raw.textCase === 'none' || raw.textCase === 'upper' || raw.textCase === 'lower') s.textCase = raw.textCase;
  const ls = num(raw.letterSpacing, -50, 200);
  if (ls !== undefined) s.letterSpacing = ls;
  return Object.keys(s).length ? s : undefined;
}

function cleanAnim(raw: unknown): WordAnim | undefined {
  if (!isObj(raw) || !isObj(raw.enter)) return undefined;
  const e = raw.enter;
  const a: WordAnim = {
    enter: {
      fade: e.fade === true,
      slide: e.slide === true,
      blur: e.blur === true,
      zoom: e.zoom === 'in' || e.zoom === 'out' ? e.zoom : 'none',
    },
  };
  const delay = num(raw.delay, 0, 10000);
  if (delay !== undefined) a.delay = delay;
  const duration = num(raw.duration, 1, 10000);
  if (duration !== undefined) a.duration = duration;
  const intensity = num(raw.intensity, 0, 100);
  if (intensity !== undefined) a.intensity = intensity;
  return a;
}

/**
 * Valida os ajustes por palavra de uma camada (projeto salvo, importado ou recebido pelo telão).
 * Mantém só o que o modelo conhece; devolve `undefined` se não sobrar nada.
 */
export function sanitizeWords(raw: unknown): Record<string, WordOverride> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, WordOverride> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{1,4}$/.test(k) || !isObj(v)) continue;
    const style = cleanStyle(v.style);
    const anim = cleanAnim(v.anim);
    const colorFx = sanitizeColorFx(v.colorFx);
    if (style || anim || colorFx) out[k] = { ...(style ? { style } : {}), ...(anim ? { anim } : {}), ...(colorFx ? { colorFx } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}
