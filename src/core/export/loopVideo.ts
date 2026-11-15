import { DesignPainter } from '../design/paint';
import { designRatio } from '../design/model';
import { loopVideoSize } from './loopSize';
import { ExportMedia } from '../design/mediaFrames';
import type { BackgroundDesign } from '../types';
import { bitrateFor, type Quality } from './exportSong';
import { encodeMp4 } from './encode';
import { tr } from '../i18n';

export interface LoopVideoOptions {
  height: 720 | 1080 | 2160;
  fps: 30 | 60;
  quality: Quality;
  /** quantas voltas do loop o arquivo tem (1 basta: o Holyrics repete sozinho) */
  repeats: number;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
}

export { loopVideoSize };

/**
 * Só o fundo, sem letra, em MP4 que repete sem emenda: são exatamente `loopSec × fps` quadros
 * por volta e o quadro seguinte ao último seria igual ao primeiro.
 */
export async function exportDesignVideo(design: BackgroundDesign, o: LoopVideoOptions): Promise<Blob> {
  const { width, height } = loopVideoSize(o.height, designRatio(design));
  const painter = new DesignPainter(width, height);
  const media = await ExportMedia.load([design]);
  painter.media = media;
  const frames = Math.round(design.loopSec * o.fps) * Math.max(1, o.repeats);
  try {
    return await encodeMp4({
    width,
    height,
    fps: o.fps,
    // duração ligeiramente menor que N quadros inteiros: o codificador arredonda para cima
    durationMs: ((frames - 0.5) * 1000) / o.fps,
    bitrate: bitrateFor(width, height, o.fps, o.quality),
    renderFrame: async (ctx, tMs) => {
      await media.seek(tMs / 1000);
      painter.draw(ctx, design, tMs / 1000);
    },
    onProgress: o.onProgress,
    signal: o.signal,
  });
  } finally {
    media.dispose();
  }
}

export const loopFileName = (d: BackgroundDesign) =>
  `${(d.name || tr('fundo')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'fundo'} (loop ${d.loopSec}s${d.aspect && d.aspect !== '16:9' ? ` ${d.aspect.replace(':', 'x')}` : ''}).mp4`;
