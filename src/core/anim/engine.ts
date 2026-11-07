import type { AnimationConfig, AnimPhase, Direction } from '../types';
import { easePeakSpeed, easeSpeed, getEase, type EaseFn } from './easing';

/**
 * Motor de animação do telão.
 *
 * Cada "unidade" de texto (bloco, linha ou palavra) é animada com
 * requestAnimationFrame usando apenas `transform` e `opacity` (compositor/GPU).
 * O Motion Blur é REAL: a cada quadro calculamos a velocidade instantânea da
 * curva de movimento e aplicamos um desfoque gaussiano direcional (SVG
 * feGaussianBlur com desvios diferentes em X e Y) proporcional a essa velocidade.
 * Quando o texto para, o desfoque some e o filtro é removido do elemento.
 */

export interface Geometry {
  w: number;
  h: number;
}

export interface UnitState {
  opacity: number;
  tx: number;
  ty: number;
  scale: number;
  blurX: number;
  blurY: number;
}

const MOVE: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hasEffect(p: AnimPhase): boolean {
  return p.fade || p.slide || p.blur || p.zoom !== 'none';
}

/**
 * Estado visual de uma unidade no progresso local `p` (0–1).
 * Função pura — coberta por testes.
 */
export function unitState(
  cfg: AnimationConfig,
  phase: 'enter' | 'exit',
  p: number,
  geo: Geometry,
  ease: EaseFn,
  peakSpeed: number,
): UnitState {
  const fx = phase === 'enter' ? cfg.enter : cfg.exit;
  const pp = clamp01(p);
  const e = ease(pp);
  // k: quanto ainda "falta" (entrada) ou quanto já "foi" (saída) do deslocamento
  const k = phase === 'enter' ? 1 - e : e;
  const sign = phase === 'enter' ? -1 : 1;
  const i = clamp01(cfg.intensity / 100);
  const move = MOVE[cfg.direction];

  let opacity = 1;
  if (fx.fade) opacity = phase === 'enter' ? clamp01(e) : 1 - clamp01(e);
  else opacity = phase === 'enter' ? (pp > 0 ? 1 : 0) : pp < 1 ? 1 : 0;

  let tx = 0;
  let ty = 0;
  if (fx.slide) {
    const horizontal = move.x !== 0;
    const dist = (horizontal ? geo.w * 0.5 : geo.h) * (0.03 + 0.12 * i);
    tx = sign * move.x * dist * k;
    ty = sign * move.y * dist * k;
  }

  let scale = 1;
  if (fx.zoom !== 'none') {
    const amt = 0.04 + 0.3 * i;
    const grows = phase === 'enter' ? fx.zoom === 'out' : fx.zoom === 'in';
    scale = 1 + (grows ? 1 : -1) * amt * k;
  }

  let iso = 0;
  if (fx.blur) iso = geo.h * 0.03 * i * k;

  // Motion blur: proporcional à velocidade instantânea normalizada (0–1).
  let mbx = 0;
  let mby = 0;
  const mb = clamp01(cfg.motionBlur / 100);
  if (mb > 0 && pp > 0 && pp < 1) {
    const speed = clamp01(easeSpeed(ease, pp) / peakSpeed);
    const px = mb * speed * geo.h * 0.03 * (0.5 + i);
    if (fx.slide) {
      mbx = px * Math.abs(move.x);
      mby = px * Math.abs(move.y);
    } else if (fx.zoom !== 'none') {
      iso += px * 0.35;
    }
  }

  return { opacity, tx, ty, scale, blurX: iso + mbx, blurY: iso + mby };
}

/** Duração efetiva de cada fase, considerando velocidade. */
export function phaseTiming(cfg: AnimationConfig, phase: 'enter' | 'exit') {
  const speed = Math.max(0.1, cfg.speed || 1);
  const base = Math.max(1, cfg.duration / speed);
  if (phase === 'enter') {
    return { duration: base, stagger: cfg.stagger / speed, delay: cfg.delay / speed };
  }
  // Saída mais curta e sem atraso para não segurar a troca de trecho.
  return { duration: Math.max(120, Math.min(base * 0.7, 650)), stagger: (cfg.stagger / speed) * 0.35, delay: 0 };
}

export function totalDuration(cfg: AnimationConfig, phase: 'enter' | 'exit', units: number): number {
  const t = phaseTiming(cfg, phase);
  return t.delay + Math.max(0, units - 1) * t.stagger + t.duration;
}

/* ------------------------------------------------------------------ */
/* Filtros SVG para o Motion Blur                                       */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface PooledFilter {
  id: string;
  node: SVGFEGaussianBlurElement;
  el: SVGFilterElement;
}

/** Conjunto de filtros SVG reutilizáveis, dentro do <svg> oculto do palco. */
export class FilterPool {
  private free: PooledFilter[] = [];
  private seq = 0;
  private prefix: string;
  constructor(private defs: SVGDefsElement) {
    this.prefix = `mb${Math.random().toString(36).slice(2, 7)}`;
  }

  acquire(): PooledFilter {
    const hit = this.free.pop();
    if (hit) return hit;
    const id = `${this.prefix}-${this.seq++}`;
    const el = document.createElementNS(SVG_NS, 'filter');
    el.setAttribute('id', id);
    el.setAttribute('x', '-60%');
    el.setAttribute('y', '-120%');
    el.setAttribute('width', '220%');
    el.setAttribute('height', '340%');
    el.setAttribute('color-interpolation-filters', 'sRGB');
    const node = document.createElementNS(SVG_NS, 'feGaussianBlur');
    node.setAttribute('stdDeviation', '0 0');
    el.appendChild(node);
    this.defs.appendChild(el);
    return { id, node, el };
  }

  release(f: PooledFilter) {
    f.node.setAttribute('stdDeviation', '0 0');
    this.free.push(f);
  }
}

/* ------------------------------------------------------------------ */
/* Execução                                                             */
/* ------------------------------------------------------------------ */

export interface PlayHandle {
  finished: Promise<void>;
  /** Interrompe e deixa os elementos como estão. */
  cancel(): void;
  /** Interrompe e limpa estilos (estado final visível). */
  settle(): void;
  readonly running: boolean;
}

export interface PlayOptions {
  /** Opacidade inicial por unidade (entrada interrompida por uma saída). */
  startOpacity?: number[];
}

function clearStyles(el: HTMLElement) {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.filter = '';
  el.style.willChange = '';
}

export function captureOpacity(units: HTMLElement[]): number[] {
  return units.map((u) => {
    const v = parseFloat(getComputedStyle(u).opacity);
    return Number.isFinite(v) ? v : 1;
  });
}

export function play(
  units: HTMLElement[],
  cfg: AnimationConfig,
  phase: 'enter' | 'exit',
  geo: Geometry,
  pool: FilterPool | null,
  opts: PlayOptions = {},
): PlayHandle {
  const fx = phase === 'enter' ? cfg.enter : cfg.exit;
  const ease = getEase(cfg.easing);
  const peak = easePeakSpeed(cfg.easing);
  const timing = phaseTiming(cfg, phase);
  const n = units.length;
  const total = totalDuration(cfg, phase, n);
  const instant = !hasEffect(fx);
  const wantsBlur = pool !== null && (fx.blur || (cfg.motionBlur > 0 && (fx.slide || fx.zoom !== 'none')));
  const filters: (PooledFilter | null)[] = units.map(() => null);

  let raf = 0;
  let done = false;
  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));

  const releaseFilter = (i: number) => {
    const f = filters[i];
    if (f && pool) {
      pool.release(f);
      filters[i] = null;
    }
  };

  const finish = (mode: 'natural' | 'cancel' | 'settle') => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    units.forEach((el, i) => {
      releaseFilter(i);
      if (mode === 'cancel') return;
      if (mode === 'settle' || phase === 'enter') {
        clearStyles(el);
      } else {
        el.style.opacity = '0';
        el.style.transform = '';
        el.style.filter = '';
        el.style.willChange = '';
      }
    });
    resolve();
  };

  const apply = (t: number) => {
    for (let i = 0; i < n; i++) {
      const el = units[i];
      const local = (t - timing.delay - i * timing.stagger) / timing.duration;
      const s = unitState(cfg, phase, local, geo, ease, peak);
      const startOp = opts.startOpacity?.[i] ?? 1;
      el.style.opacity = String(s.opacity * (phase === 'exit' ? startOp : 1));
      el.style.transform =
        s.tx || s.ty || s.scale !== 1 ? `translate3d(${s.tx.toFixed(2)}px,${s.ty.toFixed(2)}px,0) scale(${s.scale.toFixed(4)})` : '';
      if (wantsBlur && pool) {
        const bx = s.blurX;
        const by = s.blurY;
        if (bx > 0.1 || by > 0.1) {
          let f = filters[i];
          if (!f) {
            f = filters[i] = pool.acquire();
            el.style.filter = `url(#${f.id})`;
          }
          f.node.setAttribute('stdDeviation', `${bx.toFixed(2)} ${by.toFixed(2)}`);
        } else if (filters[i]) {
          el.style.filter = '';
          releaseFilter(i);
        }
      }
    }
  };

  if (instant || n === 0) {
    // Sem efeito: estado final imediato.
    if (phase === 'exit') units.forEach((el) => (el.style.opacity = '0'));
    else units.forEach(clearStyles);
    done = true;
    resolve();
    return { finished, cancel() {}, settle() {}, running: false };
  }

  units.forEach((el) => (el.style.willChange = 'transform, opacity, filter'));
  // Primeiro quadro síncrono: evita um "flash" do texto no estado final.
  apply(0);
  const t0 = performance.now();
  const tick = (now: number) => {
    if (done) return;
    const t = now - t0;
    if (t >= total) {
      finish('natural');
      return;
    }
    apply(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    finished,
    cancel: () => finish('cancel'),
    settle: () => finish('settle'),
    get running() {
      return !done;
    },
  };
}
