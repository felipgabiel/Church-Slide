import type { CSSProperties } from 'react';
import type { Background, TextStyle, WordStyle } from '../core/types';

/** Décimos de % da altura do slide → unidade de container (`cqh`). */
export const cq = (tenths: number) => `${(tenths * 0.1).toFixed(3)}cqh`;

export function layerCss(style: TextStyle): CSSProperties {
  const shadows: string[] = [];
  if (style.shadow.enabled) shadows.push(`${cq(style.shadow.x)} ${cq(style.shadow.y)} ${cq(style.shadow.blur)} ${style.shadow.color}`);
  if (style.glow.enabled) {
    shadows.push(`0 0 ${cq(style.glow.blur)} ${style.glow.color}`, `0 0 ${cq(style.glow.blur * 2.2)} ${style.glow.color}`);
  }
  const css: CSSProperties = {
    left: `${style.x}%`,
    top: `${style.y}%`,
    // palavra solta: a caixa acompanha o texto (assim o clique/arraste pega só a palavra)
    // --wfit: o ajuste automático pode alargar a caixa até 96% antes de reduzir a letra
    width: style.autoWidth ? 'max-content' : `max(${style.width}%, var(--wfit, 0) * 96%)`,
    ...(style.autoWidth ? { whiteSpace: 'nowrap' as const } : {}),
    fontFamily: style.fontFamily,
    fontSize: `calc(${style.fontSize}cqh * var(--fit, 1))`,
    color: style.color,
    fontWeight: style.weight ?? (style.bold ? 800 : 400),
    fontStyle: style.italic ? 'italic' : 'normal',
    textTransform: style.uppercase ? 'uppercase' : 'none',
    letterSpacing: `${style.letterSpacing / 100}em`,
    // cada linha reaplica em `em` do próprio tamanho (senão a linha menor herdaria os px da maior)
    ['--tracking' as string]: String(style.letterSpacing / 100),
    lineHeight: style.lineHeight,
    textAlign: style.align,
    opacity: style.opacity / 100,
    // inverter cores: a caixa inteira (letra, sombra, brilho) se mistura com o fundo do palco
    ...(style.blend === 'difference' ? { mixBlendMode: 'difference' as const } : {}),
  };
  if (shadows.length) css.textShadow = shadows.join(', ');
  if (style.stroke.enabled) {
    css.WebkitTextStroke = `${cq(style.stroke.width)} ${style.stroke.color}`;
    css.paintOrder = 'stroke fill';
  }
  if (style.blur > 0) css.filter = `blur(${cq(style.blur)})`;
  // giro em torno do centro da caixa (o translate mantém o centro no ponto x/y)
  if (style.rotation) css.transform = `translate(-50%, -50%) rotate(${style.rotation}deg)`;
  return css;
}

/** Estilo CSS de uma palavra que sobrepõe o da camada (tamanho em `em` relativo à camada). */
export function wordCss(w: WordStyle, base = 1): CSSProperties {
  const c: CSSProperties = {};
  if (w.fontFamily) c.fontFamily = w.fontFamily;
  // `base` = escala da palavra maior da linha: o bloco da linha já tem esse tamanho
  const rel = (w.scale ?? 1) / base;
  if (rel !== 1) c.fontSize = `${rel}em`;
  else if (w.scale !== undefined && base !== 1) c.fontSize = '1em';
  if (w.weight !== undefined) c.fontWeight = w.weight;
  if (w.color) c.color = w.color;
  if (w.italic !== undefined) c.fontStyle = w.italic ? 'italic' : 'normal';
  if (w.textCase) c.textTransform = w.textCase === 'upper' ? 'uppercase' : w.textCase === 'lower' ? 'lowercase' : 'none';
  if (w.letterSpacing !== undefined) c.letterSpacing = `${w.letterSpacing / 100}em`;
  return c;
}

export function adjustFilter(bg: Background): string | undefined {
  const a = bg.adjust;
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== 100) parts.push(`saturate(${a.saturate / 100})`);
  if (a.blur > 0) parts.push(`blur(${cq(a.blur)})`);
  return parts.length ? parts.join(' ') : undefined;
}

export function gradientCss(bg: Background): string {
  const stops = [...bg.gradient.stops].sort((a, b) => a.at - b.at).map((s) => `${s.color} ${s.at}%`);
  if (stops.length === 1) stops.push(stops[0]);
  return `linear-gradient(${bg.gradient.angle}deg, ${stops.join(', ')})`;
}

export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
