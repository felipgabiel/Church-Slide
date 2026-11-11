import { colorAt, colorEnd, colorFinal, partOf, planColors, type ColorWordPlan } from '../core/anim/colorfx';
import type { ColorFx, TextLayer } from '../core/types';
import { overrideOf, tokenizeText } from '../core/words';

/**
 * Troca de cor no palco (DOM). Vale SÓ para as palavras marcadas (`WordOverride.colorFx`); as outras
 * nunca são tocadas. A conta da cor em cada instante é a MESMA do vídeo exportado (core/anim/colorfx.ts);
 * aqui só se aplica `style.color` nos elementos a cada quadro.
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

/** Plano da camada: palavras marcadas, agrupadas por configuração. */
export function layerColorPlan(layer: TextLayer): Map<number, ColorWordPlan> {
  const words = tokenizeText(layer.text).flatMap((l) => l.tokens.filter((t) => t.kind === 'word'));
  return planColors(words.map((w) => ({ index: w.index, text: w.text, fx: overrideOf(layer, w.index)?.colorFx })));
}

/** Resumo de quais palavras trocam de cor e como (muda quando o usuário marca/desmarca ou edita as cores). */
export function colorSignature(layers: TextLayer[]): string {
  return layers
    .map((l) => `${l.id}:${l.visible ? 1 : 0}:${Object.entries(l.words ?? {}).map(([k, w]) => (w.colorFx ? `${k}=${JSON.stringify(w.colorFx)}` : '')).join(',')}`)
    .join('|');
}

/** A camada precisa de um <span> por letra? (alguma palavra troca de cor letra por letra) */
export function layerNeedsLetters(layer: TextLayer): boolean {
  return Object.values(layer.words ?? {}).some((w) => w.colorFx?.mode === 'letter');
}

function collect(root: HTMLElement, layers: TextLayer[], enterEnd: number): Target[] {
  const out: Target[] = [];
  for (const layer of layers) {
    if (!layer.visible || !layer.words) continue;
    for (const [index, plan] of layerColorPlan(layer)) {
      const el = root.querySelector<HTMLElement>(`[data-lid="${CSS.escape(layer.id)}"][data-w="${index}"]`);
      if (!el) continue;
      const end = colorEnd(plan.fx, plan.parts, enterEnd);
      if (plan.fx.mode === 'letter') {
        el.querySelectorAll<HTMLElement>('.ch').forEach((c, k) => out.push({ el: c, fx: plan.fx, base: getComputedStyle(c).color, i: partOf(plan, k), end }));
      } else {
        out.push({ el, fx: plan.fx, base: getComputedStyle(el).color, i: partOf(plan), end });
      }
    }
  }
  return out;
}

const paint = (t: Target, tMs: number, enterEnd: number) => {
  t.el.style.color = colorAt(t.fx, t.base, t.i, enterEnd, tMs) ?? '';
};

/**
 * Roda a troca de cor. `enterEnd` = quando a entrada termina (ms desde o começo do trecho); o relógio começa
 * junto com a entrada, então o "Começa em" configurado é contado do começo do trecho.
 */
export function startColorRun(root: HTMLElement | null, layers: TextLayer[], enterEnd: number, elapsed = 0): ColorRun | null {
  if (!root) return null;
  const targets = collect(root, layers, enterEnd);
  if (!targets.length) return null;
  const end = Math.max(...targets.map((t) => t.end));
  targets.forEach((t) => paint(t, elapsed, enterEnd)); // já no primeiro quadro
  let raf = 0;
  let stopped = false;
  const t0 = performance.now() - elapsed;
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
export function applyFinalColors(root: HTMLElement | null, layers: TextLayer[]): void {
  if (!root) return;
  // limpa cores de uma pintura anterior (palavra desmarcada não pode ficar colorida)
  root.querySelectorAll<HTMLElement>('[data-w], .ch').forEach((el) => el.style.removeProperty('color'));
  for (const t of collect(root, layers, 0)) t.el.style.color = colorFinal(t.fx, t.base) ?? '';
}
