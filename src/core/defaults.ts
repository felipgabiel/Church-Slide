import { baseAnimation } from './anim/presets';
import { uid } from './ids';
import {
  SCHEMA_VERSION,
  type Aspect,
  type Background,
  type LayerRole,
  type Project,
  type Slide,
  type TextLayer,
  type TextStyle,
  type Theme,
  type AnimationConfig,
  type ColorFx,
} from './types';
import { clone, deepMerge, fillDefaults } from './util';
import { sanitizeColorFx } from './anim/colorfx';
import { sanitizeDesign } from './design/model';
import { patchWord, sanitizeWords, tokenizeText } from './words';

export const SYSTEM_SANS = 'Inter, "Segoe UI", "Helvetica Neue", Roboto, system-ui, sans-serif';

/** Letra mínima dos ajustes automáticos: 4,5% da altura do slide (≈ 49 px em 1080p, legível no fundo do templo). */
export const MIN_FONT = 4.5;

export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: SYSTEM_SANS,
    fontSize: 8,
    color: '#ffffff',
    bold: true,
    italic: false,
    uppercase: false,
    letterSpacing: 1,
    lineHeight: 1.25,
    align: 'center',
    x: 50,
    y: 50,
    width: 84,
    opacity: 100,
    blur: 0,
    shadow: { enabled: true, color: '#000000', x: 0, y: 3, blur: 12 },
    stroke: { enabled: false, color: '#000000', width: 6 },
    glow: { enabled: false, color: '#ffd27a', blur: 30 },
    autoFit: true,
    equalize: false,
    equalizeMin: 30,
    autoWidth: false,
    minFont: MIN_FONT,
    rotation: 0,
  };
}

export function defaultBackground(): Background {
  return {
    kind: 'gradient',
    color: '#0b0c10',
    gradient: {
      angle: 160,
      stops: [
        { color: '#1a1c24', at: 0 },
        { color: '#050608', at: 100 },
      ],
    },
    mediaId: null,
    animated: 'aurora',
    speed: 1,
    scale: 100,
    posX: 50,
    posY: 50,
    adjust: { brightness: 100, contrast: 100, saturate: 100, blur: 0, dim: 0 },
  };
}

export function defaultTheme(): Theme {
  return { text: defaultTextStyle(), background: defaultBackground(), animation: baseAnimation() };
}

const ROLE_NAMES: Record<LayerRole, string> = {
  lyrics: 'Letra',
  title: 'Título',
  credit: 'Crédito',
  free: 'Texto livre',
};

/** Ajustes de estilo de cada tipo de camada em relação ao estilo base da letra. */
function roleStyle(role: LayerRole, base: TextStyle): TextStyle {
  switch (role) {
    case 'title':
      return deepMerge(base, { fontSize: 4.2, y: 11, bold: false, uppercase: true, letterSpacing: 22, opacity: 85, width: 80 });
    case 'credit':
      return deepMerge(base, { fontSize: 3, y: 92, bold: false, italic: true, letterSpacing: 6, opacity: 75, width: 80 });
    case 'free':
      return deepMerge(base, { fontSize: 5, y: 50 });
    default:
      return clone(base);
  }
}

export function newLayer(role: LayerRole, text: string, baseStyle: TextStyle): TextLayer {
  return { id: uid('l'), role, name: ROLE_NAMES[role], text, visible: true, style: roleStyle(role, baseStyle) };
}

export function newSlide(text: string, theme: Theme, label = ''): Slide {
  return {
    id: uid('s'),
    label,
    layers: [newLayer('lyrics', text, theme.text)],
    background: null,
    animation: null,
    duration: null,
    notes: '',
  };
}

export function newProject(name: string, opts: { theme?: Theme; aspect?: Aspect; category?: string; artist?: string } = {}): Project {
  const now = Date.now();
  const theme = opts.theme ? clone(opts.theme) : defaultTheme();
  return {
    id: uid('p'),
    schema: SCHEMA_VERSION,
    name,
    artist: opts.artist ?? '',
    category: opts.category ?? '',
    createdAt: now,
    updatedAt: now,
    aspect: opts.aspect ?? '16:9',
    theme,
    slides: [newSlide('', theme)],
    isTemplate: false,
    deletedAt: null,
    lyrics: '',
    splitMode: 'stanza',
  };
}

/**
 * Valida e completa um projeto vindo do armazenamento/importação.
 * Campos novos do modelo recebem valores padrão, então versões antigas continuam abrindo.
 */
/** Completa uma animação lida do disco. A troca de cor NÃO fica mais na animação (ver `legacyColorFx`). */
function cleanAnimation(raw: unknown): AnimationConfig {
  const a = fillDefaults(baseAnimation(), raw);
  delete a.colorFx;
  return a;
}

/** Troca de cor do formato antigo, guardada na animação do trecho/tema (valia para TODAS as palavras). */
const legacyColorFx = (raw: unknown) => sanitizeColorFx((raw as { colorFx?: unknown } | null | undefined)?.colorFx);

/**
 * Projetos antigos: a troca de cor ficava no trecho inteiro. Agora ela é por palavra; aqui ela vira a troca de
 * cor de cada palavra que ainda não tinha a sua — o vídeo continua igual ao que a pessoa já tinha montado.
 */
function moveColorToWords(layers: TextLayer[], fx: ColorFx | undefined): void {
  if (!fx) return;
  for (const layer of layers) {
    const n = tokenizeText(layer.text).reduce((c, l) => c + l.count, 0);
    for (let i = 0; i < n; i++) if (!layer.words?.[String(i)]?.colorFx) patchWord(layer, i, { colorFx: { ...fx } });
  }
}

/** Fundo validado; um fundo do Estúdio com dados ruins vira o degradê padrão (nunca tela preta quebrada). */
export function normalizeBackground(raw: unknown): Background {
  const bg = fillDefaults(defaultBackground(), raw);
  if (bg.kind === 'design') {
    const design = sanitizeDesign(bg.design);
    if (design) return { ...bg, design };
    return { ...bg, kind: 'gradient', design: null };
  }
  if (!['solid', 'gradient', 'image', 'video', 'animated'].includes(bg.kind)) bg.kind = 'gradient';
  delete bg.design;
  return bg;
}

export function normalizeProject(raw: unknown): Project {
  const r = (raw ?? {}) as Partial<Project>;
  const theme = fillDefaults(defaultTheme(), r.theme);
  theme.background = normalizeBackground(r.theme?.background);
  theme.animation = cleanAnimation(r.theme?.animation);
  const slides = (Array.isArray(r.slides) ? r.slides : []).map((s): Slide => {
    const slide = (s ?? {}) as Partial<Slide>;
    const layers = (Array.isArray(slide.layers) && slide.layers.length ? slide.layers : [newLayer('lyrics', '', theme.text)]).map(
      (l): TextLayer => {
        const layer = (l ?? {}) as Partial<TextLayer>;
        return {
          id: layer.id || uid('l'),
          role: layer.role ?? 'lyrics',
          name: layer.name ?? ROLE_NAMES[layer.role ?? 'lyrics'],
          text: typeof layer.text === 'string' ? layer.text : '',
          visible: layer.visible !== false,
          style: fillDefaults(defaultTextStyle(), layer.style),
          // sem isso, todo ajuste por palavra se perdia ao reabrir/importar o projeto
          ...(sanitizeWords(layer.words) ? { words: sanitizeWords(layer.words) } : {}),
        };
      },
    );
    moveColorToWords(layers, slide.animation ? legacyColorFx(slide.animation) : legacyColorFx(r.theme?.animation));
    return {
      id: slide.id || uid('s'),
      label: slide.label ?? '',
      layers,
      background: slide.background ? normalizeBackground(slide.background) : null,
      animation: slide.animation ? cleanAnimation(slide.animation) : null,
      duration: typeof slide.duration === 'number' ? slide.duration : null,
      notes: slide.notes ?? '',
    };
  });
  const now = Date.now();
  return {
    id: r.id || uid('p'),
    schema: SCHEMA_VERSION,
    name: r.name || 'Sem título',
    artist: r.artist ?? '',
    category: r.category ?? '',
    createdAt: r.createdAt ?? now,
    updatedAt: r.updatedAt ?? now,
    aspect: r.aspect && ['16:9', '16:10', '4:3', '21:9', '1:1'].includes(r.aspect) ? r.aspect : '16:9',
    theme,
    slides: slides.length ? slides : [newSlide('', theme)],
    isTemplate: !!r.isTemplate,
    deletedAt: r.deletedAt ?? null,
    lyrics: r.lyrics ?? '',
    splitMode: r.splitMode ?? 'stanza',
    ...(r.autoLayout === 'impact' ? { autoLayout: 'impact' as const } : {}),
  };
}

/** Fundo/animação efetivos de um slide (o override do slide vence o tema). */
export const resolveBackground = (slide: Slide | null | undefined, theme: Theme): Background => slide?.background ?? theme.background;
export const resolveAnimation = (slide: Slide | null | undefined, theme: Theme) => slide?.animation ?? theme.animation;

export function slideText(slide: Slide): string {
  return (slide.layers.find((l) => l.role === 'lyrics') ?? slide.layers[0])?.text ?? '';
}
