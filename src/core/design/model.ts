import { normalizeHex } from '../colorMath';
import { uid } from '../ids';
import type {
  BackgroundDesign,
  DesignBlend,
  DesignFill,
  DesignFillType,
  DesignLayer,
  DesignLayerKind,
  DesignMotion,
  DesignMotionKind,
  DesignShape,
  DesignTexture,
} from '../types';
import { clamp, isPlainObject } from '../util';
import { tr } from '../i18n';

/**
 * Modelo do Estúdio de Fundos: valores padrão, criação e validação.
 * Tudo aqui é puro (sem DOM) para poder ser testado e usado tanto no app quanto no gerador de vídeo.
 */

export const LOOP_OPTIONS = [6, 8, 12, 20, 30] as const;
export const DEFAULT_LOOP = 12;
export const MAX_LAYERS = 24;
export const MAX_STOPS = 6;

export const LAYER_KINDS: { kind: DesignLayerKind; label: string; hint: string }[] = [
  { kind: 'gradient', label: tr('Degradê'), hint: tr('Cores que se misturam pela tela') },
  { kind: 'shape', label: tr('Forma'), hint: tr('Círculo, portal, faixa, retângulo ou polígono') },
  { kind: 'glow', label: tr('Luz'), hint: tr('Halo de luz difusa') },
  { kind: 'waves', label: tr('Ondas'), hint: tr('Fios de luz ondulados') },
  { kind: 'texture', label: tr('Textura'), hint: tr('Listras diagonais ou grão') },
  { kind: 'particles', label: tr('Partículas'), hint: tr('Pontos de luz subindo') },
  { kind: 'media', label: tr('Imagem ou vídeo'), hint: tr('Uma foto ou um vídeo seu, com movimento e desfoque') },
];

export const KIND_LABEL: Record<DesignLayerKind, string> = Object.fromEntries(LAYER_KINDS.map((k) => [k.kind, k.label])) as Record<DesignLayerKind, string>;

export const SHAPE_LABEL: Record<DesignShape, string> = {
  circle: tr('Círculo'),
  rounded: tr('Retângulo'),
  arch: tr('Portal (arco)'),
  band: tr('Faixa'),
  polygon: tr('Polígono'),
};

export const MOTION_LABEL: Record<DesignMotionKind, string> = {
  drift: tr('Derivar'),
  breathe: tr('Respirar'),
  spin: tr('Girar'),
  flow: tr('Fluir'),
  colors: tr('Ciclo de cores'),
  twinkle: tr('Cintilar'),
};

export const MOTION_HINT: Record<DesignMotionKind, string> = {
  drift: tr('Passeia devagar num caminho em 8'),
  breathe: tr('Cresce e diminui; a luz pulsa'),
  spin: tr('Dá voltas em torno do centro'),
  flow: tr('Listras, ondas e degradês correm na própria direção'),
  colors: tr('As cores percorrem uma paleta e voltam à primeira'),
  twinkle: tr('Brilho que acende e apaga'),
};

/** Movimentos que fazem sentido em cada tipo de camada. */
export function motionsFor(kind: DesignLayerKind): DesignMotionKind[] {
  switch (kind) {
    case 'gradient':
      return ['flow', 'colors', 'drift', 'breathe'];
    case 'shape':
      return ['drift', 'breathe', 'spin', 'colors', 'flow'];
    case 'glow':
      return ['breathe', 'drift', 'colors', 'twinkle'];
    case 'waves':
      return ['flow', 'drift', 'breathe', 'colors'];
    case 'texture':
      return ['flow', 'twinkle', 'spin'];
    case 'particles':
      return ['twinkle', 'drift', 'colors'];
    case 'media':
      return ['drift', 'breathe', 'spin', 'twinkle'];
  }
}

export const BLEND_LABEL: Record<DesignBlend, string> = {
  normal: tr('Normal'),
  screen: tr('Tela (clareia)'),
  lighter: tr('Somar luz'),
  overlay: tr('Sobrepor'),
  multiply: tr('Multiplicar (escurece)'),
  difference: tr('Inverter cores (diferença)'),
};

const KINDS: DesignLayerKind[] = ['gradient', 'shape', 'glow', 'waves', 'texture', 'particles', 'media'];
const SHAPES: DesignShape[] = ['circle', 'rounded', 'arch', 'band', 'polygon'];
const FILLS: DesignFillType[] = ['solid', 'linear', 'radial', 'conic'];
const BLENDS: DesignBlend[] = ['normal', 'screen', 'overlay', 'multiply', 'lighter', 'difference'];
const TEXTURES: DesignTexture[] = ['grain', 'stripes'];
const MOTIONS: DesignMotionKind[] = ['drift', 'breathe', 'spin', 'flow', 'colors', 'twinkle'];

const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const num = (v: unknown, def: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : def);
const hex = (v: unknown, def: string) => (typeof v === 'string' && normalizeHex(v)) || def;

export function fill(type: DesignFillType, colors: string[], angle = 135): DesignFill {
  const n = Math.max(1, colors.length);
  return { type, angle, stops: colors.map((color, i) => ({ color, at: n === 1 ? 0 : Math.round((i * 100) / (n - 1)) })) };
}

const BASE: Omit<DesignLayer, 'id' | 'kind' | 'name'> = {
  visible: true,
  locked: false,
  opacity: 100,
  blend: 'normal',
  blur: 0,
  x: 50,
  y: 50,
  w: 50,
  h: 50,
  rotation: 0,
  fill: fill('solid', ['#ffffff']),
  shape: 'circle',
  radius: 18,
  sides: 6,
  count: 5,
  amplitude: 8,
  thickness: 30,
  texture: 'stripes',
  scale: 4,
  clip: false,
  motions: [],
};

/** Camada nova de um tipo, já com valores que ficam bonitos sem mexer em nada. */
export function newDesignLayer(kind: DesignLayerKind, patch: Partial<DesignLayer> = {}): DesignLayer {
  const presets: Record<DesignLayerKind, Partial<DesignLayer>> = {
    gradient: { w: 100, h: 100, fill: fill('linear', ['#1e1b4b', '#7c3aed', '#f97316'], 160) },
    shape: { w: 46, h: 46, fill: fill('linear', ['#fb923c', '#c4b5fd'], 160), shape: 'circle' },
    glow: { w: 70, h: 70, opacity: 85, blend: 'screen', fill: fill('solid', ['#ef4444']) },
    waves: { y: 62, w: 100, h: 40, count: 6, amplitude: 9, thickness: 6, blur: 6, blend: 'screen', fill: fill('linear', ['#f43f5e', '#a78bfa', '#38bdf8'], 90), motions: [{ kind: 'flow', amount: 60, cycles: 1 }] },
    texture: { w: 100, h: 100, texture: 'stripes', scale: 3, thickness: 45, rotation: -35, opacity: 40, blend: 'overlay', fill: fill('solid', ['#ffffff']) },
    media: { w: 100, h: 56.25, fit: 'cover' },
    particles: { w: 100, h: 100, count: 28, scale: 3, opacity: 80, blur: 4, blend: 'screen', fill: fill('linear', ['#fde68a', '#f9a8d4'], 90), motions: [{ kind: 'twinkle', amount: 50, cycles: 2 }] },
  };
  return {
    ...BASE,
    ...presets[kind],
    id: uid('dl'),
    kind,
    name: KIND_LABEL[kind],
    ...patch,
    fill: patch.fill ?? presets[kind].fill ?? BASE.fill,
    motions: patch.motions ?? presets[kind].motions ?? [],
  };
}

export function newDesign(name = tr('Novo fundo'), layers: DesignLayer[] = [], base = '#0b0b12'): BackgroundDesign {
  const now = Date.now();
  return { id: uid('bg'), name, loopSec: DEFAULT_LOOP, base, layers, createdAt: now, updatedAt: now };
}

function sanitizeFill(raw: unknown, def: DesignFill): DesignFill {
  const r = isPlainObject(raw) ? raw : {};
  const stops = (Array.isArray(r.stops) ? r.stops : [])
    .filter(isPlainObject)
    .slice(0, MAX_STOPS)
    .map((s) => ({ color: hex(s.color, '#ffffff'), at: num(s.at, 0, 0, 100) }));
  return {
    type: pick(r.type, FILLS, def.type),
    angle: num(r.angle, def.angle, -360, 720),
    stops: stops.length ? stops : def.stops,
  };
}

function sanitizeMotion(raw: unknown): DesignMotion | null {
  if (!isPlainObject(raw) || !MOTIONS.includes(raw.kind as DesignMotionKind)) return null;
  const m: DesignMotion = { kind: raw.kind as DesignMotionKind, amount: num(raw.amount, 50, 0, 100), cycles: Math.round(num(raw.cycles, 1, 1, 4)) };
  if (m.kind === 'colors') {
    const colors = (Array.isArray(raw.colors) ? raw.colors : []).map((c) => hex(c, '')).filter(Boolean).slice(0, 6);
    m.colors = colors.length >= 2 ? colors : ['#f97316', '#a78bfa', '#38bdf8'];
  }
  return m;
}

export function sanitizeLayer(raw: unknown): DesignLayer | null {
  if (!isPlainObject(raw)) return null;
  const kind = pick(raw.kind, KINDS, 'gradient');
  const def = newDesignLayer(kind);
  const motions = (Array.isArray(raw.motions) ? raw.motions : []).map(sanitizeMotion).filter((m): m is DesignMotion => !!m).slice(0, 4);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : def.id,
    kind,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 60) : def.name,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    opacity: num(raw.opacity, def.opacity, 0, 100),
    blend: pick(raw.blend, BLENDS, def.blend),
    blur: num(raw.blur, def.blur, 0, 100),
    x: num(raw.x, def.x, -100, 200),
    y: num(raw.y, def.y, -100, 200),
    w: num(raw.w, def.w, 1, 400),
    h: num(raw.h, def.h, 1, 400),
    rotation: num(raw.rotation, def.rotation, -360, 360),
    fill: sanitizeFill(raw.fill, def.fill),
    shape: pick(raw.shape, SHAPES, def.shape),
    radius: num(raw.radius, def.radius, 0, 50),
    sides: Math.round(num(raw.sides, def.sides, 3, 12)),
    count: Math.round(num(raw.count, def.count, 1, 120)),
    amplitude: num(raw.amplitude, def.amplitude, 0, 40),
    thickness: num(raw.thickness, def.thickness, 1, 100),
    texture: pick(raw.texture, TEXTURES, def.texture),
    scale: num(raw.scale, def.scale, 0.5, 30),
    clip: raw.clip === true,
    motions,
    ...(kind === 'media'
      ? {
          mediaId: typeof raw.mediaId === 'string' && /^m_[a-z0-9]+$/i.test(raw.mediaId) ? raw.mediaId : undefined,
          mediaKind: raw.mediaKind === 'video' ? ('video' as const) : ('image' as const),
          fit: raw.fit === 'free' ? ('free' as const) : ('cover' as const),
        }
      : {}),
  };
}

/** Valida um fundo vindo do banco ou de um arquivo: nunca confia no formato. */
export function sanitizeDesign(raw: unknown): BackgroundDesign | null {
  if (!isPlainObject(raw)) return null;
  const now = Date.now();
  const layers = (Array.isArray(raw.layers) ? raw.layers : []).map(sanitizeLayer).filter((l): l is DesignLayer => !!l).slice(0, MAX_LAYERS);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('bg'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : tr('Fundo sem nome'),
    loopSec: num(raw.loopSec, DEFAULT_LOOP, 2, 60),
    base: hex(raw.base, '#0b0b12'),
    layers,
    createdAt: num(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: num(raw.updatedAt, now, 0, Number.MAX_SAFE_INTEGER),
  };
}

/** Cópia independente (novos ids), para duplicar ou para guardar dentro de um louvor. */
export function copyDesign(d: BackgroundDesign, patch: Partial<BackgroundDesign> = {}): BackgroundDesign {
  const now = Date.now();
  return { ...structuredClone(d), id: uid('bg'), createdAt: now, updatedAt: now, ...patch };
}

/** Cor "média" do fundo: usada como cor de reserva do slide e para a luz da biblioteca. */
export function designAccent(d: BackgroundDesign): string[] {
  const out: string[] = [];
  for (const l of [...d.layers].reverse()) {
    if (!l.visible) continue;
    for (const s of l.fill.stops) if (!out.includes(s.color)) out.push(s.color);
    if (out.length >= 3) break;
  }
  return out.length ? out : [d.base];
}
