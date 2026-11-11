import { useState } from 'react';
import type { BackgroundDesign } from '../../core/types';
import { DesignCanvas } from '../../render/DesignCanvas';
import { LazyMount } from '../../ui/LazyMount';

/** Miniatura 16:9 de um fundo: parada; ganha movimento quando o mouse passa por cima. */
export function DesignThumb({ design, live = false }: { design: BackgroundDesign; live?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <span className="dthumb" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <LazyMount className="dthumb-in">
        <DesignCanvas design={design} mode={hover || live ? 'live' : 'static'} maxWidth={480} />
      </LazyMount>
    </span>
  );
}
