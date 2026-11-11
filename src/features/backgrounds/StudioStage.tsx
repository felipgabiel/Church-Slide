import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import { LuMaximize, LuPause, LuPlay, LuRotateCw, LuType } from 'react-icons/lu';
import { DesignPainter, isPlaced, layerBox } from '../../core/design/paint';
import type { BackgroundDesign, DesignLayer } from '../../core/types';
import { FitBox } from '../../render/FitBox';
import { DesignCanvas } from '../../render/DesignCanvas';
import { useSetting } from '../../core/settings';
import type { StudioApi } from './Studio';

export interface StudioClock {
  toggle: () => void;
  fullscreen: () => void;
}

/** Relógio do loop: tocar, pausar e arrastar o cursor. */
function useLoopClock(loopSec: number) {
  const st = useRef({ playing: true, offset: 0, since: performance.now() });
  const [playing, setPlaying] = useState(true);
  const now = useCallback(() => {
    const s = st.current;
    const t = s.playing ? s.offset + (performance.now() - s.since) / 1000 : s.offset;
    return ((t % loopSec) + loopSec) % loopSec;
  }, [loopSec]);
  const pause = useCallback(() => {
    st.current = { playing: false, offset: now(), since: performance.now() };
    setPlaying(false);
  }, [now]);
  const play = useCallback(() => {
    st.current = { playing: true, offset: st.current.offset, since: performance.now() };
    setPlaying(true);
  }, []);
  const seek = useCallback((t: number) => {
    st.current = { playing: false, offset: t, since: performance.now() };
    setPlaying(false);
  }, []);
  return { now, playing, play, pause, seek, toggle: () => (st.current.playing ? pause() : play()) };
}

type Drag =
  | { mode: 'move'; id: string; px: number; py: number; x0: number; y0: number }
  | { mode: 'scale'; id: string; cx: number; cy: number; d0: number; w0: number; h0: number }
  | { mode: 'rotate'; id: string; cx: number; cy: number; a0: number; r0: number };

export function StudioStage({ api, clockRef }: { api: StudioApi; clockRef: MutableRefObject<StudioClock | null> }) {
  const { design, selected } = api;
  const clock = useLoopClock(design.loopSec);
  const viewRef = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useSetting('studio-sample', true);
  clockRef.current = {
    toggle: clock.toggle,
    fullscreen: () => void viewRef.current?.requestFullscreen?.().catch(() => undefined),
  };

  return (
    <div className="st">
      <div className="st-view" ref={viewRef}>
        <FitBox ratio={16 / 9} padding={24}>
          <Surface api={api} getTime={clock.now} sample={sample} />
        </FitBox>
      </div>
      <div className="st-bar">
        <LoopBar loopSec={design.loopSec} clock={clock} />
        <div className="st-chips">
          <button type="button" className="st-chip" aria-pressed={sample} data-on={sample ? '1' : undefined} onClick={() => setSample(!sample)} title="Mostra uma letra por cima para conferir a leitura">
            <LuType aria-hidden /> Letra de exemplo
          </button>
          <button type="button" className="st-chip" onClick={() => clockRef.current?.fullscreen()} title="Tela cheia (F)">
            <LuMaximize aria-hidden /> Tela cheia
          </button>
          <ContrastMeter design={design} getTime={clock.now} onFix={() => api.addLayer('glow', { name: 'Sombra central', w: 160, h: 70, opacity: 55, blend: 'normal', fill: { type: 'solid', angle: 0, stops: [{ color: '#000000', at: 0 }] } })} />
        </div>
      </div>
      {selected && !selected.visible && <p className="st-note">A camada selecionada está oculta.</p>}
    </div>
  );
}

function LoopBar({ loopSec, clock }: { loopSec: number; clock: ReturnType<typeof useLoopClock> }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let lastShown = -1;
    const tick = () => {
      const v = Math.round(clock.now() * 10) / 10;
      if (v !== lastShown) {
        lastShown = v;
        setT(clock.now());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock.now]);
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  return (
    <div className="st-loop">
      <button type="button" className="ibtn ibtn-sm" aria-label={clock.playing ? 'Pausar (Espaço)' : 'Tocar (Espaço)'} title={clock.playing ? 'Pausar (Espaço)' : 'Tocar (Espaço)'} onClick={clock.toggle}>
        {clock.playing ? <LuPause /> : <LuPlay />}
      </button>
      <input
        className="range st-scrub"
        type="range"
        min={0}
        max={loopSec}
        step={0.01}
        value={t}
        aria-label="Posição no loop"
        style={{ '--p': `${(t / loopSec) * 100}%` } as Record<string, string>}
        onChange={(e) => clock.seek(Number(e.currentTarget.value))}
      />
      <span className="st-time">
        {fmt(t)} s de {loopSec} s
      </span>
    </div>
  );
}

/** Contraste da letra branca no centro do slide: dá um aviso antes de ir para o telão. */
function ContrastMeter({ design, getTime, onFix }: { design: BackgroundDesign; getTime: () => number; onFix: () => void }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const dRef = useRef(design);
  dRef.current = design;
  useEffect(() => {
    const W = 96;
    const H = 54;
    const painter = new DesignPainter(W, H);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const measure = () => {
      try {
        painter.draw(ctx, dRef.current, getTime());
        const x0 = Math.round(W * 0.2);
        const y0 = Math.round(H * 0.3);
        const img = ctx.getImageData(x0, y0, W - 2 * x0, H - 2 * y0).data;
        let worst = 0;
        let sum = 0;
        let n = 0;
        const lin = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        for (let i = 0; i < img.length; i += 4) {
          const L = 0.2126 * lin(img[i]) + 0.7152 * lin(img[i + 1]) + 0.0722 * lin(img[i + 2]);
          sum += L;
          n++;
          worst = Math.max(worst, L);
        }
        // média puxada para o ponto mais claro: uma mancha clara atrás da letra já atrapalha
        const L = (sum / Math.max(1, n)) * 0.6 + worst * 0.4;
        setRatio(1.05 / (L + 0.05));
      } catch {
        setRatio(null);
      }
    };
    measure();
    const id = window.setInterval(measure, 1200);
    return () => window.clearInterval(id);
  }, [getTime]);
  if (ratio === null) return null;
  const level = ratio >= 4.5 ? 'good' : ratio >= 3 ? 'ok' : 'low';
  return (
    <span className="st-contrast" data-level={level} title={`Contraste estimado da letra branca no centro: ${ratio.toFixed(1)}:1`}>
      <i aria-hidden />
      {level === 'good' ? 'Contraste: bom' : level === 'ok' ? 'Contraste: razoável' : 'Contraste: baixo'}
      {level !== 'good' && (
        <button type="button" className="st-fix" onClick={onFix}>
          Escurecer o centro
        </button>
      )}
    </span>
  );
}

/* --------------------------- palco com alças --------------------------- */

function boxOf(l: DesignLayer, W: number, H: number) {
  const b = layerBox(l, W, H);
  if (l.kind === 'waves') return { ...b, bw: W * 1.02, bh: Math.max(b.bh, 12) };
  if (l.kind === 'gradient') return { ...b, bw: 28, bh: 28 };
  return b;
}

function inside(px: number, py: number, b: ReturnType<typeof boxOf>) {
  const a = (-b.rot * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(x) <= Math.max(10, b.bw / 2) && Math.abs(y) <= Math.max(10, b.bh / 2);
}

function Surface({ api, getTime, sample }: { api: StudioApi; getTime: () => number; sample: boolean }) {
  const { design, selected } = api;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [busy, setBusy] = useState<Drag['mode'] | null>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    setSize({ W: el.clientWidth, H: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const { W, H } = size;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const sel = selected && isPlaced(selected) && selected.visible ? selected : null;
  const box = sel && W ? boxOf(sel, W, H) : null;

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    // a selecionada tem prioridade; depois, de cima para baixo
    let hit: DesignLayer | null = sel && !sel.locked && box && inside(p.x, p.y, box) ? sel : null;
    if (!hit) {
      for (const l of [...design.layers].reverse()) {
        if (!l.visible || l.locked || !isPlaced(l)) continue;
        if (inside(p.x, p.y, boxOf(l, W, H))) {
          hit = l;
          break;
        }
      }
    }
    if (!hit) {
      api.select(null);
      return;
    }
    api.select(hit.id);
    drag.current = { mode: 'move', id: hit.id, px: p.x, py: p.y, x0: hit.x, y0: hit.y };
    setBusy('move');
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGrip = (mode: 'scale' | 'rotate') => (e: RPointerEvent<HTMLElement>) => {
    if (!sel || !box || sel.locked) return;
    e.stopPropagation();
    const p = local(e);
    if (mode === 'scale') drag.current = { mode, id: sel.id, cx: box.cx, cy: box.cy, d0: Math.max(4, Math.hypot(p.x - box.cx, p.y - box.cy)), w0: sel.w, h0: sel.h };
    else drag.current = { mode, id: sel.id, cx: box.cx, cy: box.cy, a0: Math.atan2(p.y - box.cy, p.x - box.cx), r0: sel.rotation };
    setBusy(mode);
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (d.mode === 'move') {
      const x = d.x0 + ((p.x - d.px) / W) * 100;
      const y = d.y0 + ((p.y - d.py) / H) * 100;
      api.patchLayer(d.id, { x: +x.toFixed(2), y: +y.toFixed(2) }, `move:${d.id}`);
    } else if (d.mode === 'scale') {
      const k = Math.max(0.05, Math.hypot(p.x - d.cx, p.y - d.cy) / d.d0);
      api.patchLayer(d.id, { w: +Math.min(400, Math.max(1, d.w0 * k)).toFixed(2), h: +Math.min(400, Math.max(1, d.h0 * k)).toFixed(2) }, `scale:${d.id}`);
    } else {
      let r = d.r0 + ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      api.patchLayer(d.id, { rotation: Math.round(r) }, `rot:${d.id}`);
    }
  };

  const onUp = () => {
    drag.current = null;
    setBusy(null);
  };

  return (
    <div ref={ref} className="st-surface" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <DesignCanvas design={design} mode="live" getTime={getTime} maxWidth={1600} />
      {sample && (
        <div className="st-sample" aria-hidden>
          <span className="st-sample-small">vem sobre mim</span>
          <span className="st-sample-big">SENHOR</span>
        </div>
      )}
      {box && sel && (
        <div className="sel-wrap" data-drag={busy === 'move' ? '1' : undefined} data-busy={busy === 'rotate' ? '1' : undefined}>
          <div
            className="sel st-sel"
            data-locked={sel.locked ? '1' : undefined}
            style={{ left: box.cx - box.bw / 2, top: box.cy - box.bh / 2, width: box.bw, height: box.bh, transform: `rotate(${box.rot}deg)` }}
          >
            {!sel.locked && sel.kind !== 'gradient' && (
              <>
                {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
                  <span key={c} className={`grip grip-${c}`} onPointerDown={onGrip('scale')} aria-hidden />
                ))}
                {sel.kind !== 'waves' && (
                  <span className="grip-rot" onPointerDown={onGrip('rotate')} title="Girar (Shift: de 15 em 15°)" aria-hidden>
                    <LuRotateCw />
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
