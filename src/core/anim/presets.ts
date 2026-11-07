import type { AnimPhase, AnimationConfig, Direction } from '../types';

const OFF: AnimPhase = { fade: false, slide: false, zoom: 'none', blur: false };
const phase = (p: Partial<AnimPhase>): AnimPhase => ({ ...OFF, ...p });

export function baseAnimation(): AnimationConfig {
  return {
    preset: 'slide-up',
    enter: phase({ fade: true, slide: true }),
    exit: phase({ fade: true, slide: true }),
    direction: 'up',
    unit: 'line',
    duration: 800,
    speed: 1,
    delay: 0,
    stagger: 110,
    intensity: 50,
    easing: 'ease-out',
    motionBlur: 35,
    float: 0,
  };
}

export type PresetGroup = 'Básicas' | 'Movimento' | 'Combinadas' | 'Por texto';

export interface AnimPreset {
  id: string;
  label: string;
  group: PresetGroup;
  /** Descrição curta mostrada na biblioteca. */
  hint: string;
  config: Partial<AnimationConfig>;
}

const dir = (d: Direction) => d;

export const ANIMATION_PRESETS: AnimPreset[] = [
  {
    id: 'none',
    label: 'Sem animação',
    group: 'Básicas',
    hint: 'Troca instantânea',
    config: { enter: OFF, exit: OFF, motionBlur: 0, duration: 1, stagger: 0, float: 0, unit: 'block' },
  },
  {
    id: 'fade',
    label: 'Fade',
    group: 'Básicas',
    hint: 'Aparece e some suavemente',
    config: {
      enter: phase({ fade: true }),
      exit: phase({ fade: true }),
      unit: 'block',
      stagger: 0,
      motionBlur: 0,
      duration: 700,
      easing: 'smooth',
    },
  },
  {
    id: 'blur',
    label: 'Blur In/Out',
    group: 'Básicas',
    hint: 'Surge do desfoque',
    config: {
      enter: phase({ fade: true, blur: true }),
      exit: phase({ fade: true, blur: true }),
      unit: 'block',
      stagger: 0,
      motionBlur: 0,
      duration: 900,
      easing: 'smooth',
    },
  },
  {
    id: 'zoom-in',
    label: 'Zoom In',
    group: 'Básicas',
    hint: 'Cresce até o tamanho final',
    config: {
      enter: phase({ fade: true, zoom: 'in' }),
      exit: phase({ fade: true, zoom: 'in' }),
      unit: 'block',
      stagger: 0,
      motionBlur: 20,
      duration: 800,
      easing: 'ease-out',
    },
  },
  {
    id: 'zoom-out',
    label: 'Zoom Out',
    group: 'Básicas',
    hint: 'Encolhe até o tamanho final',
    config: {
      enter: phase({ fade: true, zoom: 'out' }),
      exit: phase({ fade: true, zoom: 'out' }),
      unit: 'block',
      stagger: 0,
      motionBlur: 20,
      duration: 800,
      easing: 'ease-out',
    },
  },
  ...(['up', 'down', 'left', 'right'] as Direction[]).map<AnimPreset>((d) => ({
    id: `slide-${d}`,
    label: { up: 'Slide Up', down: 'Slide Down', left: 'Slide Left', right: 'Slide Right' }[d],
    group: 'Movimento',
    hint: { up: 'Sobe para o lugar', down: 'Desce para o lugar', left: 'Entra pela direita', right: 'Entra pela esquerda' }[d],
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true, slide: true }),
      direction: dir(d),
      unit: 'block',
      stagger: 0,
      motionBlur: 35,
      duration: 800,
      easing: 'ease-out',
    },
  })),
  {
    id: 'float',
    label: 'Movimento suave',
    group: 'Movimento',
    hint: 'Entrada lenta e flutuação contínua',
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true }),
      direction: 'up',
      unit: 'block',
      stagger: 0,
      intensity: 25,
      duration: 1400,
      easing: 'smooth',
      motionBlur: 15,
      float: 45,
    },
  },
  {
    id: 'rise-blur',
    label: 'Sobe com desfoque',
    group: 'Combinadas',
    hint: 'Fade + slide + blur',
    config: {
      enter: phase({ fade: true, slide: true, blur: true }),
      exit: phase({ fade: true, blur: true }),
      direction: 'up',
      unit: 'block',
      stagger: 0,
      motionBlur: 40,
      duration: 1000,
      easing: 'ease-out',
    },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    group: 'Combinadas',
    hint: 'Zoom lento + desfoque + brilho de movimento',
    config: {
      enter: phase({ fade: true, zoom: 'out', blur: true }),
      exit: phase({ fade: true, zoom: 'out', blur: true }),
      unit: 'block',
      stagger: 0,
      intensity: 35,
      motionBlur: 55,
      duration: 1300,
      easing: 'smooth',
    },
  },
  {
    id: 'focus',
    label: 'Foco',
    group: 'Combinadas',
    hint: 'Zoom In + blur, ideal para refrões',
    config: {
      enter: phase({ fade: true, zoom: 'in', blur: true }),
      exit: phase({ fade: true, zoom: 'in', blur: true }),
      unit: 'block',
      stagger: 0,
      intensity: 40,
      motionBlur: 30,
      duration: 900,
      easing: 'back',
    },
  },
  {
    id: 'by-line',
    label: 'Linha por linha',
    group: 'Por texto',
    hint: 'Cada linha entra em sequência',
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true, slide: true }),
      direction: 'up',
      unit: 'line',
      stagger: 140,
      motionBlur: 35,
      duration: 750,
      easing: 'ease-out',
    },
  },
  {
    id: 'by-word',
    label: 'Palavra por palavra',
    group: 'Por texto',
    hint: 'Cada palavra surge em sequência',
    config: {
      enter: phase({ fade: true, slide: true, blur: true }),
      exit: phase({ fade: true }),
      direction: 'up',
      unit: 'word',
      stagger: 70,
      intensity: 35,
      motionBlur: 40,
      duration: 650,
      easing: 'ease-out',
    },
  },
  {
    id: 'by-phrase',
    label: 'Frase inteira',
    group: 'Por texto',
    hint: 'A frase entra de uma vez',
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true }),
      direction: 'up',
      unit: 'block',
      stagger: 0,
      motionBlur: 30,
      duration: 800,
      easing: 'ease-out',
    },
  },
];

export function getPreset(id: string): AnimPreset | undefined {
  return ANIMATION_PRESETS.find((p) => p.id === id);
}

/** Aplica um preset por cima de uma configuração, preservando ajustes finos fora do preset. */
export function applyPreset(id: string, current?: AnimationConfig): AnimationConfig {
  const preset = getPreset(id);
  const base = { ...baseAnimation(), ...(current ?? {}) };
  if (!preset) return base;
  return { ...base, ...preset.config, preset: id };
}

export const DIRECTION_LABELS: Record<Direction, string> = {
  up: 'Para cima',
  down: 'Para baixo',
  left: 'Para a esquerda',
  right: 'Para a direita',
};
