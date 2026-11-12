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
  /**
   * Menor letra que os ajustes AUTOMÁTICOS podem produzir, em % da altura do slide (legibilidade no telão).
   * Em vez de encolher abaixo disso, a linha quebra em duas ou mais. Não limita o tamanho que a pessoa escolhe.
   */
  minFont: number;
  /** giro da caixa de texto em graus (sentido horário), em torno do centro dela */
  rotation: number;
  /**
   * Como o texto se mistura com o fundo. `difference` = inverter cores: a letra mostra o negativo do que
   * está atrás dela (branco sobre vermelho vira ciano), então continua legível em fundos que mudam.
   */
  blend: TextBlend;
}

export type TextBlend = 'normal' | 'difference';

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
/** Como a troca de cor anda pelas palavras marcadas: todas juntas, uma palavra por vez ou letra por letra. */
export type ColorMode = 'all' | 'word' | 'letter';

/**
 * Troca de cor das palavras MARCADAS (fica em `WordOverride.colorFx`, nunca no trecho inteiro).
 * O texto entra com a animação normal e, a partir do instante `start`, passa pela sequência de cores
 * (ex.: branco → verde → amarelo). Palavras com exatamente a mesma configuração formam um grupo: é dentro do
 * grupo que "uma palavra por vez" e "letra por letra" contam a ordem.
 */
export interface ColorFx {
  /** sequência de cores, na ordem em que aparecem (1 ou mais; hexadecimal) */
  colors: string[];
  /** cor de partida; ausente = a cor que o texto já tem */
  from?: string;
  mode: ColorMode;
  /**
   * ms contados do começo do trecho até a troca começar. Se cair antes do fim da entrada,
   * a troca espera a entrada terminar (as duas nunca brigam).
   */
  start?: number;
  /** formato antigo: ms DEPOIS do fim da entrada (usado só quando `start` não existe) */
  delay?: number;
  /** ms que cada parte leva para percorrer a sequência inteira */
  duration: number;
  /** ms entre uma palavra/letra e a seguinte (ignorado em "todas juntas") */
  stagger: number;
  /** percorre a sequência e volta à cor original (brilho que passa) */
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
  /**
   * Camada que nasceu de palavras soltas de outra ("Soltar para mover"). Guarda de onde vieram para a
   * "Letra completa" continuar mostrando a frase inteira, com as palavras no lugar original.
   */
  detached?: DetachOrigin;
}

export interface DetachOrigin {
  /** camada de onde as palavras saíram */
  from: string;
  /** posição (linha, coluna em palavras) de cada palavra no texto original, no momento em que saiu */
  at: { line: number; col: number }[];
  /** linhas que ficaram vazias e sumiram da camada original (índices no texto original) */
  removedLines: number[];
}

export type BackgroundKind = 'solid' | 'gradient' | 'image' | 'video' | 'animated' | 'design';
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
  /**
   * Fundo criado no Estúdio de Fundos (kind 'design'). É uma CÓPIA: cada louvor guarda a sua,
   * então mudar o fundo em "Meus fundos" depois não altera louvores que já o usam.
   */
  design?: BackgroundDesign | null;
}

/* ------------------------- Estúdio de Fundos ------------------------- */

export type DesignLayerKind = 'gradient' | 'shape' | 'glow' | 'waves' | 'texture' | 'particles';
export type DesignShape = 'circle' | 'rounded' | 'arch' | 'band' | 'polygon';
export type DesignFillType = 'solid' | 'linear' | 'radial' | 'conic';
export type DesignBlend = 'normal' | 'screen' | 'overlay' | 'multiply' | 'lighter' | 'difference';
export type DesignTexture = 'grain' | 'stripes';
/** movimentos prontos; todos fecham exatamente no fim do loop */
export type DesignMotionKind = 'drift' | 'breathe' | 'spin' | 'flow' | 'colors' | 'twinkle';

export interface DesignFill {
  type: DesignFillType;
  /** graus (linear: direção; cônico: giro inicial) */
  angle: number;
  stops: { color: string; at: number }[];
}

export interface DesignMotion {
  kind: DesignMotionKind;
  /** 0–100 */
  amount: number;
  /** quantas voltas o movimento dá dentro de um loop (1–4) */
  cycles: number;
  /** paleta do ciclo de cores (2–6 cores) */
  colors?: string[];
}

/**
 * Uma camada do fundo. Campos que não se aplicam ao tipo são ignorados ao desenhar
 * (formato plano: simples de validar, copiar e editar no painel de ajustes).
 */
export interface DesignLayer {
  id: string;
  kind: DesignLayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0–100 */
  opacity: number;
  blend: DesignBlend;
  /** desfoque 0–100 (100 = 25% da altura) */
  blur: number;
  /** centro, em % da largura / altura */
  x: number;
  y: number;
  /** largura e altura, em % da ALTURA do slide (formas e luzes não se deformam em outras proporções) */
  w: number;
  h: number;
  rotation: number;
  fill: DesignFill;
  shape: DesignShape;
  /** cantos (retângulo) 0–50, em % do menor lado */
  radius: number;
  /** lados do polígono */
  sides: number;
  /** ondas: quantidade de fios; partículas: quantidade */
  count: number;
  /** ondas: altura da ondulação (% da altura) */
  amplitude: number;
  /** ondas: espessura do fio; listras: espessura (% do espaço) */
  thickness: number;
  texture: DesignTexture;
  /** textura: tamanho do grão / espaço entre listras (% da altura) */
  scale: number;
  /** recorta a camada pelo formato da camada logo abaixo (listras só dentro do sol) */
  clip: boolean;
  motions: DesignMotion[];
}

export interface BackgroundDesign {
  id: string;
  name: string;
  /** duração do loop em segundos */
  loopSec: number;
  /** cor que fica por baixo de tudo */
  base: string;
  /** de baixo para cima */
  layers: DesignLayer[];
  createdAt: number;
  updatedAt: number;
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
  /** formato antigo (troca de cor do trecho inteiro); convertido para as palavras ao abrir o projeto */
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
