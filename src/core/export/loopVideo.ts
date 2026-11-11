import { DesignPainter } from '../design/paint';
import type { BackgroundDesign } from '../types';
import { bitrateFor, type Quality } from './exportSong';
import { encodeMp4 } from './encode';

export interface LoopVideoOptions {
  height: 720 | 1080 | 2160;
  fps: 30 | 60;
  quality: Quality;
  /** quantas voltas do loop o arquivo tem (1 basta: o Holyrics repete sozinho) */
  repeats: number;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
}

/** Tamanho 16:9 com lados pares (exigência do H.264). */
export function loopVideoSize(height: number) {
  const h = Math.round(height / 2) * 2;
  return { width: Math.round((h * 16) / 9 / 2) * 2, height: h };
}

/**
 * Só o fundo, sem letra, em MP4 que repete sem emenda: são exatamente `loopSec × fps` quadros
 * por volta e o quadro seguinte ao último seria igual ao primeiro.
 */
export async function exportDesignVideo(design: BackgroundDesign, o: LoopVideoOptions): Promise<Blob> {
  const { width, height } = loopVideoSize(o.height);
  const painter = new DesignPainter(width, height);
  const frames = Math.round(design.loopSec * o.fps) * Math.max(1, o.repeats);
  return encodeMp4({
    width,
    height,
    fps: o.fps,
    // duração ligeiramente menor que N quadros inteiros: o codificador arredonda para cima
    durationMs: ((frames - 0.5) * 1000) / o.fps,
    bitrate: bitrateFor(width, height, o.fps, o.quality),
    renderFrame: (ctx, tMs) => painter.draw(ctx, design, tMs / 1000),
    onProgress: o.onProgress,
    signal: o.signal,
  });
}

export const loopFileName = (d: BackgroundDesign) =>
  `${(d.name || 'fundo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'fundo'} (loop ${d.loopSec}s).mp4`;
