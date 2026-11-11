import type { BackgroundDesign, DesignLayer } from '../types';
import { fill, newDesign, newDesignLayer as L } from './model';

/**
 * Modelos de partida do Estúdio de Fundos. Ids fixos nas camadas: a posição das partículas
 * depende do id, e assim a miniatura do modelo é sempre igual à do fundo criado a partir dele.
 */
export interface Starter {
  id: string;
  name: string;
  hint: string;
  make: () => BackgroundDesign;
}

const fixed = (id: string, l: DesignLayer): DesignLayer => ({ ...l, id });

export const STARTERS: Starter[] = [
  {
    id: 'sunset',
    name: 'Sol poente',
    hint: 'Sol listrado sobre um brilho vermelho',
    make: () =>
      newDesign(
        'Sol poente',
        [
          fixed('sun-bg', L('gradient', { name: 'Fundo vermelho', fill: fill('radial', ['#7f1d1d', '#2a0606', '#0f0303']), w: 70 })),
          fixed('sun-glow', L('glow', { name: 'Brilho', w: 150, h: 120, opacity: 80, fill: fill('solid', ['#ef4444']), motions: [{ kind: 'breathe', amount: 45, cycles: 1 }] })),
          fixed('sun-disc', L('shape', { name: 'Sol', w: 54, h: 54, fill: fill('linear', ['#fb923c', '#f9a8d4', '#c4b5fd'], 200), motions: [{ kind: 'breathe', amount: 25, cycles: 1 }] })),
          fixed('sun-stripes', L('texture', { name: 'Listras do sol', clip: true, texture: 'stripes', scale: 2.4, thickness: 42, rotation: -38, opacity: 30, blend: 'normal', fill: fill('solid', ['#7c2d12']), motions: [{ kind: 'flow', amount: 50, cycles: 1 }] })),
          fixed('sun-grain', L('texture', { name: 'Grão', texture: 'grain', scale: 3, opacity: 22, blend: 'overlay', rotation: 0 })),
        ],
        '#0f0303',
      ),
  },
  {
    id: 'portals',
    name: 'Portais',
    hint: 'Dois arcos de luz com listras diagonais',
    make: () =>
      newDesign(
        'Portais',
        [
          fixed('pt-glow', L('glow', { name: 'Luz laranja', y: 62, w: 170, h: 95, opacity: 75, fill: fill('solid', ['#ea580c']), motions: [{ kind: 'breathe', amount: 40, cycles: 1 }] })),
          fixed('pt-a', L('shape', { name: 'Portal esquerdo', shape: 'arch', x: 39, y: 52, w: 25, h: 60, fill: fill('linear', ['#fed7aa', '#fb923c', '#9a3412'], 180) })),
          fixed('pt-a-s', L('texture', { name: 'Listras esquerdas', clip: true, scale: 2.2, thickness: 40, rotation: -40, opacity: 32, blend: 'normal', fill: fill('solid', ['#7c2d12']), motions: [{ kind: 'flow', amount: 50, cycles: 1 }] })),
          fixed('pt-b', L('shape', { name: 'Portal direito', shape: 'arch', x: 61, y: 52, w: 25, h: 60, fill: fill('linear', ['#fed7aa', '#fb923c', '#9a3412'], 180) })),
          fixed('pt-b-s', L('texture', { name: 'Listras direitas', clip: true, scale: 2.2, thickness: 40, rotation: -40, opacity: 32, blend: 'normal', fill: fill('solid', ['#7c2d12']), motions: [{ kind: 'flow', amount: 50, cycles: 1 }] })),
        ],
        '#0c0a09',
      ),
  },
  {
    id: 'mist',
    name: 'Neblina',
    hint: 'Roxo profundo, desfocado e calmo',
    make: () =>
      newDesign(
        'Neblina',
        [
          fixed('ms-a', L('glow', { name: 'Roxo', x: 30, y: 38, w: 130, h: 110, opacity: 90, blur: 20, blend: 'normal', fill: fill('solid', ['#7e22ce']), motions: [{ kind: 'drift', amount: 60, cycles: 1 }] })),
          fixed('ms-b', L('glow', { name: 'Violeta', x: 74, y: 66, w: 120, h: 100, opacity: 85, blur: 20, blend: 'screen', fill: fill('solid', ['#4338ca']), motions: [{ kind: 'drift', amount: 50, cycles: 1 }, { kind: 'breathe', amount: 30, cycles: 2 }] })),
          fixed('ms-c', L('glow', { name: 'Rosa', x: 56, y: 18, w: 80, h: 60, opacity: 45, blur: 25, blend: 'screen', fill: fill('solid', ['#c026d3']), motions: [{ kind: 'breathe', amount: 50, cycles: 1 }] })),
          fixed('ms-grain', L('texture', { name: 'Grão', texture: 'grain', scale: 3, opacity: 18, blend: 'overlay', rotation: 0 })),
        ],
        '#0b0616',
      ),
  },
  {
    id: 'aurora',
    name: 'Aurora',
    hint: 'Azul e roxo com fios de luz',
    make: () =>
      newDesign(
        'Aurora',
        [
          fixed('au-bg', L('gradient', { name: 'Céu', fill: fill('linear', ['#1e1b4b', '#05061a'], 180) })),
          fixed('au-blue', L('glow', { name: 'Azul', x: 28, y: 72, w: 140, h: 100, opacity: 85, fill: fill('solid', ['#2563eb']), motions: [{ kind: 'drift', amount: 55, cycles: 1 }] })),
          fixed('au-purple', L('glow', { name: 'Roxo', x: 72, y: 30, w: 120, h: 90, opacity: 80, fill: fill('solid', ['#9333ea']), motions: [{ kind: 'breathe', amount: 45, cycles: 1 }, { kind: 'colors', amount: 60, cycles: 1, colors: ['#9333ea', '#c026d3', '#4f46e5'] }] })),
          fixed('au-waves', L('waves', { name: 'Fios de luz', y: 55, h: 30, count: 5, amplitude: 9, thickness: 5, blur: 4, opacity: 85, fill: fill('linear', ['#818cf8', '#c084fc', '#38bdf8'], 90), motions: [{ kind: 'flow', amount: 50, cycles: 1 }] })),
        ],
        '#05061a',
      ),
  },
  {
    id: 'streaks',
    name: 'Raios de luz',
    hint: 'Feixes vermelhos e azuis em movimento',
    make: () =>
      newDesign(
        'Raios de luz',
        [
          fixed('rs-red', L('waves', { name: 'Feixes vermelhos', y: 42, h: 24, count: 3, amplitude: 13, thickness: 20, blur: 9, rotation: -18, opacity: 100, fill: fill('linear', ['#ef4444', '#f97316', '#be123c'], 90), motions: [{ kind: 'flow', amount: 50, cycles: 1 }] })),
          fixed('rs-blue', L('waves', { name: 'Feixes azuis', y: 62, h: 22, count: 3, amplitude: 11, thickness: 18, blur: 10, rotation: 14, opacity: 95, fill: fill('linear', ['#3b82f6', '#a855f7', '#1d4ed8'], 90), motions: [{ kind: 'flow', amount: 50, cycles: 2 }] })),
          fixed('rs-sparks', L('particles', { name: 'Faíscas', count: 22, scale: 1.6, opacity: 70, blur: 2, fill: fill('linear', ['#fecaca', '#bfdbfe'], 90) })),
          fixed('rs-grain', L('texture', { name: 'Grão', texture: 'grain', scale: 3, opacity: 16, blend: 'overlay', rotation: 0 })),
        ],
        '#050510',
      ),
  },
  {
    id: 'blank',
    name: 'Em branco',
    hint: 'Só um degradê escuro para começar do zero',
    make: () => newDesign('Novo fundo', [fixed('bl-bg', L('gradient', { name: 'Degradê', fill: fill('linear', ['#1f2937', '#030712'], 180) }))], '#030712'),
  },
];
