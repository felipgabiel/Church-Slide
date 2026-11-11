import { colorAt, colorEnd, colorFinal, colorPartCount, colorPartIndex } from '../core/anim/colorfx';
import type { ColorFx, TextLayer } from '../core/types';
import { overrideOf, tokenizeText } from '../core/words';

/**
 * Troca de cor do texto no palco (DOM). A conta da cor em cada instante é a MESMA do vídeo exportado
 * (core/anim/colorfx.ts); aqui só se aplica `style.color` nos elementos a cada quadro.
 */

interface Target {
  el: HTMLElement;
  fx: ColorFx;
  base: string;
  i: number;
  end: number;
}

export interface ColorRun {
  cancel(): void;
}

/** A camada precisa de um <span> por letra? (alguma troca de cor "por letra" vale para ela) */
export function layerNeedsLetters(layer: TextLayer, layerFx: ColorFx | null | undefined): boolean {
  if (layerFx?.mode === 'letter') return true;
  return Object.values(layer.words ?? {}).some((w) => w.colorFx?.mode === 'letter');
}

function collect(root: HTMLElement, layers: TextLayer[], layerFx: ColorFx | null | undefined, enterEnd: number): Target[] {
  const out: Target[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    const words = tokenizeText(layer.text).flatMap((l) => l.tokens.filter((t) => t.kind === 'word'));
    const texts = words.map((w) => w.text);
    words.forEach((w, wi) => {
      const fx = overrideOf(layer, w.index)?.colorFx ?? layerFx;
      if (!fx) return;
      const el = root.querySelector<HTMLElement>(`[data-lid="${CSS.escape(layer.id)}"][data-w="${w.index}"]`);
      if (!el) return;
      const parts = colorPartCount(fx.mode, texts);
      const end = colorEnd(fx, parts, enterEnd);
      if (fx.mode === 'letter') {
        const chars = Array.from(el.querySelectorAll<HTMLElement>('.ch'));
        chars.forEach((c, k) => out.push({ el: c, fx, base: getComputedStyle(c).color, i: colorPartIndex('letter', texts, wi, k), end }));
      } else {
        out.push({ el, fx, base: getComputedStyle(el).color, i: colorPartIndex(fx.mode, texts, wi), end });
      }
    });
  }
  return out;
}

const paint = (t: Target, tMs: number, enterEnd: number) => {
  t.el.style.color = colorAt(t.fx, t.base, t.i, enterEnd, tMs) ?? '';
};

/** Roda a troca de cor depois da entrada. Devolve null se não há nada a fazer. */
export function startColorRun(root: HTMLElement | null, layers: TextLayer[], layerFx: ColorFx | null | undefined, enterEnd: number): ColorRun | null {
  if (!root) return null;
  const targets = collect(root, layers, layerFx, enterEnd);
  if (!targets.length) return null;
  const end = Math.max(...targets.map((t) => t.end));
  // cor inicial já no primeiro quadro (quando o efeito define "de")
  targets.forEach((t) => paint(t, 0, enterEnd));
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const t = now - t0;
    if (t >= end) {
      targets.forEach((x) => (x.el.style.color = colorFinal(x.fx, x.base) ?? ''));
      return;
    }
    targets.forEach((x) => paint(x, t, enterEnd));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return {
    cancel() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}

/** Estado final (miniaturas e telas estáticas): já na cor de chegada. */
export function applyFinalColors(root: HTMLElement | null, layers: TextLayer[], layerFx: ColorFx | null | undefined): void {
  if (!root) return;
  for (const t of collect(root, layers, layerFx, 0)) t.el.style.color = colorFinal(t.fx, t.base) ?? '';
}
