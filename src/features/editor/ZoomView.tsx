import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { clamp } from '../../core/util';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 4];

/** Próximo degrau dos botões de lupa (a partir de qualquer zoom, mesmo um que veio da roda do mouse). */
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return STEPS.find((s) => s > z + 0.001) ?? ZOOM_MAX;
  return [...STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_MIN;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

type Anchor = { fx: number; fy: number; px: number; py: number };

/**
 * Palco com zoom. O palco fica de fato maior (não é um `transform`), dentro de uma área que rola: assim os
 * cliques, as alças e as medidas continuam batendo com o que se vê, em qualquer zoom.
 * - Ctrl + roda (ou pinça no touchpad): zoom no ponto do mouse;
 * - Espaço + arrastar: move a vista (a mãozinha), sem mexer em nada do slide.
 * `zoom` = 1 é "caber na tela".
 */
export function ZoomView({ ratio, padding, zoom, onZoom, children }: { ratio: number; padding: number; zoom: number; onZoom: (z: number) => void; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const anchor = useRef<Anchor | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const hover = useRef(false);

  // tamanho "caber na tela": usa a caixa inteira (com barras de rolagem) para não tremer quando elas aparecem
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const calc = () => {
      const cw = Math.max(0, el.offsetWidth - padding * 2);
      const ch = Math.max(0, el.offsetHeight - padding * 2);
      let w = cw;
      let h = cw / ratio;
      if (h > ch) {
        h = ch;
        w = ch * ratio;
      }
      setFit((s) => (s.w === Math.floor(w) && s.h === Math.floor(h) ? s : { w: Math.floor(w), h: Math.floor(h) }));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, padding]);

  /** Guarda qual ponto do slide está sob (px, py) para mantê-lo ali depois do zoom. */
  const remember = useCallback((clientX?: number, clientY?: number) => {
    const o = outer.current?.getBoundingClientRect();
    const i = inner.current?.getBoundingClientRect();
    if (!o || !i || !i.width || !i.height) return;
    const cx = clientX ?? o.left + o.width / 2;
    const cy = clientY ?? o.top + o.height / 2;
    anchor.current = { fx: (cx - i.left) / i.width, fy: (cy - i.top) / i.height, px: cx - o.left, py: cy - o.top };
  }, []);

  // depois que o palco mudou de tamanho, rola para que o ponto lembrado continue sob o mouse
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = outer.current;
    const i = inner.current?.getBoundingClientRect();
    if (!a || !el || !i) return;
    anchor.current = null;
    const o = el.getBoundingClientRect();
    el.scrollLeft += i.left + a.fx * i.width - (o.left + a.px);
    el.scrollTop += i.top + a.fy * i.height - (o.top + a.py);
  }, [zoom, fit.w, fit.h]);

  // botões de lupa / atalhos: zoom pelo centro da vista
  useEffect(() => {
    const on = (e: Event) => {
      const z = (e as CustomEvent<number>).detail;
      remember();
      onZoom(clamp(z, ZOOM_MIN, ZOOM_MAX));
    };
    window.addEventListener('cs:stage-zoom', on);
    return () => window.removeEventListener('cs:stage-zoom', on);
  }, [onZoom, remember]);

  // Ctrl + roda: o navegador daria zoom na página inteira — aqui vira zoom do palco (precisa de passive: false)
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      let z = clamp(zoomRef.current * Math.exp(-dy * 0.0016), ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(z - 1) < 0.04) z = 1; // gruda no "caber na tela"
      if (z === zoomRef.current) return;
      remember(e.clientX, e.clientY);
      zoomRef.current = z;
      onZoom(z);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [onZoom, remember]);

  // Espaço segurado com o mouse sobre o palco: modo mãozinha
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isTyping(e.target) || !hover.current) return;
      e.preventDefault();
      if (!e.repeat) setSpace(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const startPan = (e: RPointerEvent<HTMLDivElement>) => {
    if (!space || e.button !== 0) return;
    // nada do palco recebe este clique: só a vista se move
    e.preventDefault();
    e.stopPropagation();
    const el = outer.current!;
    const sx = e.clientX;
    const sy = e.clientY;
    const sl = el.scrollLeft;
    const st = el.scrollTop;
    setPanning(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = sl - (ev.clientX - sx);
      el.scrollTop = st - (ev.clientY - sy);
    };
    const end = () => {
      setPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      // o "click" que vem depois do soltar também não pode selecionar nada
      const eat = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const w = Math.floor(fit.w * zoom);
  const h = Math.floor(fit.h * zoom);
  return (
    <div
      ref={outer}
      className="zv"
      data-pan={panning ? 'move' : space ? 'ready' : undefined}
      data-zoomed={zoom > 1 ? '1' : undefined}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
      onPointerDownCapture={startPan}
    >
      <div className="zv-track" style={{ padding }}>
        <div ref={inner} className="fitbox-inner" style={{ width: w, height: h }}>
          {w > 0 && children}
        </div>
      </div>
    </div>
  );
}
