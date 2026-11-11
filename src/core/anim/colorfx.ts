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

/** Instante (ms desde o começo do trecho) em que a troca começa. Nunca antes do fim da entrada. */
export function colorStart(fx: ColorFx, enterEnd: number): number {
  if (fx.start !== undefined) return Math.max(fx.start, enterEnd);
  return enterEnd + Math.max(0, fx.delay ?? 0); // formato antigo: contado depois da entrada
}

/** Começo (ms) e duração da parte `i` (0 = primeira palavra/letra do grupo). */
export function colorTiming(fx: ColorFx, i: number, enterEnd: number): { start: number; duration: number } {
  const step = fx.mode === 'all' ? 0 : Math.max(0, fx.stagger);
  return { start: colorStart(fx, enterEnd) + i * step, duration: Math.max(1, fx.duration) };
}

/** Suaviza o começo e o fim (smoothstep). */
const smooth = (p: number) => p * p * (3 - 2 * p);

/**
 * Quanto a parte `i` já andou na sequência (0 = cor de partida, 1 = última cor).
 * Com `back` vai até o fim e volta: 0 → 1 → 0 (brilho que passa).
 */
export function colorAmount(fx: ColorFx, i: number, enterEnd: number, tMs: number): number {
  const { start, duration } = colorTiming(fx, i, enterEnd);
  const p = clamp((tMs - start) / duration, 0, 1);
  if (fx.back) return Math.sin(Math.PI * smooth(p));
  return smooth(p);
}

/** Instante (ms) em que a última parte termina. */
export function colorEnd(fx: ColorFx, parts: number, enterEnd: number): number {
  const last = Math.max(0, parts - 1);
  const t = colorTiming(fx, fx.mode === 'all' ? 0 : last, enterEnd);
  return t.start + t.duration;
}

/**
 * Cor no ponto `k` (0–1) do caminho partida → cores[0] → cores[1] → … Cada trecho do caminho
 * ocupa a mesma fração do tempo, então a ordem escolhida é sempre respeitada.
 */
export function colorAlong(fx: ColorFx, base: string, k: number): string {
  const path = [fx.from ?? base, ...fx.colors];
  const n = path.length - 1;
  if (n <= 0) return path[0];
  const pos = clamp(k, 0, 1) * n;
  const seg = Math.min(n - 1, Math.floor(pos));
  return mixColor(path[seg], path[seg + 1], pos - seg);
}

/** Cor da parte `i` no instante `t`, ou null enquanto ainda não começou (fica a cor original). */
export function colorAt(fx: ColorFx, base: string, i: number, enterEnd: number, tMs: number): string | null {
  const k = colorAmount(fx, i, enterEnd, tMs);
  if (k <= 0) return fx.from ?? null; // ainda não começou (ou voltou ao início): cor de partida
  return colorAlong(fx, base, k);
}

/** Cor depois que tudo terminou (no "brilho que passa" volta à original → null). */
export function colorFinal(fx: ColorFx, base: string): string | null {
  return fx.back ? (fx.from ?? null) : colorAlong(fx, base, 1);
}

/* ------------------------ grupos de palavras ------------------------ */

/** Chave do grupo: palavras com a MESMA configuração andam juntas (contam a ordem entre si). */
export const colorGroupKey = (fx: ColorFx): string => JSON.stringify(fx);

export interface ColorWordPlan {
  fx: ColorFx;
  /** posição da palavra no grupo ("todas juntas" = 0) */
  part: number;
  /** "letra por letra": quantas letras do grupo vêm antes desta palavra */
  letterBase: number;
  /** quantas partes o grupo tem (para saber quando termina) */
  parts: number;
}

/**
 * Plano da troca de cor de uma camada. Só entram palavras MARCADAS (com `fx`); as outras ficam com a cor
 * original. `words` vem na ordem do texto. Devolve o plano por índice de palavra.
 */
export function planColors(words: { index: number; text: string; fx?: ColorFx }[]): Map<number, ColorWordPlan> {
  const groups = new Map<string, { index: number; text: string; fx: ColorFx }[]>();
  for (const w of words) {
    if (!w.fx) continue;
    const key = colorGroupKey(w.fx);
    const g = groups.get(key) ?? [];
    g.push({ index: w.index, text: w.text, fx: w.fx });
    groups.set(key, g);
  }
  const out = new Map<number, ColorWordPlan>();
  for (const g of groups.values()) {
    const fx = g[0].fx;
    const letters = g.reduce((n, w) => n + Array.from(w.text).length, 0);
    const parts = fx.mode === 'all' ? 1 : fx.mode === 'word' ? g.length : letters;
    let letterBase = 0;
    g.forEach((w, rank) => {
      out.set(w.index, { fx, part: fx.mode === 'word' ? rank : 0, letterBase, parts });
      letterBase += Array.from(w.text).length;
    });
  }
  return out;
}

/** Índice da parte de uma letra (modo "letra por letra") ou da palavra (demais modos). */
export const partOf = (plan: ColorWordPlan, letter = 0): number => (plan.fx.mode === 'letter' ? plan.letterBase + letter : plan.part);

/* ------------------------- validação / padrões ------------------------- */

/** Padrão para quem não quer configurar: começa 2 s depois de o trecho aparecer, 1,5 s para trocar. */
export const DEFAULT_COLOR_FX: ColorFx = { colors: ['#4ade80'], mode: 'all', start: 2000, duration: 1500, stagger: 0 };

/** Cores que uma sequência aceita no máximo (mais que isso vira pisca-pisca). */
export const MAX_COLORS = 8;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida uma troca de cor vinda do armazenamento/arquivo importado (aceita o formato antigo com `to`). */
export function sanitizeColorFx(raw: unknown): ColorFx | undefined {
  if (!isObj(raw)) return undefined;
  const list = Array.isArray(raw.colors) ? raw.colors : typeof raw.to === 'string' ? [raw.to] : [];
  const colors = list.filter((c): c is string => typeof c === 'string' && !!parseColor(c)).slice(0, MAX_COLORS);
  if (!colors.length) return undefined;
  const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d);
  const fx: ColorFx = {
    colors,
    mode: raw.mode === 'word' || raw.mode === 'letter' ? raw.mode : 'all',
    duration: num(raw.duration, 50, 20000, DEFAULT_COLOR_FX.duration),
    stagger: num(raw.stagger, 0, 3000, 0),
  };
  if (typeof raw.start === 'number' && Number.isFinite(raw.start)) fx.start = clamp(raw.start, 0, 60000);
  else fx.delay = num(raw.delay, 0, 20000, 400); // projeto antigo: continua contando depois da entrada
  if (typeof raw.from === 'string' && parseColor(raw.from)) fx.from = raw.from;
  if (raw.back === true) fx.back = true;
  return fx;
}
