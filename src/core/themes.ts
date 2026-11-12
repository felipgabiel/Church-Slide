import { applyPreset } from './anim/presets';
import { defaultTheme } from './defaults';
import { POPPINS_STACK } from './fonts';
import type { DeepPartial, Theme } from './types';
import { deepMerge } from './util';
import { tr } from './i18n';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: Theme;
  /** Se definido, o layout tipográfico é aplicado automaticamente aos trechos. */
  autoLayout?: 'impact';
}

const GEORGIA = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';
const HELVETICA = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function make(patch: DeepPartial<Theme>, preset: string, animPatch: Partial<Theme['animation']> = {}): Theme {
  const theme = deepMerge(defaultTheme(), patch);
  theme.animation = { ...applyPreset(preset), ...animPatch };
  return theme;
}

/** Modelos visuais prontos. Cada um é um tema completo (texto + fundo + animação). */
const IMPACT_FONT = POPPINS_STACK;

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'impacto',
    name: tr('Impacto'),
    description: tr('Palavra-chave gigante, resto pequeno, fundo em brasa — automático'),
    autoLayout: 'impact',
    theme: make(
      {
        text: {
          fontFamily: IMPACT_FONT,
          fontSize: 21,
          bold: true,
          color: '#ffffff',
          letterSpacing: -2,
          lineHeight: 0.98,
          width: 90,
          autoFit: true,
          equalize: true,
          shadow: { enabled: false, color: '#000000', x: 0, y: 0, blur: 0 },
          glow: { enabled: false, color: '#ffffff', blur: 0 },
        },
        background: {
          kind: 'animated',
          animated: 'aurora',
          color: '#0a0204',
          gradient: {
            angle: 160,
            stops: [
              { color: '#ff5a1f', at: 0 },
              { color: '#d4152b', at: 50 },
              { color: '#5c0b1c', at: 100 },
            ],
          },
          adjust: { brightness: 100, contrast: 110, saturate: 115, blur: 0, dim: 18 },
        },
      },
      'by-word',
      { stagger: 80, duration: 700, motionBlur: 50, intensity: 40 },
    ),
  },
  {
    id: 'aurora',
    name: tr('Aurora'),
    description: tr('Fundo animado em cores vivas, texto com brilho'),
    theme: make(
      {
        text: { glow: { enabled: true, color: '#a9b8ff', blur: 26 }, letterSpacing: 2 },
        background: {
          kind: 'animated',
          animated: 'aurora',
          color: '#070914',
          gradient: {
            angle: 160,
            stops: [
              { color: '#6d5cff', at: 0 },
              { color: '#00c2a8', at: 50 },
              { color: '#ff5ea8', at: 100 },
            ],
          },
          adjust: { brightness: 100, contrast: 105, saturate: 110, blur: 0, dim: 10 },
        },
      },
      'by-line',
    ),
  },
  {
    id: 'dourado',
    name: tr('Dourado clássico'),
    description: tr('Serifa elegante sobre fundo escuro quente'),
    theme: make(
      {
        text: {
          fontFamily: GEORGIA,
          bold: false,
          color: '#f6e4b5',
          letterSpacing: 3,
          fontSize: 7.6,
          glow: { enabled: true, color: '#c9972b', blur: 20 },
        },
        background: {
          kind: 'gradient',
          gradient: {
            angle: 180,
            stops: [
              { color: '#34250f', at: 0 },
              { color: '#0b0805', at: 100 },
            ],
          },
        },
      },
      'fade',
      { duration: 1200, easing: 'smooth' },
    ),
  },
  {
    id: 'minimal',
    name: tr('Minimal'),
    description: tr('Preto absoluto, tipografia limpa, palavra por palavra'),
    theme: make(
      {
        text: { fontFamily: HELVETICA, bold: true, letterSpacing: -1, fontSize: 8.6, shadow: { enabled: false, color: '#000000', x: 0, y: 0, blur: 0 } },
        background: { kind: 'solid', color: '#000000' },
      },
      'by-word',
    ),
  },
  {
    id: 'noite',
    name: tr('Noite azul'),
    description: tr('Gradiente azul profundo com entrada em foco'),
    theme: make(
      {
        text: { color: '#e8f0ff', glow: { enabled: true, color: '#5b8cff', blur: 22 } },
        background: {
          kind: 'gradient',
          gradient: {
            angle: 180,
            stops: [
              { color: '#123677', at: 0 },
              { color: '#050a1c', at: 100 },
            ],
          },
        },
      },
      'focus',
    ),
  },
  {
    id: 'luz',
    name: tr('Luz suave'),
    description: tr('Fundo claro e quente, texto escuro, flutuação leve'),
    theme: make(
      {
        text: {
          color: '#2a1f14',
          bold: true,
          shadow: { enabled: true, color: '#ffffff', x: 0, y: 2, blur: 8 },
        },
        background: {
          kind: 'gradient',
          gradient: {
            angle: 170,
            stops: [
              { color: '#fff5e1', at: 0 },
              { color: '#efd2a2', at: 100 },
            ],
          },
        },
      },
      'float',
    ),
  },
];

export function getThemePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}
