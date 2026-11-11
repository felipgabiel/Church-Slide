/**
 * Conversão de cores CSS para componentes RGBA. Usa o próprio canvas para normalizar qualquer
 * sintaxe aceita pelo navegador (#abc, #aabbcc, #aabbccdd, rgb(), hsl(), nomes…).
 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

let probe: CanvasRenderingContext2D | null = null;
const cache = new Map<string, Rgba>();

export function parseColor(css: string): Rgba {
  const hit = cache.get(css);
  if (hit) return hit;
  if (!probe) probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  // cor inválida mantém o valor anterior: parte de um valor conhecido para detectar isso
  probe.fillStyle = '#010203';
  probe.fillStyle = css;
  const v = String(probe.fillStyle);
  let out: Rgba;
  if (v.startsWith('#')) {
    out = { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16), a: 1 };
  } else {
    const m = v.match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(',').map((s) => parseFloat(s)) : [0, 0, 0, 1];
    out = { r: p[0] ?? 0, g: p[1] ?? 0, b: p[2] ?? 0, a: p[3] ?? 1 };
  }
  cache.set(css, out);
  return out;
}

/** Mesma cor com a opacidade multiplicada por `alpha` (0–1). */
export function rgba(css: string, alpha = 1): string {
  const c = parseColor(css);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${+(c.a * alpha).toFixed(4)})`;
}

/** "transparent" de CSS interpola no espaço pré-multiplicado: no canvas usamos a mesma cor com alfa 0. */
export const clear = (css: string): string => rgba(css, 0);
