import { memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { equalizeScales } from '../core/layout';
import type { AnimUnit, TextLayer } from '../core/types';
import { overrideOf, tokenizeText, type LineTokens } from '../core/words';
import { layerCss, wordCss } from './css';

/**
 * Cada LINHA é um bloco com o próprio tamanho de fonte (`.ln`). Isso resolve dois problemas:
 *  - o espaço entre linhas passa a obedecer de verdade ao controle (antes, a linha herdava o tamanho
 *    da palavra GRANDE e nunca ficava mais baixa que ele, mesmo quando só tinha palavras pequenas);
 *  - o modo "igualar largura" só precisa mudar a escala `--ls` de cada linha.
 * O tamanho do bloco da linha é o da sua palavra MAIOR; as demais usam `escala / maior` em `em`.
 */
function lineBase(layer: TextLayer, line: LineTokens): number {
  let m = 0;
  for (const t of line.tokens) if (t.kind === 'word') m = Math.max(m, overrideOf(layer, t.index)?.style?.scale ?? 1);
  return m || 1;
}

const lineStyle = (m: number): CSSProperties => ({ fontSize: `calc(var(--ls, 1) * ${m}em)` });

/**
 * Palavras como elementos próprios em QUALQUER modo: é o que permite estilizar e
 * selecionar uma palavra (data-lid + data-w) mesmo quando a animação é por frase ou linha.
 * Em modo "word" a própria palavra é a unidade animada.
 */
function renderTokens(layer: TextLayer, line: LineTokens, asUnit: boolean, letters: boolean, base: number): ReactNode[] {
  let prevScale = base;
  return line.tokens.map((tok, j) => {
    if (tok.kind === 'space') {
      // o espaço acompanha o tamanho da palavra anterior (senão, entre palavras pequenas, ficaria enorme)
      return prevScale !== base ? (
        <span key={j} style={{ fontSize: `${prevScale / base}em` }}>
          {tok.text}
        </span>
      ) : (
        tok.text
      );
    }
    const ov = overrideOf(layer, tok.index);
    prevScale = ov?.style?.scale ?? 1;
    const style = ov?.style ? wordCss(ov.style, base) : base !== 1 ? { fontSize: `${1 / base}em` } : undefined;
    const common = { 'data-lid': layer.id, 'data-w': tok.index, 'data-cfx': ov?.colorFx ? JSON.stringify(ov.colorFx) : undefined, style } as const;
    const body = letters
      ? Array.from(tok.text).map((c, k) => (
          <span key={k} className="ch">
            {c}
          </span>
        ))
      : tok.text;
    if (asUnit) {
      return (
        <span key={j} data-unit className="u w" data-anim={ov?.anim ? JSON.stringify(ov.anim) : undefined} {...common}>
          {body}
        </span>
      );
    }
    return (
      <span key={j} className="wd" {...common}>
        {body}
      </span>
    );
  });
}

/** Quebra o texto nas unidades que o motor de animação vai mover (bloco, linhas ou palavras). */
function renderUnits(layer: TextLayer, unit: AnimUnit, letters: boolean): ReactNode {
  const lines = tokenizeText(layer.text);
  if (unit === 'block') {
    return (
      <div data-unit className="u">
        {lines.map((l, i) => {
          const m = lineBase(layer, l);
          return (
            <div key={i} className="ln" data-m={m} style={lineStyle(m)}>
              {l.count === 0 ? ' ' : renderTokens(layer, l, false, letters, m)}
            </div>
          );
        })}
      </div>
    );
  }
  if (unit === 'line') {
    return lines.map((l, i) => {
      const m = lineBase(layer, l);
      return (
        <div key={i} data-unit className="u ln" data-m={m} style={lineStyle(m)}>
          {l.count === 0 ? ' ' : renderTokens(layer, l, false, letters, m)}
        </div>
      );
    });
  }
  return lines.map((l, i) => {
    const m = lineBase(layer, l);
    return (
      <div key={i} className="ln" data-m={m} style={lineStyle(m)}>
        {l.count === 0 ? ' ' : renderTokens(layer, l, true, letters, m)}
      </div>
    );
  });
}

interface Props {
  layer: TextLayer;
  unit: AnimUnit;
  /** 0–100: flutuação contínua (apenas ao vivo) */
  float?: number;
  /** cada letra vira um elemento (troca de cor letra por letra) */
  letters?: boolean;
}

interface FitOptions {
  autoFit: boolean;
  equalize: boolean;
  /** 0–1 */
  minScale: number;
}

/**
 * Ajustes de tamanho que dependem de MEDIR o texto na tela:
 *  1. "Igualar largura": mede a largura natural de cada linha e dá a cada uma a escala `--ls`
 *     para todas ficarem com o mesmo comprimento (ver core/layout.ts).
 *  2. Ajuste automático: se o texto ainda não cabe, reduz tudo (`--fit`) em poucas iterações.
 * As medidas usam offsetWidth/clientHeight, que NÃO sofrem com as transformações da animação —
 * então é seguro recalcular no meio de uma entrada.
 */
function useLayoutFit(ref: RefObject<HTMLDivElement | null>, deps: unknown[], o: FitOptions) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stage = el.closest('.stage') as HTMLElement | null;
    if (!stage) return;
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.ln'));
    const run = () => {
      if (stage.clientHeight === 0 || stage.clientWidth === 0) return; // oculto (ex.: diálogo ainda abrindo)
      el.style.setProperty('--fit', '1');
      if (o.equalize) {
        lines.forEach((l) => l.style.setProperty('--ls', '1'));
        const prev = lines.map((l) => l.style.width);
        lines.forEach((l) => (l.style.width = 'max-content')); // escreve tudo…
        const natural = lines.map((l) => (l.textContent?.trim() ? l.offsetWidth : 0)); // …depois lê tudo
        lines.forEach((l, i) => (l.style.width = prev[i]));
        // linhas com fonte maior (palavra-chave) mandam no comprimento; as demais se ajustam a elas
        const bases = lines.map((l) => Number(l.dataset.m) || 1);
        const scales = equalizeScales(natural, { blockWidth: el.clientWidth * 0.998, minScale: o.minScale, bases });
        lines.forEach((l, i) => l.style.setProperty('--ls', String(Math.round(scales[i] * 10000) / 10000)));
      } else {
        lines.forEach((l) => l.style.removeProperty('--ls'));
      }
      if (!o.autoFit) {
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
  }, [...deps, o.autoFit, o.equalize, o.minScale]);
}

export const TextLayerView = memo(function TextLayerView({ layer, unit, float = 0, letters = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const s = layer.style;
  useLayoutFit(ref, [layer.text, layer.words, s.fontSize, s.width, s.autoWidth, s.lineHeight, s.letterSpacing, s.fontFamily, s.bold, s.italic, s.uppercase, unit, letters], {
    autoFit: s.autoFit,
    equalize: s.equalize && !s.autoWidth,
    minScale: Math.max(5, Math.min(100, s.equalizeMin ?? 30)) / 100,
  });
  const innerStyle = float > 0 ? ({ '--float': String(float) } as CSSProperties) : undefined;
  return (
    <div ref={ref} className="layer" style={layerCss(s)} data-layer={layer.id} data-eq={s.equalize && !s.autoWidth ? '1' : undefined}>
      <div className={float > 0 ? 'layer-inner floating' : 'layer-inner'} style={innerStyle}>
        {renderUnits(layer, unit, letters)}
      </div>
    </div>
  );
});

export function collectUnits(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('[data-unit]')) : [];
}
