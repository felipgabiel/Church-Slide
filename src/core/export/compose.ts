import { colorAt, colorEnd } from '../anim/colorfx';
import { getEase, easePeakSpeed } from '../anim/easing';
import { hasEffect, planTotal, planUnits, unitState, type UnitState } from '../anim/engine';
import type { TextStyle } from '../types';
import type { Scene, WordBox } from './scene';

/**
 * Desenha o texto de um instante `t` (ms) do vídeo. Usa o MESMO `unitState`/`planUnits` do telão:
 * a animação do vídeo é a do editor, não uma cópia. O que muda é só o desenho (canvas em vez de DOM).
 *
 * Motion Blur: desfoque gaussiano direcional por amostragem — a palavra é desenhada várias vezes
 * ao longo do eixo do movimento com pesos gaussianos e somada ('lighter'), o que conserva o brilho.
 */

const FINAL: UnitState = { opacity: 1, tx: 0, ty: 0, scale: 1, blurX: 0, blurY: 0 };
const OFFSCREEN_SHIFT = 100000;

const px = (tenths: number, H: number) => ((tenths * 0.1) / 100) * H; // décimos de % da altura → px

interface Shadow {
  color: string;
  x: number;
  y: number;
  blur: number;
}

/** Sombras na ordem do CSS (a primeira fica por cima). */
function shadowsOf(s: TextStyle, H: number): Shadow[] {
  const out: Shadow[] = [];
  if (s.shadow.enabled) out.push({ color: s.shadow.color, x: px(s.shadow.x, H), y: px(s.shadow.y, H), blur: px(s.shadow.blur, H) });
  if (s.glow.enabled) {
    out.push({ color: s.glow.color, x: 0, y: 0, blur: px(s.glow.blur, H) });
    out.push({ color: s.glow.color, x: 0, y: 0, blur: px(s.glow.blur * 2.2, H) });
  }
  return out;
}

const reachOf = (shadows: Shadow[], strokePx: number) => shadows.reduce((m, s) => Math.max(m, Math.hypot(s.x, s.y) + s.blur * 1.6), 0) + strokePx;

/** Pedaço de texto com a própria cor: a palavra inteira ou, no modo "por letra", cada letra. */
interface Piece {
  text: string;
  x: number;
  color: string;
}

/** Cor de cada pedaço da palavra no instante `t` (a mesma conta do telão). */
function piecesOf(wd: WordBox, tMs: number, enterMs: number): Piece[] {
  const fx = wd.fx;
  if (!fx) return [{ text: wd.text, x: wd.x, color: wd.color }];
  if (wd.chars) return wd.chars.map((c) => ({ text: c.text, x: c.x, color: colorAt(fx, wd.color, c.part, enterMs, tMs) ?? wd.color }));
  return [{ text: wd.text, x: wd.x, color: colorAt(fx, wd.color, wd.part, enterMs, tMs) ?? wd.color }];
}

/** Desenha UMA palavra (sombras → contorno → preenchimento) em coordenadas do vídeo. */
function drawWord(ctx: CanvasRenderingContext2D, wd: WordBox, style: TextStyle, H: number, pieces: Piece[]) {
  ctx.font = wd.font;
  ctx.letterSpacing = `${wd.letterSpacing}px`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(wd.text);
  const baseline = wd.y + m.fontBoundingBoxAscent;
  const shadows = shadowsOf(style, H);
  const strokePx = style.stroke.enabled ? px(style.stroke.width, H) : 0;

  // sombras: o texto é desenhado longe da tela e só a sombra (deslocada de volta) aparece.
  // O deslocamento/desfoque da sombra do canvas é em px de TELA: acompanha a escala da animação, como no CSS.
  const a = ctx.getTransform().a || 1;
  for (let i = shadows.length - 1; i >= 0; i--) {
    const s = shadows[i];
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.blur * a;
    ctx.shadowOffsetX = s.x * a + OFFSCREEN_SHIFT;
    ctx.shadowOffsetY = s.y * a;
    ctx.fillStyle = '#000';
    for (const p of pieces) ctx.fillText(p.text, p.x - OFFSCREEN_SHIFT / a, baseline);
    ctx.restore();
  }
  if (strokePx > 0) {
    ctx.lineWidth = strokePx;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = style.stroke.color;
    for (const p of pieces) ctx.strokeText(p.text, p.x, baseline);
  }
  for (const p of pieces) {
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, baseline);
  }
}

export interface Compositor {
  /** duração da animação de entrada, em ms (0 = aparece pronto) */
  enterMs: number;
  /** entrada + troca de cor: quando o texto termina de se mexer/mudar */
  animMs: number;
  draw(ctx: CanvasRenderingContext2D, tMs: number): void;
}

export function createCompositor(scene: Scene): Compositor {
  const { cfg, units, words, overrides, layers, width: W, height: H } = scene;
  const ease = getEase(cfg.easing);
  const peak = easePeakSpeed(cfg.easing);
  const plans = planUnits(cfg, 'enter', units.length, overrides);
  const instant = plans.every((p) => !hasEffect(p.cfg.enter));
  const enterMs = instant ? 0 : planTotal(plans);
  const geo = { w: W, h: H };
  // a troca de cor começa quando a entrada termina e termina quando a última palavra/letra chega
  const colorMs = words.reduce((m, w) => (w.fx ? Math.max(m, colorEnd(w.fx, w.parts, enterMs)) : m), 0);
  const animMs = Math.max(enterMs, colorMs);

  const off = document.createElement('canvas');
  const octx = off.getContext('2d')!;
  /** tela à parte para camadas com "inverter cores" */
  const blend = document.createElement('canvas');
  const bctx = blend.getContext('2d')!;

  const stateOf = (unit: number, t: number): UnitState => {
    if (instant) return FINAL;
    const p = plans[unit];
    if (!p) return FINAL;
    return unitState(p.cfg, 'enter', (t - p.start) / p.duration, geo, ease, peak, units[unit]);
  };

  function drawGrouped(ctx: CanvasRenderingContext2D, wd: WordBox, style: TextStyle, s: UnitState, pieces: Piece[]) {
    const u = units[wd.unit];
    const shadows = shadowsOf(style, H);
    const strokePx = style.stroke.enabled ? px(style.stroke.width, H) : 0;
    const layerBlur = style.blur > 0 ? px(style.blur, H) : 0;

    // variâncias somam: parte isotrópica (blur do efeito + do texto) e parte direcional (Motion Blur)
    const iso = Math.sqrt(Math.min(s.blurX, s.blurY) ** 2 + layerBlur ** 2);
    const sx = Math.sqrt(Math.max(0, s.blurX ** 2 - Math.min(s.blurX, s.blurY) ** 2));
    const sy = Math.sqrt(Math.max(0, s.blurY ** 2 - Math.min(s.blurX, s.blurY) ** 2));

    // caixa da palavra depois da transformação da unidade
    const k = s.scale;
    const bx = u.cx + s.tx + (wd.x - u.cx) * k;
    const by = u.cy + s.ty + (wd.y - u.cy) * k;
    const pad = Math.ceil(reachOf(shadows, strokePx) * k + 3 * Math.max(iso, sx, sy) + wd.h * 0.25 + 6);
    const ow = Math.max(1, Math.ceil(wd.w * k + pad * 2));
    const oh = Math.max(1, Math.ceil(wd.h * k + pad * 2));
    if (off.width < ow || off.height < oh) {
      off.width = Math.max(off.width, ow);
      off.height = Math.max(off.height, oh);
    }
    const ox = bx - pad;
    const oy = by - pad;

    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.globalAlpha = 1;
    octx.filter = 'none';
    octx.clearRect(0, 0, off.width, off.height);

    const axis = sx > 0 ? 'x' : sy > 0 ? 'y' : null;
    const sigma = axis === 'x' ? sx : axis === 'y' ? sy : 0;
    const n = axis ? Math.min(33, Math.max(5, Math.ceil(sigma * 5) | 1)) : 1;
    const weights: number[] = [];
    const offsets: number[] = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const uu = n === 1 ? 0 : (i / (n - 1)) * 5 - 2.5; // -2.5σ … +2.5σ
      offsets.push(uu * sigma);
      const w = Math.exp(-0.5 * uu * uu);
      weights.push(w);
      sum += w;
    }

    octx.globalCompositeOperation = n > 1 ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      octx.save();
      octx.globalAlpha = weights[i] / sum;
      const dx = axis === 'x' ? offsets[i] : 0;
      const dy = axis === 'y' ? offsets[i] : 0;
      octx.setTransform(1, 0, 0, 1, -ox + dx, -oy + dy);
      octx.translate(u.cx + s.tx, u.cy + s.ty);
      octx.scale(k, k);
      octx.translate(-u.cx, -u.cy);
      drawWord(octx, wd, style, H, pieces);
      octx.restore();
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity * (style.opacity / 100)));
    if (iso > 0.1) ctx.filter = `blur(${iso}px)`;
    ctx.drawImage(off, 0, 0, ow, oh, ox, oy, ow, oh);
    ctx.restore();
  }

  return {
    enterMs,
    animMs,
    draw(ctx, tMs) {
      const cache = new Map<number, UnitState>();
      const drawOne = (ctx: CanvasRenderingContext2D, wd: WordBox) => {
        let s = cache.get(wd.unit);
        if (!s) cache.set(wd.unit, (s = stateOf(wd.unit, tMs)));
        if (s.opacity <= 0.002) return;
        const style = layers[wd.layer] ?? layers[0];
        const pieces = piecesOf(wd, tMs, enterMs);
        // caixa girada: gira o desenho em torno do centro dela, como o CSS faz no palco
        const turned = !!style.rotation;
        if (turned) {
          const cx = (style.x / 100) * W;
          const cy = (style.y / 100) * H;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((style.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        const plain = s.opacity >= 0.999 && s.blurX < 0.1 && s.blurY < 0.1 && style.opacity >= 100 && style.blur <= 0;
        if (plain && s.scale === 1 && s.tx === 0 && s.ty === 0) {
          drawWord(ctx, wd, style, H, pieces); // estado final: desenho vetorial direto, nítido
        } else if (plain) {
          const u = units[wd.unit];
          ctx.save();
          ctx.translate(u.cx + s.tx, u.cy + s.ty);
          ctx.scale(s.scale, s.scale);
          ctx.translate(-u.cx, -u.cy);
          drawWord(ctx, wd, style, H, pieces);
          ctx.restore();
        } else {
          drawGrouped(ctx, wd, style, s, pieces);
        }
        if (turned) ctx.restore();
      };
      // camada a camada, na ordem do palco. "Inverter cores" desenha a camada inteira à parte e depois a
      // mistura com o que já está no quadro (fundo + camadas de baixo), como o mix-blend-mode do CSS.
      for (let li = 0; li < Math.max(1, layers.length); li++) {
        const style = layers[li] ?? layers[0];
        const mine = words.filter((wd) => (layers[wd.layer] ? wd.layer : 0) === li);
        if (!mine.length) continue;
        if (style?.blend === 'difference') {
          if (blend.width !== W || blend.height !== H) {
            blend.width = W;
            blend.height = H;
          }
          bctx.setTransform(1, 0, 0, 1, 0, 0);
          bctx.clearRect(0, 0, W, H);
          for (const wd of mine) drawOne(bctx, wd);
          ctx.save();
          ctx.globalCompositeOperation = 'difference';
          ctx.drawImage(blend, 0, 0);
          ctx.restore();
        } else {
          for (const wd of mine) drawOne(ctx, wd);
        }
      }
    },
  };
}

