import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import { LuMaximize, LuPause, LuPlay, LuRotateCw, LuType } from 'react-icons/lu';
import { DesignPainter, isPlaced, layerBox } from '../../core/design/paint';
import type { BackgroundDesign, DesignLayer } from '../../core/types';
import { FitBox } from '../../render/FitBox';
import { DesignCanvas } from '../../render/DesignCanvas';
import { useSetting } from '../../core/settings';
import { rotatedHalf, SAFE_MARGIN, snapAxis, SNAP_PX, SNAP_SETTING, type SnapHit } from '../../core/snap';
import { SnapToggle } from '../../ui/SnapToggle';
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

interface Start {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
type Drag =
  | { mode: 'move'; px: number; py: number; starts: Record<string, Start>; ux: number; uy: number; uhw: number; uhh: number; edgesX: boolean; edgesY: boolean }
  | { mode: 'scale'; cx: number; cy: number; d0: number; starts: Record<string, Start> }
  | { mode: 'rotate'; cx: number; cy: number; a0: number; starts: Record<string, Start> };

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
          <SnapToggle className="st-chip" />
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
  const { design, selected, selectedIds } = api;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [busy, setBusy] = useState<Drag['mode'] | null>(null);
  const [hits, setHits] = useState<{ x: SnapHit; y: SnapHit }>({ x: null, y: null });
  const [snapOn] = useSetting<boolean>(SNAP_SETTING, true);
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

  const shown = (l: DesignLayer | null | undefined): l is DesignLayer => !!l && isPlaced(l) && l.visible;
  const sel = shown(selected) ? selected : null;
  const box = sel && W ? boxOf(sel, W, H) : null;
  const others = design.layers.filter((l) => l.id !== sel?.id && selectedIds.includes(l.id) && shown(l));
  /** camadas que se movem juntas: as selecionadas que dá para arrastar (as travadas ficam) */
  const movable = () => design.layers.filter((l) => selectedIds.includes(l.id) && shown(l) && !l.locked);
  const startsOf = (ls: DesignLayer[]) => Object.fromEntries(ls.map((l) => [l.id, { x: l.x, y: l.y, w: l.w, h: l.h, rotation: l.rotation }]));

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = local(e);
    const additive = e.ctrlKey || e.metaKey;
    // as selecionadas têm prioridade; depois, de cima para baixo
    let hit: DesignLayer | null = null;
    for (const l of [...design.layers].reverse()) {
      if (selectedIds.includes(l.id) && shown(l) && !l.locked && inside(p.x, p.y, boxOf(l, W, H))) {
        hit = l;
        break;
      }
    }
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
      if (!additive) api.select(null);
      return;
    }
    if (additive) {
      // Ctrl + clique: soma ou tira da seleção, sem arrastar
      api.select(hit.id, true);
      return;
    }
    const inGroup = selectedIds.includes(hit.id) && selectedIds.length > 1;
    const group = inGroup ? movable() : [hit];
    if (!inGroup) api.select(hit.id);
    // caixa que envolve o grupo, para o ímã alinhar a borda de fora
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let edgesX = false;
    let edgesY = false;
    for (const l of group) {
      const b = boxOf(l, W, H);
      const half = l.kind === 'gradient' ? { hw: 0, hh: 0 } : rotatedHalf(b.bw, b.bh, b.rot);
      // ondas atravessam a tela: só a altura conta para encostar
      const hw = l.kind === 'waves' ? 0 : half.hw;
      minX = Math.min(minX, b.cx - hw);
      maxX = Math.max(maxX, b.cx + hw);
      minY = Math.min(minY, b.cy - half.hh);
      maxY = Math.max(maxY, b.cy + half.hh);
      edgesX ||= l.kind === 'shape' || l.kind === 'glow';
      edgesY ||= l.kind !== 'gradient';
    }
    drag.current = {
      mode: 'move',
      px: p.x,
      py: p.y,
      starts: startsOf(group),
      ux: (((minX + maxX) / 2) / W) * 100,
      uy: (((minY + maxY) / 2) / H) * 100,
      uhw: (((maxX - minX) / 2) / W) * 100,
      uhh: (((maxY - minY) / 2) / H) * 100,
      edgesX,
      edgesY,
    };
    setBusy('move');
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGrip = (mode: 'scale' | 'rotate') => (e: RPointerEvent<HTMLElement>) => {
    if (!sel || !box || sel.locked) return;
    e.stopPropagation();
    const p = local(e);
    const group = selectedIds.length > 1 ? movable() : [sel];
    const starts = startsOf(group);
    if (mode === 'scale') drag.current = { mode, cx: box.cx, cy: box.cy, d0: Math.max(4, Math.hypot(p.x - box.cx, p.y - box.cy)), starts };
    else drag.current = { mode, cx: box.cx, cy: box.cy, a0: Math.atan2(p.y - box.cy, p.x - box.cx), starts };
    setBusy(mode);
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    const ids = Object.keys(d.starts);
    const key = `${d.mode}:${ids.join(',')}`;
    if (d.mode === 'move') {
      let ux = d.ux + ((p.x - d.px) / W) * 100;
      let uy = d.uy + ((p.y - d.py) / H) * 100;
      let hx: SnapHit = null;
      let hy: SnapHit = null;
      // ímã: encosta na borda, na margem segura ou no centro quando chega perto; continuar arrastando solta.
      // Desligado no botão "Ímã" (ou segurando Alt), o movimento é totalmente livre.
      if (snapOn && !e.altKey) {
        const sx = snapAxis(ux, d.uhw, (SNAP_PX / W) * 100, { edges: d.edgesX, safe: SAFE_MARGIN });
        const sy = snapAxis(uy, d.uhh, (SNAP_PX / H) * 100, { edges: d.edgesY, safe: SAFE_MARGIN });
        ux = sx.pos;
        uy = sy.pos;
        hx = sx.hit;
        hy = sy.hit;
      }
      if (hx !== hits.x || hy !== hits.y) setHits({ x: hx, y: hy });
      const mx = ux - d.ux;
      const my = uy - d.uy;
      api.patchMany(Object.fromEntries(ids.map((id) => [id, { x: +(d.starts[id].x + mx).toFixed(2), y: +(d.starts[id].y + my).toFixed(2) }])), key);
    } else if (d.mode === 'scale') {
      const k = Math.max(0.05, Math.hypot(p.x - d.cx, p.y - d.cy) / d.d0);
      const fit = (v: number) => +Math.min(400, Math.max(1, v * k)).toFixed(2);
      api.patchMany(Object.fromEntries(ids.map((id) => [id, { w: fit(d.starts[id].w), h: fit(d.starts[id].h) }])), key);
    } else {
      let delta = ((Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180) / Math.PI;
      const primary = sel ? d.starts[sel.id] : undefined;
      if (e.shiftKey && primary) {
        const r = Math.round((primary.rotation + delta) / 15) * 15; // a principal anda de 15 em 15°
        delta = r - primary.rotation;
      }
      const norm = (r: number) => Math.round(((((r + 180) % 360) + 360) % 360) - 180);
      api.patchMany(Object.fromEntries(ids.map((id) => [id, { rotation: norm(d.starts[id].rotation + delta) }])), key);
    }
  };

  const onUp = () => {
    drag.current = null;
    setBusy(null);
    setHits({ x: null, y: null });
  };

  const outline = (l: DesignLayer) => {
    const b = boxOf(l, W, H);
    return { left: b.cx - b.bw / 2, top: b.cy - b.bh / 2, width: b.bw, height: b.bh, transform: `rotate(${b.rot}deg)` };
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
      {busy === 'move' && (
        <div className="guides" aria-hidden>
          <i className="g-safe" data-hot={hits.x?.startsWith('safe') || hits.y?.startsWith('safe') ? '1' : '0'} />
          <i className="g-v" data-hot={hits.x === 'center' ? '1' : '0'} />
          <i className="g-h" data-hot={hits.y === 'center' ? '1' : '0'} />
          {hits.x === 'start' && <i className="g-edge g-edge-l" />}
          {hits.x === 'end' && <i className="g-edge g-edge-r" />}
          {hits.y === 'start' && <i className="g-edge g-edge-t" />}
          {hits.y === 'end' && <i className="g-edge g-edge-b" />}
        </div>
      )}
      {W > 0 && others.map((l) => <div key={l.id} className="sel st-sel sel-extra" style={outline(l)} aria-hidden />)}
      {selectedIds.length > 1 && <span className="sel-count">{selectedIds.length} camadas selecionadas · Ctrl + clique soma ou tira</span>}
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
