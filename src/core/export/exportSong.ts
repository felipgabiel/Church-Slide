import { resolveBackground, slideText } from '../defaults';
import { slideHasText } from '../present/playlist';
import { loadCustomFonts } from '../storage/media';
import { ASPECT_RATIOS, type Project, type Slide } from '../types';
import { BackgroundPainter } from './background';
import { createCompositor } from './compose';
import { encodeMp4, ExportAbort } from './encode';
import { measureScene } from './scene';
import { buildZip } from './zip';
import { tr } from '../i18n';

export type Quality = 'high' | 'medium' | 'low';

export interface ExportSettings {
  /** altura do vídeo: 720, 1080 ou 2160 (a largura sai da proporção do projeto) */
  height: number;
  fps: 30 | 60;
  /** tempo com a letra parada (e o fundo animado) depois da animação de entrada, em segundos */
  holdSec: number;
  quality: Quality;
  /** ids dos trechos a exportar, na ordem do louvor */
  slideIds: string[];
}

export const DEFAULT_SETTINGS: Omit<ExportSettings, 'slideIds'> = { height: 1080, fps: 30, holdSec: 5, quality: 'medium' };

/** Bits por pixel por quadro: fundo escuro e texto grande comprimem muito bem. */
const BPP: Record<Quality, number> = { high: 0.16, medium: 0.09, low: 0.05 };

/** Largura e altura PARES (exigência do H.264), na proporção do projeto. */
export function videoSize(project: Pick<Project, 'aspect'>, height: number): { width: number; height: number } {
  const h = Math.round(height / 2) * 2;
  return { width: Math.round((h * ASPECT_RATIOS[project.aspect]) / 2) * 2, height: h };
}

export const bitrateFor = (w: number, h: number, fps: number, q: Quality) => Math.round(w * h * fps * BPP[q]);

/** Trechos que viram vídeo: os que têm texto visível (vazios são pulados, como na apresentação). */
export const exportableSlides = (p: Project): Slide[] => p.slides.filter(slideHasText);

const clean = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "03 - vem sobre mim SENHOR.mp4": número = ordem na música, para o Holyrics/explorador ordenarem certo. */
export function clipFileName(index: number, total: number, slide: Slide): string {
  const digits = Math.max(2, String(total).length);
  const num = String(index + 1).padStart(digits, '0');
  const words = clean(slideText(slide).replace(/\n+/g, ' ')).split(' ').slice(0, 6).join(' ');
  return `${num} - ${(words || slide.label || tr('trecho')).slice(0, 48).trim()}.mp4`;
}

export interface ClipResult {
  slideId: string;
  index: number;
  name: string;
  blob: Blob;
  durationMs: number;
}

export interface ExportHooks {
  onClipStart?: (index: number, total: number, name: string) => void;
  /** 0–1 do trecho atual */
  onProgress?: (fraction: number) => void;
  onClip?: (clip: ClipResult) => void;
  signal?: AbortSignal;
}

export async function exportClips(project: Project, s: ExportSettings, hooks: ExportHooks = {}): Promise<ClipResult[]> {
  const chosen = new Set(s.slideIds);
  const all = exportableSlides(project);
  const slides = all.filter((x) => chosen.has(x.id));
  if (!slides.length) throw new Error(tr('Nenhum trecho com texto para exportar.'));
  const { width, height } = videoSize(project, s.height);
  await loadCustomFonts().catch(() => undefined);

  const out: ClipResult[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (hooks.signal?.aborted) throw new ExportAbort();
    // a numeração acompanha a posição entre TODOS os trechos com texto (não some se você desmarcar um)
    const name = clipFileName(all.indexOf(slide), all.length, slide);
    hooks.onClipStart?.(i, slides.length, name);

    const scene = await measureScene(project, slide, width, height);
    const comp = createCompositor(scene);
    const bg = await BackgroundPainter.create(resolveBackground(slide, project.theme), width, height);
    const durationMs = comp.animMs + Math.max(0.5, s.holdSec) * 1000;
    try {
      const blob = await encodeMp4({
        width,
        height,
        fps: s.fps,
        durationMs,
        bitrate: bitrateFor(width, height, s.fps, s.quality),
        signal: hooks.signal,
        onProgress: hooks.onProgress,
        renderFrame: async (ctx, tMs) => {
          await bg.draw(ctx, tMs / 1000);
          comp.draw(ctx, tMs);
        },
      });
      const clip = { slideId: slide.id, index: i, name, blob, durationMs };
      out.push(clip);
      hooks.onClip?.(clip);
    } finally {
      bg.dispose();
    }
  }
  return out;
}

export async function zipClips(clips: ClipResult[]): Promise<Blob> {
  return buildZip(clips.map((c) => ({ name: c.name, data: c.blob })));
}

export const zipFileName = (project: Project) => `${clean(project.name) || tr('louvor')} - ${tr('videos')}.zip`;
