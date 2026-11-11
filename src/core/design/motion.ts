import type { DesignFill, DesignLayer } from '../types';

/**
 * Movimentos do Estúdio de Fundos como funções PERIÓDICAS da fase do loop (0 → 1).
 * Toda conta usa seno/cosseno de 2π·fase·voltas (voltas inteiras), então o quadro do fim
 * é idêntico ao do começo: o vídeo pode repetir sem emenda.
 */

const TAU = Math.PI * 2;
export const frac = (v: number) => v - Math.floor(v);

export interface LayerState {
  /** deslocamento em % da altura */
  dx: number;
  dy: number;
  scale: number;
  /** giro extra em graus */
  rot: number;
  /** avanço do padrão (listras, ondas), em períodos inteiros */
  flow: number;
  /** multiplicador de opacidade */
  alpha: number;
  /** cintilar: profundidade (0–1) e fase, para partículas acenderem cada uma no seu tempo */
  twinkle: { depth: number; q: number } | null;
  fill: DesignFill;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const to2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

/** Mistura duas cores #rrggbb (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return `#${to2(p[0] + (q[0] - p[0]) * t)}${to2(p[1] + (q[1] - p[1]) * t)}${to2(p[2] + (q[2] - p[2]) * t)}`;
}

/** Cor na posição `pos` (0–1) de uma paleta FECHADA (a última cor volta para a primeira). */
export function paletteAt(colors: string[], pos: number): string {
  const n = colors.length;
  if (n === 0) return '#ffffff';
  if (n === 1) return colors[0];
  const x = frac(pos) * n;
  const i = Math.floor(x) % n;
  return mixHex(colors[i], colors[(i + 1) % n], x - Math.floor(x));
}

/** Estado animado de uma camada na fase `p` do loop (0 ≤ p < 1). */
export function layerState(layer: DesignLayer, p: number): LayerState {
  const st: LayerState = { dx: 0, dy: 0, scale: 1, rot: 0, flow: 0, alpha: 1, twinkle: null, fill: layer.fill };
  for (const m of layer.motions) {
    const q = p * m.cycles;
    const a = m.amount / 100;
    switch (m.kind) {
      case 'drift':
        st.dx += a * 12 * Math.sin(TAU * q);
        st.dy += a * 6 * Math.sin(2 * TAU * q);
        break;
      case 'breathe': {
        const s = 0.5 - 0.5 * Math.cos(TAU * q);
        st.scale *= 1 + 0.22 * a * s;
        st.alpha *= 1 - 0.3 * a * (1 - s);
        break;
      }
      case 'spin':
        st.rot += 360 * q;
        break;
      case 'flow':
        st.flow += q;
        break;
      case 'twinkle':
        st.twinkle = { depth: a, q };
        if (layer.kind !== 'particles') st.alpha *= 1 - 0.7 * a * (0.5 + 0.5 * Math.cos(TAU * q));
        break;
      case 'colors': {
        const pal = m.colors && m.colors.length >= 2 ? m.colors : null;
        if (!pal) break;
        const k = st.fill.stops.length;
        st.fill = {
          ...st.fill,
          stops: st.fill.stops.map((s, i) => ({ ...s, color: mixHex(s.color, paletteAt(pal, q + i / Math.max(1, k)), a) })),
        };
        break;
      }
    }
  }
  return st;
}

/** Brilho de uma partícula (0–1) no cintilar: cada uma com a sua fase. */
export function twinkleAlpha(tw: LayerState['twinkle'], seed: number): number {
  if (!tw) return 1;
  return 1 - 0.85 * tw.depth * (0.5 + 0.5 * Math.cos(TAU * (tw.q + seed)));
}

/** Gerador pseudoaleatório determinístico (mesma semente = mesmos números, no editor e no vídeo). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
