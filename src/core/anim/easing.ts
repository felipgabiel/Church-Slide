import type { EasingName } from '../types';

/** Curvas de movimento como cubic-bezier (mesma semântica do CSS). */
export const EASING_CURVES: Record<EasingName, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  'ease-out': [0.22, 1, 0.36, 1],
  'ease-in-out': [0.65, 0, 0.35, 1],
  smooth: [0.4, 0, 0.2, 1],
  back: [0.34, 1.56, 0.64, 1],
  expo: [0.16, 1, 0.3, 1],
};

export const EASING_LABELS: Record<EasingName, string> = {
  linear: 'Linear',
  'ease-out': 'Saída suave',
  'ease-in-out': 'Entrada e saída',
  smooth: 'Padrão',
  back: 'Elástica leve',
  expo: 'Rápida e suave',
};

export type EaseFn = (t: number) => number;

/** Cria a função de easing a partir de um cubic-bezier (Newton + bisseção). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-7) break;
    }
    return t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveT(x));
  };
}

const cache = new Map<EasingName, EaseFn>();
export function getEase(name: EasingName): EaseFn {
  let fn = cache.get(name);
  if (!fn) {
    const c = EASING_CURVES[name] ?? EASING_CURVES['ease-out'];
    fn = cubicBezier(c[0], c[1], c[2], c[3]);
    cache.set(name, fn);
  }
  return fn;
}

/** Derivada numérica da curva: velocidade relativa do movimento em `p`. */
export function easeSpeed(ease: EaseFn, p: number): number {
  const h = 0.01;
  const a = Math.max(0, p - h);
  const b = Math.min(1, p + h);
  return Math.abs(ease(b) - ease(a)) / (b - a);
}

const peakCache = new Map<EasingName, number>();
/** Maior velocidade da curva — usada para normalizar o Motion Blur entre 0 e 1. */
export function easePeakSpeed(name: EasingName): number {
  let peak = peakCache.get(name);
  if (peak === undefined) {
    const ease = getEase(name);
    peak = 0.0001;
    for (let i = 0; i <= 100; i++) peak = Math.max(peak, easeSpeed(ease, i / 100));
    peakCache.set(name, peak);
  }
  return peak;
}
