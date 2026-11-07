import { defaultBackground } from './defaults';
import type { AnimatedKind, Background, DeepPartial } from './types';
import { deepMerge } from './util';

/**
 * Biblioteca de fundos que já vem no aplicativo. Tudo é gerado por CSS/SVG (sem arquivos
 * de imagem), então funciona offline, pesa quase nada e fica nítido em qualquer resolução.
 * Imagens e vídeos próprios entram pelo upload (guardados no IndexedDB).
 */
export type BackgroundGroup = 'Cores' | 'Degradês' | 'Animados';

export interface BackgroundPreset {
  id: string;
  name: string;
  group: BackgroundGroup;
  bg: Background;
}

const make = (patch: DeepPartial<Background>): Background => deepMerge(defaultBackground(), patch);

const solid = (id: string, name: string, color: string): BackgroundPreset => ({ id, name, group: 'Cores', bg: make({ kind: 'solid', color }) });

const gradient = (id: string, name: string, angle: number, colors: string[]): BackgroundPreset => ({
  id,
  name,
  group: 'Degradês',
  bg: make({
    kind: 'gradient',
    color: colors[colors.length - 1],
    gradient: { angle, stops: colors.map((color, i) => ({ color, at: Math.round((i * 100) / Math.max(1, colors.length - 1)) })) },
  }),
});

const animated = (id: string, name: string, kind: AnimatedKind, base: string, colors: [string, string, string], speed = 1): BackgroundPreset => ({
  id,
  name,
  group: 'Animados',
  bg: make({
    kind: 'animated',
    animated: kind,
    color: base,
    speed,
    gradient: { angle: 160, stops: colors.map((color, i) => ({ color, at: i * 50 })) },
    adjust: { dim: 8 },
  }),
});

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  solid('solid-black', 'Preto', '#000000'),
  solid('solid-graphite', 'Grafite', '#15171c'),
  solid('solid-navy', 'Azul-noite', '#0a1530'),
  solid('solid-wine', 'Vinho', '#2a0d18'),
  solid('solid-forest', 'Floresta', '#0c2018'),
  solid('solid-cream', 'Creme', '#f4eedf'),

  gradient('grad-night', 'Noite', 180, ['#123677', '#050a1c']),
  gradient('grad-violet', 'Violeta', 160, ['#4a2394', '#0a0614']),
  gradient('grad-gold', 'Ouro escuro', 180, ['#3a2a10', '#0b0805']),
  gradient('grad-dawn', 'Amanhecer', 170, ['#ff9a5a', '#c04a6b', '#3a1d6b']),
  gradient('grad-ocean', 'Oceano', 175, ['#0e7c9c', '#05364f', '#021520']),
  gradient('grad-forest', 'Mata', 170, ['#256b45', '#06150e']),
  gradient('grad-ember', 'Brasa', 180, ['#d4510e', '#5a1a06', '#120503']),
  gradient('grad-sky', 'Céu', 180, ['#7db4ff', '#2b47a0', '#0b1236']),

  animated('anim-aurora', 'Aurora', 'aurora', '#070914', ['#6d5cff', '#00c2a8', '#ff5ea8']),
  animated('anim-aurora-gold', 'Aurora dourada', 'aurora', '#0c0805', ['#f6b73c', '#c2410c', '#6d28d9'], 0.8),
  animated('anim-aurora-blue', 'Aurora azul', 'aurora', '#030a1a', ['#2d6bff', '#12c2e9', '#7a4dff']),
  animated('anim-drift', 'Deriva', 'drift', '#06070b', ['#3b2a8f', '#0d6b86', '#8a2d6b'], 0.8),
  animated('anim-bokeh', 'Luzes', 'bokeh', '#0a0b12', ['#ffd27a', '#ff9d5c', '#fff1c4']),
  animated('anim-rays', 'Raios de luz', 'rays', '#05060a', ['#ffe9a8', '#9fc5ff', '#ffd27a'], 0.8),
  animated('anim-waves', 'Ondas', 'waves', '#03101c', ['#0f6ea8', '#1397c9', '#0a4a78']),
];

export const BACKGROUND_GROUPS: BackgroundGroup[] = ['Animados', 'Degradês', 'Cores'];

export const ANIMATED_LABELS: Record<AnimatedKind, string> = {
  aurora: 'Aurora',
  drift: 'Deriva',
  bokeh: 'Luzes',
  rays: 'Raios',
  waves: 'Ondas',
};

/** Cores-padrão ao trocar o tipo de fundo para um tipo que ainda não tem cores definidas. */
export function ensureStops(bg: Background, count: number): Background['gradient']['stops'] {
  const stops = [...bg.gradient.stops];
  const fallback = ['#6d5cff', '#00c2a8', '#ff5ea8'];
  while (stops.length < count) stops.push({ color: fallback[stops.length % fallback.length], at: Math.round((stops.length * 100) / Math.max(1, count - 1)) });
  return stops;
}
