/**
 * Encaixe magnético ao arrastar (texto no editor e camadas no Estúdio).
 * Perto da borda do slide, da margem segura ou do centro, o objeto "gruda" alinhado a ela; se a pessoa
 * continua arrastando, passa do ímã e o objeto volta a seguir o mouse livremente.
 * Tudo em % do eixo (0–100), para valer em qualquer tamanho de palco.
 */
export type SnapHit = 'start' | 'end' | 'safe-start' | 'safe-end' | 'center' | null;

export interface SnapOptions {
  /** bordas do slide */
  edges?: boolean;
  center?: boolean;
  /** margem segura (em % do eixo); 0 desliga */
  safe?: number;
}

/** Margem segura do telão: a mesma linha tracejada das guias (5% de cada lado). */
export const SAFE_MARGIN = 5;

/**
 * `pos` = centro do objeto, `half` = metade do tamanho dele, `thresh` = alcance do ímã.
 * Devolve a posição (encaixada ou não) e onde encaixou.
 */
export function snapAxis(pos: number, half: number, thresh: number, opts: SnapOptions = {}): { pos: number; hit: SnapHit } {
  const { edges = true, center = true, safe = 0 } = opts;
  const cands: [number, Exclude<SnapHit, null>][] = [];
  if (edges) {
    cands.push([half, 'start'], [100 - half, 'end']);
    if (safe > 0) cands.push([safe + half, 'safe-start'], [100 - safe - half, 'safe-end']);
  }
  if (center) cands.push([50, 'center']);
  let best: { p: number; h: Exclude<SnapHit, null>; d: number } | null = null;
  for (const [p, h] of cands) {
    const d = Math.abs(pos - p);
    if (d < thresh && (!best || d < best.d)) best = { p, h, d };
  }
  return best ? { pos: best.p, hit: best.h } : { pos, hit: null };
}

/** Meia largura/altura da caixa girada (a caixa que de fato ocupa a tela). */
export function rotatedHalf(w: number, h: number, deg: number): { hw: number; hh: number } {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { hw: (w * c + h * s) / 2, hh: (w * s + h * c) / 2 };
}

/** Alcance do ímã, em pixels de tela (igual em palco grande ou pequeno). */
export const SNAP_PX = 12;

/** Preferência global (editor e Estúdio): ímã ligado ou desligado. */
export const SNAP_SETTING = 'snap-enabled';
