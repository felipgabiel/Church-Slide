import { useState } from 'react';
import { designRatio } from '../../core/design/model';
import type { BackgroundDesign } from '../../core/types';
import { DesignCanvas } from '../../render/DesignCanvas';
import { LazyMount } from '../../ui/LazyMount';

/**
 * Miniatura de um fundo: parada; ganha movimento quando o mouse passa por cima.
 * A moldura é sempre 16:9 (as grades ficam alinhadas); um fundo de outra proporção aparece inteiro,
 * no formato dele, centralizado.
 */
export function DesignThumb({ design, live = false }: { design: BackgroundDesign; live?: boolean }) {
  const [hover, setHover] = useState(false);
  const r = designRatio(design);
  const frame = 16 / 9;
  const fit =
    Math.abs(r - frame) < 0.01
      ? undefined
      : r > frame
        ? { left: 0, right: 0, top: `${(50 * (1 - frame / r)).toFixed(3)}%`, bottom: `${(50 * (1 - frame / r)).toFixed(3)}%` }
        : { top: 0, bottom: 0, left: `${(50 * (1 - r / frame)).toFixed(3)}%`, right: `${(50 * (1 - r / frame)).toFixed(3)}%` };
  return (
    <span className="dthumb" data-aspect={fit ? design.aspect : undefined} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <LazyMount className="dthumb-in" style={fit}>
        <DesignCanvas design={design} mode={hover || live ? 'live' : 'static'} maxWidth={480} />
      </LazyMount>
      {fit && <span className="dthumb-tag">{design.aspect}</span>}
    </span>
  );
}
