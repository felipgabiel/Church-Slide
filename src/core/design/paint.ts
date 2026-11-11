import type { BackgroundDesign, DesignBlend, DesignFill, DesignLayer } from '../types';
import { frac, hashString, layerState, rng, twinkleAlpha, type LayerState } from './motion';

/**
 * Desenha um fundo do Estúdio em canvas 2D, como função do TEMPO.
 * É o MESMO código no palco do editor, no telão e no gerador de vídeo: o MP4 sai igual ao que se vê.
 *
 * Cada camada é desenhada sozinha numa tela auxiliar e depois composta na principal com
 * opacidade, modo de mistura e desfoque. A camada anterior fica guardada para servir de
 * máscara ("recortar pela camada de baixo").
 */

const TAU = Math.PI * 2;
const COMPOSITE: Record<DesignBlend, GlobalCompositeOperation> = {
  normal: 'source-over',
  screen: 'screen',
  overlay: 'overlay',
  multiply: 'multiply',
  lighter: 'lighter',
  difference: 'difference',
};

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function rgbaHex(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(4)})`;
}

function sortedStops(f: DesignFill) {
  const s = [...f.stops].sort((a, b) => a.at - b.at);
  return s.length ? s : [{ color: '#ffffff', at: 0 }];
}

/**
 * Preenchimento dentro de uma caixa centrada na origem (bw × bh).
 * Linear segue o `linear-gradient` do CSS (o ângulo aponta o fim, 0° = para cima).
 */
function makeFill(ctx: Ctx, f: DesignFill, bw: number, bh: number, extraAngle = 0): string | CanvasGradient {
  const stops = sortedStops(f);
  if (f.type === 'solid' || stops.length === 1) return stops[0].color;
  let g: CanvasGradient;
  if (f.type === 'linear') {
    const a = ((f.angle + extraAngle) * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const len = Math.abs(bw * dx) + Math.abs(bh * dy);
    g = ctx.createLinearGradient((-dx * len) / 2, (-dy * len) / 2, (dx * len) / 2, (dy * len) / 2);
  } else if (f.type === 'radial') {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, Math.hypot(bw, bh) / 2));
  } else {
    g = ctx.createConicGradient(((f.angle + extraAngle - 90) * Math.PI) / 180, 0, 0);
  }
  for (const s of stops) g.addColorStop(Math.min(1, Math.max(0, s.at / 100)), s.color);
  if (f.type === 'conic') g.addColorStop(1, stops[0].color); // fecha a volta sem costura
  return g;
}

/** Caminho de uma forma centrada na origem. */
export function shapePath(layer: Pick<DesignLayer, 'shape' | 'radius' | 'sides'>, sw: number, sh: number): Path2D {
  const p = new Path2D();
  const hw = sw / 2;
  const hh = sh / 2;
  switch (layer.shape) {
    case 'circle':
      p.ellipse(0, 0, hw, hh, 0, 0, TAU);
      break;
    case 'rounded':
      p.roundRect(-hw, -hh, sw, sh, (Math.min(sw, sh) * layer.radius) / 100);
      break;
    case 'band':
      p.roundRect(-hw, -hh, sw, sh, Math.min(hw, hh));
      break;
    case 'arch': {
      const r = Math.min(hw, sh / 2);
      p.moveTo(-hw, hh);
      p.lineTo(-hw, -hh + r);
      p.ellipse(0, -hh + r, hw, r, 0, Math.PI, 0);
      p.lineTo(hw, hh);
      p.closePath();
      break;
    }
    case 'polygon': {
      const n = Math.max(3, layer.sides);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * TAU) / n;
        const x = Math.cos(a) * hw;
        const y = Math.sin(a) * hh;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      break;
    }
  }
  return p;
}

/** Caixa de uma camada (em pixels), em repouso: usada pelas alças do estúdio. */
export function layerBox(layer: DesignLayer, w: number, h: number) {
  const U = h / 100;
  return { cx: (layer.x / 100) * w, cy: (layer.y / 100) * h, bw: layer.w * U, bh: layer.h * U, rot: layer.rotation };
}

/** Camadas que têm posição e tamanho próprios (dá para arrastar no palco). */
export const isPlaced = (l: DesignLayer) => l.kind === 'shape' || l.kind === 'glow' || l.kind === 'waves' || (l.kind === 'gradient' && l.fill.type !== 'linear');

export class DesignPainter {
  private a: HTMLCanvasElement;
  private b: HTMLCanvasElement;
  private small: HTMLCanvasElement;
  private noise: HTMLCanvasElement | null = null;

  constructor(
    public readonly w: number,
    public readonly h: number,
  ) {
    this.a = canvas(w, h);
    this.b = canvas(w, h);
    this.small = canvas(w / 2, h / 2);
  }

  /** Desenha `design` no instante `tSec` (segundos desde o início do loop). */
  draw(ctx: Ctx, design: BackgroundDesign, tSec: number): void {
    const { w, h } = this;
    const p = frac(tSec / Math.max(0.5, design.loopSec));
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = design.base;
    ctx.fillRect(0, 0, w, h);

    let layerCv = this.a;
    let maskCv = this.b;
    let hasMask = false;
    for (const layer of design.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const st = layerState(layer, p);
      const lc = layerCv.getContext('2d')!;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.globalAlpha = 1;
      lc.globalCompositeOperation = 'source-over';
      lc.filter = 'none';
      lc.clearRect(0, 0, w, h);
      this.paintLayer(lc, layer, st, p);
      if (layer.clip && hasMask) {
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(maskCv, 0, 0);
        lc.globalCompositeOperation = 'source-over';
      }
      this.composite(ctx, layerCv, layer, st);
      // a próxima camada com "recortar" usa ESTA como molde (camadas recortadas não viram molde)
      if (!layer.clip) {
        const t = maskCv;
        maskCv = layerCv;
        layerCv = t;
        hasMask = true;
      }
    }
    ctx.restore();
  }

  private composite(ctx: Ctx, src: HTMLCanvasElement, layer: DesignLayer, st: LayerState) {
    const { w, h } = this;
    const px = (layer.blur / 100) * 0.25 * h;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * st.alpha));
    ctx.globalCompositeOperation = COMPOSITE[layer.blend];
    if (px > 2) {
      // desfoque grande em meia resolução: bem mais leve e visualmente igual (o desfoque esconde a diferença)
      const s = this.small;
      const sc = s.getContext('2d')!;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, s.width, s.height);
      sc.filter = `blur(${px / 2}px)`;
      sc.drawImage(src, 0, 0, s.width, s.height);
      sc.filter = 'none';
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(s, 0, 0, w, h);
    } else {
      if (px > 0.3) ctx.filter = `blur(${px}px)`;
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
  }

  private paintLayer(c: Ctx, layer: DesignLayer, st: LayerState, p: number) {
    const { w, h } = this;
    const U = h / 100;
    const cx = (layer.x / 100) * w + st.dx * U;
    const cy = (layer.y / 100) * h + st.dy * U;
    const rot = ((layer.rotation + st.rot) * Math.PI) / 180;

    switch (layer.kind) {
      case 'gradient': {
        if (layer.fill.type === 'linear' || layer.fill.type === 'solid') {
          c.translate(w / 2 + st.dx * U, h / 2 + st.dy * U);
          c.fillStyle = makeFill(c, st.fill, w * st.scale, h * st.scale, layer.rotation + st.rot + st.flow * 360);
          c.fillRect(-w, -h, w * 2, h * 2);
        } else {
          c.translate(cx, cy);
          c.rotate(rot + st.flow * TAU);
          const r = (layer.w / 100) * Math.hypot(w, h) * st.scale;
          c.fillStyle = makeFill(c, st.fill, r, r, 0);
          c.fillRect(-w * 2, -h * 2, w * 4, h * 4);
        }
        break;
      }
      case 'shape': {
        const sw = layer.w * U;
        const sh = layer.h * U;
        c.translate(cx, cy);
        c.rotate(rot);
        c.scale(st.scale, st.scale);
        c.fillStyle = makeFill(c, st.fill, sw, sh, st.flow * 360);
        c.fill(shapePath(layer, sw, sh));
        break;
      }
      case 'glow': {
        const rw = (layer.w * U * st.scale) / 2;
        const rh = (layer.h * U * st.scale) / 2;
        if (rw < 0.5 || rh < 0.5) break;
        c.translate(cx, cy);
        c.rotate(rot);
        c.scale(1, rh / rw);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rw);
        const stops = sortedStops(st.fill);
        // centro forte, queda suave e longa: parece luz, não um disco
        stops.forEach((s, i) => g.addColorStop((i / Math.max(1, stops.length)) * 0.45, rgbaHex(s.color, i === 0 ? 1 : 0.75)));
        const last = stops[stops.length - 1].color;
        g.addColorStop(0.5, rgbaHex(last, 0.5));
        g.addColorStop(0.75, rgbaHex(last, 0.16));
        g.addColorStop(1, rgbaHex(last, 0));
        c.fillStyle = g;
        c.fillRect(-rw, -rw, rw * 2, rw * 2);
        break;
      }
      case 'waves': {
        const n = Math.max(1, layer.count);
        const bandH = layer.h * U * st.scale;
        const amp = layer.amplitude * U * st.scale;
        const span = Math.hypot(w, h) * 1.2;
        const wl = Math.max(40, span / 2.2);
        c.translate(cx, cy);
        c.rotate(rot);
        c.lineWidth = Math.max(0.5, (layer.thickness / 10) * U);
        c.lineCap = 'round';
        c.strokeStyle = makeFill(c, { ...st.fill, type: st.fill.type === 'solid' ? 'solid' : 'linear', angle: 90 }, span, bandH);
        const step = Math.max(4, w / 160);
        for (let j = 0; j < n; j++) {
          const y0 = n === 1 ? 0 : -bandH / 2 + (j * bandH) / (n - 1);
          const ph = j * 0.9;
          c.beginPath();
          for (let x = -span / 2; x <= span / 2 + step; x += step) {
            const y = y0 + amp * Math.sin((TAU * x) / wl + TAU * st.flow + ph) * (0.6 + 0.4 * Math.sin(ph + (TAU * x) / (wl * 2.7)));
            if (x === -span / 2) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
        break;
      }
      case 'texture': {
        if (layer.texture === 'stripes') {
          const gap = Math.max(2, layer.scale * U);
          const band = Math.max(1, (gap * layer.thickness) / 100);
          const span = Math.hypot(w, h);
          c.translate(w / 2, h / 2);
          c.rotate(rot);
          c.fillStyle = makeFill(c, st.fill, span, span, 0);
          const off = frac(st.flow) * gap;
          for (let y = -span / 2 - gap + off; y < span / 2 + gap; y += gap) c.fillRect(-span / 2, y, span, band);
        } else {
          const noise = this.grain();
          const k = Math.max(0.5, layer.scale / 4) * (h / 1080) * 2;
          const pat = c.createPattern(noise, 'repeat')!;
          const step = st.twinkle ? Math.floor(frac(st.twinkle.q) * 24) : 0;
          const r = rng(1 + step);
          pat.setTransform(new DOMMatrix().translate(r() * 256, r() * 256).scale(k));
          c.fillStyle = pat;
          c.fillRect(0, 0, w, h);
          c.globalCompositeOperation = 'source-in';
          c.fillStyle = sortedStops(st.fill)[0].color;
          c.fillRect(0, 0, w, h);
        }
        break;
      }
      case 'particles': {
        const n = Math.max(1, layer.count);
        const r = rng(hashString(layer.id));
        const stops = sortedStops(st.fill);
        for (let i = 0; i < n; i++) {
          const sx = r();
          const sy = r();
          const sz = 0.5 + r();
          const seed = r();
          // sobe uma tela inteira por loop: periódico, a partícula que sai em cima reaparece embaixo
          const y = (1.1 - frac(sy + p)) * h * 1.2 - h * 0.1;
          const x = (sx + 0.02 * Math.sin(TAU * (p + seed)) + st.dx / 100) * w;
          const rad = (layer.scale * U * sz * st.scale) / 2;
          if (rad < 0.3) continue;
          const col = stops[i % stops.length].color;
          const a = twinkleAlpha(st.twinkle, seed);
          const g = c.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, rgbaHex(col, 0.95 * a));
          g.addColorStop(0.55, rgbaHex(col, 0.45 * a));
          g.addColorStop(1, rgbaHex(col, 0));
          c.fillStyle = g;
          c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        break;
      }
    }
  }

  /** Grão: ruído branco determinístico, gerado uma vez. */
  private grain(): HTMLCanvasElement {
    if (this.noise) return this.noise;
    const n = canvas(256, 256);
    const nc = n.getContext('2d')!;
    const img = nc.createImageData(256, 256);
    const r = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(r() * r() * 255);
    }
    nc.putImageData(img, 0, 0);
    this.noise = n;
    return n;
  }
}
