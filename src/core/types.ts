/**
 * Modelo de dados do Church Slide.
 * Tudo aqui é serializável em JSON (vai para o IndexedDB). Mídia pesada
 * (imagens, vídeos, fontes) fica em outro store e é referenciada por `mediaId`.
 */

export type Aspect = '16:9' | '16:10' | '4:3' | '21:9' | '1:1';

export const ASPECT_RATIOS: Record<Aspect, number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
  '1:1': 1,
};

export type Align = 'left' | 'center' | 'right';
export type LayerRole = 'lyrics' | 'title' | 'credit' | 'free';

/** Estilo de texto. Medidas em "unidades de tela" para escalar com qualquer resolução. */
export interface TextStyle {
  fontFamily: string;
  /** Tamanho da fonte em % da altura do slide. */
  fontSize: number;
  color: string;
  bold: boolean;
  /** Peso exato (100–900). Ausente = 800 se `bold`, senão 400. Usado quando uma palavra é separada do texto. */
  weight?: number;
  italic: boolean;
  uppercase: boolean;
  /** Espaçamento entre letras em centésimos de em (2 = 0.02em). */
  letterSpacing: number;
  lineHeight: number;
  align: Align;
  /** Centro do bloco de texto, em % da largura/altura. */
  x: number;
  y: number;
  /** Largura do bloco, em % da largura do slide. */
  width: number;
  /** 0–100 */
  opacity: number;
  /** Desfoque estático (décimos de % da altura). 0 = nítido. */
  blur: number;
  shadow: { enabled: boolean; color: string; x: number; y: number; blur: number };
  stroke: { enabled: boolean; color: string; width: number };
  glow: { enabled: boolean; color: string; blur: number };
  /** Reduz a fonte automaticamente se o texto não couber na tela. */
  autoFit: boolean;
  /**
   * Igualar a largura das linhas: a linha mais estreita fica no tamanho da camada e as demais
   * encolhem até terem o mesmo comprimento (linha com mais palavras = letra menor).
   */
  equalize: boolean;
  /** No modo "igualar": menor tamanho que uma linha pode ter, em % do tamanho da camada. */
  equalizeMin: number;
  /** A caixa acompanha o tamanho do texto (palavras soltas); a largura em % é ignorada. */
  autoWidth: boolean;
}

export type TextCase = 'none' | 'upper' | 'lower';

/** Ajustes de UMA palavra sobre o estilo da camada. Campo ausente = herda da camada. */
export interface WordStyle {
  fontFamily?: string;
  /** Multiplicador do tamanho da camada (1 = igual, 2 = o dobro). */
  scale?: number;
  /** 100–900 */
  weight?: number;
  color?: string;
  italic?: boolean;
  textCase?: TextCase;
  /** centésimos de em */
  letterSpacing?: number;
}

/** Animação de entrada própria de uma palavra (substitui a do trecho para ela). */
export interface WordAnim {
  /** Efeitos completos (não mesclam com os do trecho). */
  enter: AnimPhase;
  /** ms somados ao início da palavra */
  delay?: number;
  /** ms; ausente = duração do trecho */
  duration?: number;
  /** 0–100; ausente = intensidade do trecho */
  intensity?: number;
}

/** Como a troca de cor percorre o texto. */
export type ColorMode = 'all' | 'word' | 'letter';

/**
 * Troca de cor ao longo do tempo: o texto entra com a animação normal e DEPOIS vai mudando de cor
 * aos poucos (ex.: de branco para verde). Pode ser tudo de uma vez, palavra por palavra ou letra por letra.
 */
export interface ColorFx {
  /** cor final (hexadecimal) */
  to: string;
  /** cor inicial; ausente = a cor que o texto já tem */
  from?: string;
  mode: ColorMode;
  /** ms depois que a animação de entrada termina */
  delay: number;
  /** ms que cada parte (texto, palavra ou letra) leva para trocar de cor */
  duration: number;
  /** ms entre uma palavra/letra e a seguinte (ignorado em "tudo junto") */
  stagger: number;
  /** a cor vai e volta (efeito de brilho que passa), em vez de ficar na cor final */
  back?: boolean;
}

export interface WordOverride {
  style?: WordStyle;
  anim?: WordAnim;
  /** troca de cor própria desta palavra (vale mais que a do trecho) */
  colorFx?: ColorFx;
}

export interface TextLayer {
  id: string;
  role: LayerRole;
  name: string;
  text: string;
  visible: boolean;
  style: TextStyle;
  /**
   * Ajustes por palavra. A chave é a posição da palavra no texto da camada
   * (0 = primeira palavra, contando através das linhas). Se o texto for editado,
   * as posições continuam valendo — por isso o painel avisa ao mudar a contagem.
   */
  words?: Record<string, WordOverride>;
}

export type BackgroundKind = 'solid' | 'gradient' | 'image' | 'video' | 'animated';
export type AnimatedKind = 'aurora' | 'drift' | 'bokeh' | 'rays' | 'waves';

export interface BackgroundAdjust {
  /** 0–200, 100 = original */
  brightness: number;
  contrast: number;
  saturate: number;
  /** décimos de % da altura; 0 = nítido */
  blur: number;
  /** escurecimento por cima do fundo, 0–90 (%) */
  dim: number;
}

export interface Background {
  kind: BackgroundKind;
  color: string;
  gradient: { angle: number; stops: { color: string; at: number }[] };
  mediaId: string | null;
  animated: AnimatedKind;
  /** velocidade do fundo animado e do vídeo (0.25–2) */
  speed: number;
  /** 100–300 */
  scale: number;
  posX: number;
  posY: number;
  adjust: BackgroundAdjust;
}

export type EasingName = 'linear' | 'ease-out' | 'ease-in-out' | 'smooth' | 'back' | 'expo';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type AnimUnit = 'block' | 'line' | 'word';

/** Efeitos combináveis de uma fase (entrada ou saída). */
export interface AnimPhase {
  fade: boolean;
  slide: boolean;
  zoom: 'none' | 'in' | 'out';
  blur: boolean;
}

export interface AnimationConfig {
  /** Nome do preset de origem (apenas rótulo). */
  preset: string;
  enter: AnimPhase;
  exit: AnimPhase;
  direction: Direction;
  unit: AnimUnit;
  /** ms */
  duration: number;
  /** multiplicador de velocidade (0.25–3) */
  speed: number;
  /** ms antes de começar */
  delay: number;
  /** ms entre unidades (palavras/linhas) */
  stagger: number;
  /** 0–100 */
  intensity: number;
  easing: EasingName;
  /** 0–100: borrão de movimento verdadeiro, proporcional à velocidade */
  motionBlur: number;
  /** 0–100: flutuação suave contínua enquanto o texto está na tela */
  float: number;
  /** troca de cor depois da entrada (opcional) */
  colorFx?: ColorFx | null;
}

export interface Slide {
  id: string;
  label: string;
  layers: TextLayer[];
  /** null = usa o fundo do tema do projeto */
  background: Background | null;
  /** null = usa a animação do tema */
  animation: AnimationConfig | null;
  /** segundos, para avanço automático (opcional) */
  duration: number | null;
  notes: string;
}

export interface Theme {
  text: TextStyle;
  background: Background;
  animation: AnimationConfig;
}

export type SplitMode = 'stanza' | 'line' | 'pairs' | 'manual';

export interface Project {
  id: string;
  schema: number;
  name: string;
  artist: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  aspect: Aspect;
  theme: Theme;
  slides: Slide[];
  isTemplate: boolean;
  deletedAt: number | null;
  /** Letra original e modo de divisão usados pela última vez. */
  lyrics: string;
  splitMode: SplitMode;
  /** Se definido, letras novas recebem o layout tipográfico automático. */
  autoLayout?: 'impact';
}

export const SCHEMA_VERSION = 1;

export interface MediaRecord {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'font';
  mime: string;
  size: number;
  createdAt: number;
  blob: Blob;
  thumb?: Blob;
  /** Nome da família CSS (somente fontes). */
  family?: string;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
