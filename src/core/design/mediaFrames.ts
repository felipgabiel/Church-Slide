import { getMedia } from '../storage/media';
import type { BackgroundDesign } from '../types';
import { designMediaIds, type DesignMediaSource, type MediaFrame } from './paint';

/**
 * Imagens e vídeos das camadas do Estúdio no GERADOR DE VÍDEO: determinístico.
 * Antes de cada quadro, `seek(t)` leva cada vídeo ao instante exato (t módulo a duração do vídeo),
 * então o MP4 sai igual não importa a velocidade do computador.
 */
export class ExportMedia implements DesignMediaSource {
  private frames = new Map<string, MediaFrame>();
  private videos = new Map<string, HTMLVideoElement>();
  private urls: string[] = [];

  static async load(designs: (BackgroundDesign | null | undefined)[]): Promise<ExportMedia> {
    const m = new ExportMedia();
    const ids = new Set(designs.flatMap((d) => (d ? designMediaIds(d) : [])));
    for (const id of ids) {
      try {
        const rec = await getMedia(id);
        if (!rec) continue;
        if (rec.kind === 'image') {
          const bmp = await createImageBitmap(rec.blob);
          m.frames.set(id, { src: bmp, w: bmp.width, h: bmp.height });
        } else if (rec.kind === 'video') {
          const v = document.createElement('video');
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          const url = URL.createObjectURL(rec.blob);
          m.urls.push(url);
          v.src = url;
          await new Promise<void>((res, rej) => {
            v.onloadeddata = () => res();
            v.onerror = () => rej(new Error('video'));
          });
          m.videos.set(id, v);
          m.frames.set(id, { src: v, w: v.videoWidth, h: v.videoHeight });
        }
      } catch (err) {
        console.warn('[export] mídia do fundo ignorada', id, err);
      }
    }
    return m;
  }

  get hasVideo() {
    return this.videos.size > 0;
  }

  /** Leva os vídeos ao instante `tSec` do fundo (com loop pela duração de cada vídeo). */
  async seek(tSec: number): Promise<void> {
    for (const v of this.videos.values()) {
      const dur = v.duration;
      if (!Number.isFinite(dur) || dur <= 0) continue;
      const target = ((tSec % dur) + dur) % dur;
      if (Math.abs(v.currentTime - target) < 0.0005) continue;
      await new Promise<void>((res) => {
        const done = () => {
          clearTimeout(timer);
          v.removeEventListener('seeked', done);
          res();
        };
        const timer = setTimeout(done, 3000);
        v.addEventListener('seeked', done);
        v.currentTime = target;
      });
    }
  }

  frame(id: string): MediaFrame | null {
    return this.frames.get(id) ?? null;
  }

  dispose() {
    for (const v of this.videos.values()) v.removeAttribute('src');
    for (const f of this.frames.values()) if (typeof ImageBitmap !== 'undefined' && f.src instanceof ImageBitmap) f.src.close();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
  }
}
