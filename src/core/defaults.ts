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
} from './types';
import { clone, deepMerge, fillDefaults } from './util';

export const SYSTEM_SANS = 'Inter, "Segoe UI", "Helvetica Neue", Roboto, system-ui, sans-serif';

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
export function normalizeProject(raw: unknown): Project {
  const r = (raw ?? {}) as Partial<Project>;
  const theme = fillDefaults(defaultTheme(), r.theme);
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
        };
      },
    );
    return {
      id: slide.id || uid('s'),
      label: slide.label ?? '',
      layers,
      background: slide.background ? fillDefaults(defaultBackground(), slide.background) : null,
      animation: slide.animation ? fillDefaults(baseAnimation(), slide.animation) : null,
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
  };
}

/** Fundo/animação efetivos de um slide (o override do slide vence o tema). */
export const resolveBackground = (slide: Slide | null | undefined, theme: Theme): Background => slide?.background ?? theme.background;
export const resolveAnimation = (slide: Slide | null | undefined, theme: Theme) => slide?.animation ?? theme.animation;

export function slideText(slide: Slide): string {
  return (slide.layers.find((l) => l.role === 'lyrics') ?? slide.layers[0])?.text ?? '';
}
