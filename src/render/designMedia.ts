import type { DesignMediaSource, MediaFrame } from '../core/design/paint';
import { getMedia, getMediaUrl } from '../core/storage/media';

/**
 * Imagens e vídeos das camadas do Estúdio, na TELA (palco, miniaturas, telão).
 * Cada arquivo é carregado uma vez e compartilhado; os vídeos tocam em loop, sem som.
 * Quem desenha um quadro só (miniatura) pede `onReady` para redesenhar quando o arquivo chegar.
 */
type Entry = { state: 'loading' | 'ready' | 'missing'; el?: HTMLImageElement | HTMLVideoElement; w: number; h: number };

const entries = new Map<string, Entry>();
const ready = new Set<() => void>();

function notify() {
  ready.forEach((fn) => fn());
}

async function load(id: string, e: Entry) {
  try {
    const rec = await getMedia(id);
    const url = await getMediaUrl(id);
    if (!rec || !url || (rec.kind !== 'image' && rec.kind !== 'video')) throw new Error('missing');
    if (rec.kind === 'image') {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      Object.assign(e, { el: img, w: img.naturalWidth, h: img.naturalHeight, state: 'ready' });
    } else {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.preload = 'auto';
      v.src = url;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error('video'));
      });
      void v.play().catch(() => undefined);
      Object.assign(e, { el: v, w: v.videoWidth, h: v.videoHeight, state: 'ready' });
    }
  } catch {
    e.state = 'missing';
  }
  notify();
}

export const liveMedia: DesignMediaSource = {
  frame(id: string): MediaFrame | null {
    let e = entries.get(id);
    if (!e) {
      e = { state: 'loading', w: 0, h: 0 };
      entries.set(id, e);
      void load(id, e);
      return null;
    }
    if (e.state !== 'ready' || !e.el) return null;
    if (e.el instanceof HTMLVideoElement && e.el.paused) void e.el.play().catch(() => undefined);
    return { src: e.el, w: e.w, h: e.h };
  },
};

/** Tamanho natural (para a caixa "livre" nascer na proporção certa). */
export function mediaSize(id: string): { w: number; h: number; duration?: number } | null {
  const e = entries.get(id);
  if (!e || e.state !== 'ready') return null;
  return { w: e.w, h: e.h, duration: e.el instanceof HTMLVideoElement && Number.isFinite(e.el.duration) ? e.el.duration : undefined };
}

/** Carrega e espera (usado ao adicionar a camada). */
export async function loadMedia(id: string): Promise<{ w: number; h: number; duration?: number } | null> {
  liveMedia.frame(id);
  for (let i = 0; i < 100; i++) {
    const e = entries.get(id);
    if (e && e.state !== 'loading') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return mediaSize(id);
}

export function onMediaReady(fn: () => void): () => void {
  ready.add(fn);
  return () => ready.delete(fn);
}

/** Arquivo apagado ou trocado: esquece a cópia carregada. */
export function forgetMedia(id: string) {
  const e = entries.get(id);
  if (e?.el instanceof HTMLVideoElement) e.el.removeAttribute('src');
  entries.delete(id);
}
