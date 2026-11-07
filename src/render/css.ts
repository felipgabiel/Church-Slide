import type { CSSProperties } from 'react';
import type { Background, TextStyle } from '../core/types';

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
    width: `${style.width}%`,
    fontFamily: style.fontFamily,
    fontSize: `calc(${style.fontSize}cqh * var(--fit, 1))`,
    color: style.color,
    fontWeight: style.bold ? 800 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textTransform: style.uppercase ? 'uppercase' : 'none',
    letterSpacing: `${style.letterSpacing / 100}em`,
    lineHeight: style.lineHeight,
    textAlign: style.align,
    opacity: style.opacity / 100,
  };
  if (shadows.length) css.textShadow = shadows.join(', ');
  if (style.stroke.enabled) {
    css.WebkitTextStroke = `${cq(style.stroke.width)} ${style.stroke.color}`;
    css.paintOrder = 'stroke fill';
  }
  if (style.blur > 0) css.filter = `blur(${cq(style.blur)})`;
  return css;
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
