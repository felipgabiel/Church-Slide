import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { AnimUnit, TextLayer } from '../core/types';
import { layerCss } from './css';

/** Quebra o texto nas unidades que o motor de animação vai mover (bloco, linhas ou palavras). */
function renderUnits(text: string, unit: AnimUnit): ReactNode {
  if (unit === 'block') {
    return (
      <div data-unit className="u">
        {text}
      </div>
    );
  }
  const lines = text.split('\n');
  if (unit === 'line') {
    return lines.map((l, i) => (
      <div key={i} data-unit className="u">
        {l === '' ? ' ' : l}
      </div>
    ));
  }
  return lines.map((l, i) => (
    <div key={i} className="ln">
      {l === ''
        ? ' '
        : l.split(/(\s+)/).map((tok, j) =>
            tok === '' ? null : /^\s+$/.test(tok) ? (
              tok
            ) : (
              <span key={j} data-unit className="u w">
                {tok}
              </span>
            ),
          )}
    </div>
  ));
}

interface Props {
  layer: TextLayer;
  unit: AnimUnit;
  /** 0–100: flutuação contínua (apenas ao vivo) */
  float?: number;
}

/**
 * Ajuste automático: se o texto não cabe, reduz a fonte (variável CSS --fit)
 * em poucas iterações. Evita letra "vazando" da tela durante o culto.
 */
function useAutoFit(ref: RefObject<HTMLDivElement | null>, deps: unknown[], enabled: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stage = el.closest('.stage') as HTMLElement | null;
    if (!stage) return;
    const run = () => {
      if (!enabled) {
        el.style.removeProperty('--fit');
        return;
      }
      let fit = 1;
      for (let i = 0; i < 5; i++) {
        el.style.setProperty('--fit', String(fit));
        const maxH = stage.clientHeight * 0.92;
        const h = el.offsetHeight;
        const overflowW = el.scrollWidth > el.clientWidth + 1;
        if (h <= maxH && !overflowW) break;
        let factor = h > maxH ? Math.max(0.5, (maxH / h) * 0.98) : 1;
        if (overflowW) factor = Math.min(factor, Math.max(0.5, (el.clientWidth / el.scrollWidth) * 0.98));
        fit = Math.max(0.3, fit * factor);
      }
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(stage);
    document.fonts?.addEventListener?.('loadingdone', run);
    return () => {
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
}

export const TextLayerView = memo(function TextLayerView({ layer, unit, float = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const s = layer.style;
  useAutoFit(ref, [layer.text, s.fontSize, s.width, s.lineHeight, s.letterSpacing, s.fontFamily, s.bold, s.italic, s.uppercase, unit], s.autoFit);
  const innerStyle = float > 0 ? ({ '--float': String(float) } as CSSProperties) : undefined;
  return (
    <div ref={ref} className="layer" style={layerCss(s)} data-layer={layer.id}>
      <div className={float > 0 ? 'layer-inner floating' : 'layer-inner'} style={innerStyle}>
        {renderUnits(layer.text, unit)}
      </div>
    </div>
  );
});

export function collectUnits(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('[data-unit]')) : [];
}
