import type { ColorFx } from '../types';
import { clamp } from '../util';

/**
 * Troca de cor ao longo do tempo. Funções PURAS: o telão (DOM) e o vídeo (canvas) usam as mesmas,
 * então a cor em cada instante é idêntica no editor e no arquivo exportado.
 */

/* ----------------------------- cores ----------------------------- */

export type RGBA = [number, number, number, number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

/** Lê `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` e `rgba()`. Devolve null se não entender. */
export function parseColor(input: string): RGBA | null {
  const c = input.trim();
  const h = HEX.exec(c);
  if (h) {
    let x = h[1];
    if (x.length <= 4) x = [...x].map((d) => d + d).join('');
    const n = (i: number) => parseInt(x.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), x.length === 8 ? n(6) / 255 : 1];
  }
  const f = FUNC.exec(c);
  if (f) {
    const a = f[4] === undefined ? 1 : f[4].endsWith('%') ? parseFloat(f[4]) / 100 : parseFloat(f[4]);
    return [clamp(+f[1], 0, 255), clamp(+f[2], 0, 255), clamp(+f[3], 0, 255), clamp(a, 0, 1)];
  }
  return null;
}

/** Mistura `a` → `b` (k de 0 a 1) em RGB. Cor que não for entendida é tratada como a outra. */
export function mixColor(a: string, b: string, k: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa && !pb) return a;
  if (!pa) return b;
  if (!pb) return a;
  const t = clamp(k, 0, 1);
  const m = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  const alpha = pa[3] + (pb[3] - pa[3]) * t;
  return alpha >= 0.999 ? `rgb(${m(0)}, ${m(1)}, ${m(2)})` : `rgba(${m(0)}, ${m(1)}, ${m(2)}, ${alpha.toFixed(3)})`;
}

/* ----------------------------- tempo ----------------------------- */

/** Começo (ms) e duração da parte `i` (0 = primeira palavra/letra). `enterEnd` = fim da animação de entrada. */
export function colorTiming(fx: ColorFx, i: number, enterEnd: number): { start: number; duration: number } {
  const step = fx.mode === 'all' ? 0 : Math.max(0, fx.stagger);
  return { start: enterEnd + Math.max(0, fx.delay) + i * step, duration: Math.max(1, fx.duration) };
}

/** Suaviza o começo e o fim (smoothstep). */
const smooth = (p: number) => p * p * (3 - 2 * p);

/**
 * Quanto a parte `i` já está na cor final (0 = cor original, 1 = cor final).
 * Com `back`, a cor vai até o pico e volta: 0 → 1 → 0 (brilho que passa).
 */
export function colorAmount(fx: ColorFx, i: number, enterEnd: number, tMs: number): number {
  const { start, duration } = colorTiming(fx, i, enterEnd);
  const p = clamp((tMs - start) / duration, 0, 1);
  if (fx.back) return Math.sin(Math.PI * smooth(p));
  return smooth(p);
}

/** Instante (ms) em que a última parte termina de trocar. */
export function colorEnd(fx: ColorFx, parts: number, enterEnd: number): number {
  const last = Math.max(0, parts - 1);
  const t = colorTiming(fx, fx.mode === 'all' ? 0 : last, enterEnd);
  return t.start + t.duration;
}

/** Cor da parte `i` no instante `t`, ou null enquanto ainda não começou (usa a cor original). */
export function colorAt(fx: ColorFx, base: string, i: number, enterEnd: number, tMs: number): string | null {
  const k = colorAmount(fx, i, enterEnd, tMs);
  if (k <= 0) return fx.from ?? null; // ainda não começou (ou voltou ao início): cor inicial
  return mixColor(fx.from ?? base, fx.to, k);
}

/** Cor depois que tudo terminou (no modo "pulso" volta à original → null). */
export function colorFinal(fx: ColorFx, base: string): string | null {
  return fx.back ? (fx.from ?? null) : mixColor(fx.from ?? base, fx.to, 1);
}

/** Quantas partes (palavras ou letras) o modo tem num texto com estas palavras. */
export function colorPartCount(mode: ColorFx['mode'], words: string[]): number {
  if (mode === 'all') return 1;
  if (mode === 'word') return words.length;
  return words.reduce((n, w) => n + Array.from(w).length, 0);
}

/** Posição (0,1,2…) da palavra/letra dentro do efeito: junto = 0; por palavra = nº da palavra; por letra = nº da letra no texto. */
export function colorPartIndex(mode: ColorFx['mode'], words: string[], wordIdx: number, letterIdx = 0): number {
  if (mode === 'all') return 0;
  if (mode === 'word') return wordIdx;
  let before = 0;
  for (let w = 0; w < wordIdx; w++) before += Array.from(words[w]).length;
  return before + letterIdx;
}

/* ------------------------- validação / padrões ------------------------- */

export const DEFAULT_COLOR_FX: ColorFx = { to: '#4ade80', mode: 'all', delay: 400, duration: 1400, stagger: 0 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida uma troca de cor vinda do armazenamento/arquivo importado. */
export function sanitizeColorFx(raw: unknown): ColorFx | undefined {
  if (!isObj(raw) || typeof raw.to !== 'string' || !parseColor(raw.to)) return undefined;
  const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d);
  const fx: ColorFx = {
    to: raw.to,
    mode: raw.mode === 'word' || raw.mode === 'letter' ? raw.mode : 'all',
    delay: num(raw.delay, 0, 20000, DEFAULT_COLOR_FX.delay),
    duration: num(raw.duration, 50, 20000, DEFAULT_COLOR_FX.duration),
    stagger: num(raw.stagger, 0, 3000, 0),
  };
  if (typeof raw.from === 'string' && parseColor(raw.from)) fx.from = raw.from;
  if (raw.back === true) fx.back = true;
  return fx;
}
