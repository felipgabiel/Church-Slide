import { memo, useEffect, useRef } from 'react';
import { DesignPainter } from '../core/design/paint';
import { liveMedia, onMediaReady } from './designMedia';
import type { BackgroundDesign } from '../core/types';

interface Props {
  design: BackgroundDesign;
  /** `static` desenha um quadro só (miniaturas); `live` anima */
  mode: 'live' | 'static';
  /** relógio externo em segundos (estúdio: tocar/pausar/arrastar). Sem ele, o tempo corre sozinho. */
  getTime?: () => number;
  /** multiplicador de velocidade (o mesmo `speed` dos outros fundos) */
  speed?: number;
  /** teto da resolução interna (o fundo é suave; não precisa de 4K para ficar bonito) */
  maxWidth?: number;
  /** instante desenhado no modo estático */
  at?: number;
  className?: string;
}

/**
 * Fundo do Estúdio desenhado ao vivo num <canvas>, com o mesmo `DesignPainter` do gerador de vídeo.
 * A tela interna acompanha o tamanho real do elemento (com teto), e o laço para quando a aba some.
 */
export const DesignCanvas = memo(function DesignCanvas({ design, mode, getTime, speed = 1, maxWidth = 1280, at = 0, className = 'bg-fill' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const designRef = useRef(design);
  designRef.current = design;
  const timeRef = useRef(getTime);
  timeRef.current = getTime;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const painterRef = useRef<DesignPainter | null>(null);
  const drawRef = useRef<() => void>(() => undefined);

  // tamanho da tela interna
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = Math.min(1, maxWidth / (r.width * dpr));
      const w = Math.max(2, Math.round(r.width * dpr * k));
      const h = Math.max(2, Math.round(r.height * dpr * k));
      if (painterRef.current?.w === w && painterRef.current?.h === h) return;
      cv.width = w;
      cv.height = h;
      painterRef.current = new DesignPainter(w, h);
      painterRef.current.media = liveMedia;
      drawRef.current();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    fit();
    return () => ro.disconnect();
  }, [maxWidth]);

  // desenho
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    const t0 = performance.now();
    const draw = (t: number) => {
      const p = painterRef.current;
      if (!p) return;
      try {
        p.draw(ctx, designRef.current, t);
      } catch (err) {
        console.warn('[fundo] falha ao desenhar:', err);
      }
    };
    if (mode === 'static') {
      drawRef.current = () => draw(at);
      drawRef.current();
      return;
    }
    let raf = 0;
    drawRef.current = () => draw(timeRef.current ? timeRef.current() : ((performance.now() - t0) / 1000) * speedRef.current);
    const loop = () => {
      drawRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, at]);

  // no modo estático, redesenha quando o fundo muda (ou quando uma imagem/vídeo da camada termina de carregar)
  useEffect(() => {
    if (mode === 'static') drawRef.current();
  }, [design, mode]);
  useEffect(() => (mode === 'static' ? onMediaReady(() => drawRef.current()) : undefined), [mode]);

  return <canvas ref={ref} className={className} aria-hidden />;
});
