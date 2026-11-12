import { cubicBezier } from '../anim/easing';
import { BOKEH } from '../bokeh';
import { DesignPainter } from '../design/paint';
import { getMedia } from '../storage/media';
import type { Background } from '../types';
import { clear, rgba } from './color';
import { tr } from '../i18n';

/**
 * Fundo do vídeo, desenhado em canvas como função do TEMPO (determinístico: o quadro N é sempre igual).
 * Cada fundo animado é a tradução exata dos @keyframes de src/styles/stage.css
 * (mesmas posições, tamanhos, opacidades, durações e curvas).
 */

const TAU = Math.PI * 2;
/** `ease-in-out` do CSS (não confundir com a curva própria do app). */
const CSS_EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
const sqrt2h = Math.SQRT1_2; // raio "farthest-corner" de um quadrado = lado × 0,7071

/** Vai e volta (animation-direction: alternate) com easing em cada trecho. */
function alternate(tSec: number, durSec: number): number {
  const x = (tSec / durSec) % 2;
  const p = x <= 1 ? x : 2 - x;
  return CSS_EASE_IN_OUT(p);
}

const frac = (v: number) => v - Math.floor(v);

function radialBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, scale: number, color: string, stop: number, alpha: number) {
  const R = size * sqrt2h * scale;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, color);
  g.addColorStop(stop, clear(color));
  g.addColorStop(1, clear(color));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = 1;
}

function conic(ctx: CanvasRenderingContext2D, x: number, y: number, fromRad: number, stops: [number, string][]) {
  const g = ctx.createConicGradient(fromRad - Math.PI / 2, x, y); // CSS: 0° aponta para cima; canvas: para a direita
  for (const [at, c] of stops) g.addColorStop(Math.min(1, Math.max(0, at)), c);
  return g;
}

function paintAnimated(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, t: number) {
  const st = bg.gradient.stops;
  const c1 = st[0]?.color ?? '#6d5cff';
  const c2 = st[1]?.color ?? c1;
  const c3 = st[2]?.color ?? c2;
  const speed = Math.max(0.1, bg.speed);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  switch (bg.animated) {
    case 'aurora': {
      const size = 1.25 * h;
      const blobs = [
        { x: -0.12 * w, y: -0.35 * h, dx: 0.34 * w, dy: 0.22 * h, s: 1.18, dur: 28, c: c1 },
        { x: 1.14 * w - size, y: -0.1 * h, dx: -0.3 * w, dy: 0.3 * h, s: 0.9, dur: 34, c: c2 },
        { x: 0.22 * w, y: 1.6 * h - size, dx: 0.26 * w, dy: -0.28 * h, s: 1.2, dur: 31, c: c3 },
      ];
      for (const b of blobs) {
        const p = alternate(t, b.dur / speed);
        const sc = 1 + (b.s - 1) * p;
        radialBlob(ctx, b.x + size / 2 + b.dx * p, b.y + size / 2 + b.dy * p, size, sc, b.c, 0.62, 0.8);
      }
      break;
    }
    case 'drift': {
      const rot = (t / (80 / speed)) * TAU;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = conic(ctx, w / 2, h / 2, rot, [
        [0, c1],
        [1 / 3, c2],
        [2 / 3, c3],
        [1, c1],
      ]);
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'bokeh': {
      const colors = [c1, c2, c3];
      for (const b of BOKEH) {
        const phase = frac((t - b.delay) / b.dur); // delay negativo: o ciclo já começou
        const size = (b.size / 100) * h;
        // opacidade: 0 → .6 (15%) → .5 (85%) → 0, linear
        const op = phase < 0.15 ? (phase / 0.15) * 0.6 : phase < 0.85 ? 0.6 + ((phase - 0.15) / 0.7) * -0.1 : ((1 - phase) / 0.15) * 0.5;
        const x = (b.left / 100) * w + 0.04 * w * phase;
        const y = 1.14 * h - size - 1.25 * h * phase;
        radialBlob(ctx, x + size / 2, y + size / 2, size, 1, colors[b.hue] ?? c1, 0.7, op);
      }
      break;
    }
    case 'rays': {
      const size = 1.9 * h;
      const cx = w / 2;
      const cy = -0.45 * h + size / 2;
      const rays: { from: number; dur: number; dir: 1 | -1; alpha: number; stops: [number, string][] }[] = [
        {
          from: 0,
          dur: 70,
          dir: 1,
          alpha: 0.4,
          stops: [
            [0, clear(c1)], [0.08, clear(c1)], [0.12, c1], [0.18, clear(c1)],
            [0.52, clear(c2)], [0.57, c2], [0.63, clear(c2)], [1, clear(c2)],
          ],
        },
        {
          from: Math.PI / 2,
          dur: 110,
          dir: -1,
          alpha: 0.28,
          stops: [
            [0, clear(c3)], [0.2, clear(c3)], [0.25, c3], [0.31, clear(c3)],
            [0.7, clear(c1)], [0.75, c1], [0.82, clear(c1)], [1, clear(c1)],
          ],
        },
      ];
      for (const r of rays) {
        ctx.save();
        ctx.globalAlpha = r.alpha;
        ctx.translate(cx, cy);
        ctx.rotate(r.dir * (t / (r.dur / speed)) * TAU);
        ctx.fillStyle = conic(ctx, 0, 0, r.from, r.stops);
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      break;
    }
    case 'waves': {
      const d = 'M0,160 C240,80 480,240 720,160 C960,80 1200,240 1440,160 C1680,80 1920,240 2160,160 C2400,80 2640,240 2880,160 L2880,320 L0,320 Z';
      const path = new Path2D(d);
      const waves = [
        { bottom: -0.04, hh: 0.46, alpha: 0.5, dur: 30, reverse: false, c: c1 },
        { bottom: -0.08, hh: 0.38, alpha: 0.4, dur: 22, reverse: true, c: c2 },
        { bottom: -0.12, hh: 0.3, alpha: 0.35, dur: 16, reverse: false, c: c3 },
      ];
      for (const wv of waves) {
        const elW = 2 * w;
        const elH = wv.hh * h;
        const top = h * (1 - wv.bottom) - elH;
        const p = frac(t / (wv.dur / speed));
        const shift = (wv.reverse ? p - 1 : -p) * (elW / 2); // 0 → -50% (ou o inverso)
        ctx.save();
        ctx.globalAlpha = wv.alpha;
        ctx.fillStyle = wv.c;
        ctx.translate(shift, top);
        ctx.scale(elW / 2880, elH / 320);
        ctx.fill(path);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

/** Linhas do `linear-gradient` do CSS: o ângulo define o vetor, o comprimento cobre exatamente o retângulo. */
function cssLinearGradient(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number): CanvasGradient {
  const a = (bg.gradient.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  const stops = [...bg.gradient.stops].sort((p, q) => p.at - q.at);
  if (stops.length === 1) stops.push(stops[0]);
  for (const s of stops) g.addColorStop(Math.min(1, Math.max(0, s.at / 100)), rgba(s.color));
  return g;
}

/** `object-fit: cover` + `object-position` + escala em torno do mesmo ponto (como o `.bg-fill`). */
function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number, bg: Background) {
  if (!sw || !sh) return;
  const k = Math.max(w / sw, h / sh);
  const dw = sw * k;
  const dh = sh * k;
  const dx = (w - dw) * (bg.posX / 100);
  const dy = (h - dh) * (bg.posY / 100);
  const ox = (bg.posX / 100) * w;
  const oy = (bg.posY / 100) * h;
  const s = bg.scale / 100;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  ctx.translate(-ox, -oy);
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.restore();
}

/** Mesmo filtro do editor (brilho, contraste, saturação, desfoque), com o desfoque em px do vídeo. */
function adjustFilterPx(bg: Background, h: number): string {
  const a = bg.adjust;
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== 100) parts.push(`saturate(${a.saturate / 100})`);
  if (a.blur > 0) parts.push(`blur(${((a.blur * 0.1) / 100) * h}px)`);
  return parts.join(' ');
}

export class BackgroundPainter {
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private image: ImageBitmap | null = null;
  private video: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private design: DesignPainter | null = null;
  /** true se a mídia pedida não pôde ser carregada: o fundo cai para a cor/gradiente */
  mediaMissing = false;

  private constructor(
    private bg: Background,
    private w: number,
    private h: number,
  ) {
    this.layer = document.createElement('canvas');
    this.layer.width = w;
    this.layer.height = h;
    this.lctx = this.layer.getContext('2d')!;
    if (bg.kind === 'design' && bg.design) this.design = new DesignPainter(w, h);
  }

  static async create(bg: Background, w: number, h: number): Promise<BackgroundPainter> {
    const p = new BackgroundPainter(bg, w, h);
    await p.load();
    return p;
  }

  private async load() {
    const { kind, mediaId } = this.bg;
    if ((kind !== 'image' && kind !== 'video') || !mediaId) return;
    try {
      const rec = await getMedia(mediaId);
      if (!rec) throw new Error(tr('mídia ausente'));
      if (kind === 'image') {
        this.image = await createImageBitmap(rec.blob);
        return;
      }
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      this.videoUrl = URL.createObjectURL(rec.blob);
      v.src = this.videoUrl;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error(tr('vídeo de fundo não carregou')));
      });
      this.video = v;
    } catch (err) {
      console.warn('[export] fundo sem mídia:', err);
      this.mediaMissing = true;
    }
  }

  /** Desenha o fundo no instante `t` (segundos) em `ctx` (w × h). */
  async draw(ctx: CanvasRenderingContext2D, t: number): Promise<void> {
    const { bg, w, h, lctx } = this;
    lctx.clearRect(0, 0, w, h);
    // Fundo animado: como no editor, a cor de base fica FORA do filtro (o filtro vale só para as luzes animadas).
    // Antes a base também era filtrada e o vídeo saía diferente do editor com brilho/contraste ajustados.
    const baseOutside = bg.kind === 'animated';
    const baseCtx = baseOutside ? ctx : lctx;
    baseCtx.fillStyle = bg.kind === 'gradient' ? cssLinearGradient(baseCtx, bg, w, h) : bg.color;
    baseCtx.fillRect(0, 0, w, h);

    let isMedia = false;
    if (this.design && bg.design) {
      // fundo do Estúdio: o mesmo desenho do editor e do telão
      this.design.draw(lctx, bg.design, t * Math.max(0.1, bg.speed));
      isMedia = true;
    } else if (bg.kind === 'animated') {
      paintAnimated(lctx, bg, w, h, t);
      isMedia = true;
    } else if (this.image) {
      drawCover(lctx, this.image, this.image.width, this.image.height, w, h, bg);
      isMedia = true;
    } else if (this.video) {
      const v = this.video;
      const dur = v.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const target = (t * Math.min(4, Math.max(0.1, bg.speed))) % dur; // loop, como no telão
        if (Math.abs(v.currentTime - target) > 0.001) {
          await new Promise<void>((res) => {
            v.onseeked = () => res();
            v.currentTime = target;
          });
        }
      }
      drawCover(lctx, v, v.videoWidth, v.videoHeight, w, h, bg);
      isMedia = true;
    }

    const filter = adjustFilterPx(bg, h);
    ctx.save();
    if (filter) ctx.filter = filter;
    if (isMedia && bg.adjust.blur > 0) {
      // no editor a mídia ocupa inset:-4% quando há desfoque (esconde a borda esmaecida)
      ctx.translate(w / 2, h / 2);
      ctx.scale(1.08, 1.08);
      ctx.translate(-w / 2, -h / 2);
    }
    ctx.drawImage(this.layer, 0, 0);
    ctx.restore();

    if (bg.adjust.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${bg.adjust.dim / 100})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  dispose() {
    this.image?.close();
    if (this.video) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
  }
}
