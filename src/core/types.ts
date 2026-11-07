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
}

export interface TextLayer {
  id: string;
  role: LayerRole;
  name: string;
  text: string;
  visible: boolean;
  style: TextStyle;
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
