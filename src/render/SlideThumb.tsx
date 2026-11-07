import { memo } from 'react';
import { ASPECT_RATIOS, type Aspect, type Slide, type Theme } from '../core/types';
import { Stage } from './Stage';

/** Miniatura estática de um slide (usa o mesmo renderizador do telão). */
export const SlideThumb = memo(function SlideThumb({ slide, theme, aspect, className = '' }: { slide: Slide | null; theme: Theme; aspect: Aspect; className?: string }) {
  return (
    <div className={`thumb ${className}`} style={{ aspectRatio: String(ASPECT_RATIOS[aspect]) }}>
      <Stage theme={theme} slide={slide} mode="static" />
    </div>
  );
});
