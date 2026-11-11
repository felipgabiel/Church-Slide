import type { AnimPhase, AnimationConfig, ColorFx, Direction } from '../types';

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

/*
 * Regra: presets de EFEITO (fade, zoom, slide, blur, combinadas) NÃO definem `unit` nem `stagger`.
 * A granularidade (frase / linha / palavra) é uma escolha separada do usuário e precisa sobreviver
 * à troca de efeito. Só os presets "Por texto" e "Sem animação" definem a granularidade.
 * Antes, todo efeito forçava `unit: 'block'` e `stagger: 0`, desligando "Palavra" ao escolher um efeito.
 */
export type PresetGroup = 'Básicas' | 'Movimento' | 'Combinadas' | 'Por texto' | 'Troca de cor';

export const PRESET_GROUPS: PresetGroup[] = ['Básicas', 'Movimento', 'Combinadas', 'Por texto', 'Troca de cor'];

export interface AnimPreset {
  id: string;
  label: string;
  group: PresetGroup;
  /** Descrição curta mostrada na biblioteca. */
  hint: string;
  config: Partial<AnimationConfig>;
  /**
   * Troca de cor que o estilo coloca nas palavras MARCADAS (ou em todas do trecho, se nenhuma estiver marcada).
   * Não fica no trecho: a cor é sempre por palavra.
   */
  color?: ColorFx;
}

const dir = (d: Direction) => d;

export const ANIMATION_PRESETS: AnimPreset[] = [
  {
    id: 'none',
    label: 'Sem animação',
    group: 'Básicas',
    hint: 'Troca instantânea',
    config: { enter: OFF, exit: OFF, motionBlur: 0, duration: 1, float: 0 },
  },
  {
    id: 'fade',
    label: 'Fade',
    group: 'Básicas',
    hint: 'Aparece e some suavemente',
    config: {
      enter: phase({ fade: true }),
      exit: phase({ fade: true }),
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
  /*
   * "Troca de cor": a letra ENTRA com uma animação simples e, depois, a cor das palavras marcadas vai mudando.
   * Não mexem em `unit`/`stagger` do usuário. A cor de partida é a que o texto já tem (ex.: branco).
   */
  {
    id: 'color-green',
    label: 'Branco → verde',
    group: 'Troca de cor',
    hint: 'Aparece e vai ficando verde',
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true }),
      direction: 'up',
      motionBlur: 25,
      duration: 800,
      easing: 'ease-out',
    },
    color: { colors: ['#4ade80'], mode: 'all', start: 1600, duration: 1800, stagger: 0 },
  },
  {
    id: 'color-gold',
    label: 'Branco → dourado',
    group: 'Troca de cor',
    hint: 'Aparece e esquenta para dourado',
    config: {
      enter: phase({ fade: true, zoom: 'out' }),
      exit: phase({ fade: true }),
      motionBlur: 0,
      duration: 900,
      easing: 'smooth',
    },
    color: { colors: ['#fbbf24'], mode: 'all', start: 1600, duration: 1800, stagger: 0 },
  },
  {
    id: 'color-words',
    label: 'Cor palavra por palavra',
    group: 'Troca de cor',
    hint: 'Uma palavra de cada vez muda de cor',
    config: {
      enter: phase({ fade: true }),
      exit: phase({ fade: true }),
      motionBlur: 0,
      duration: 700,
      easing: 'smooth',
    },
    color: { colors: ['#4ade80'], mode: 'word', start: 1200, duration: 700, stagger: 260 },
  },
  {
    id: 'color-letters',
    label: 'Cor letra por letra',
    group: 'Troca de cor',
    hint: 'A cor corre pelas letras',
    config: {
      enter: phase({ fade: true, slide: true }),
      exit: phase({ fade: true }),
      direction: 'up',
      motionBlur: 20,
      duration: 800,
      easing: 'ease-out',
    },
    color: { colors: ['#4ade80'], mode: 'letter', start: 1300, duration: 500, stagger: 55 },
  },
  {
    id: 'color-pulse',
    label: 'Brilho que passa',
    group: 'Troca de cor',
    hint: 'Uma onda de cor passa e volta ao normal',
    config: {
      enter: phase({ fade: true }),
      exit: phase({ fade: true }),
      motionBlur: 0,
      duration: 700,
      easing: 'smooth',
    },
    color: { colors: ['#fde047'], mode: 'letter', start: 1200, duration: 700, stagger: 60, back: true },
  },
  {
    id: 'color-sequence',
    label: 'Sequência de cores',
    group: 'Troca de cor',
    hint: 'Passa por várias cores e para na última',
    config: {
      enter: phase({ fade: true }),
      exit: phase({ fade: true }),
      motionBlur: 0,
      duration: 800,
      easing: 'smooth',
    },
    color: { colors: ['#38bdf8', '#a78bfa', '#f472b6'], mode: 'all', start: 1400, duration: 2400, stagger: 0 },
  },
];

/** Intervalo padrão entre unidades quando a granularidade muda e o intervalo estava zerado. */
export const DEFAULT_STAGGER: Record<'line' | 'word', number> = { line: 140, word: 70 };

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
