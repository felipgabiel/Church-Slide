import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { LuChevronLeft, LuChevronRight, LuClipboardPaste, LuGrid3X3, LuRotateCcw, LuRotateCw } from 'react-icons/lu';
import { slideText } from '../../core/defaults';
import { ASPECT_RATIOS } from '../../core/types';
import { clamp } from '../../core/util';
import { useSetting, writeSetting } from '../../core/settings';
import { useWordSelection, wordKey, wordSelection } from '../../store/wordSelection';
import { FitBox } from '../../render/FitBox';
import { Stage } from '../../render/Stage';
import { editor, editorStore, useActiveSlide, useEditor } from '../../store/editor';
import { Button, IconButton } from '../../ui/Button';
import { ContextMenu, type ContextItem } from '../../ui/ContextMenu';
import { toast } from '../../ui/toast';
import { buildStageMenu } from './stageMenu';

/** Caixa da camada selecionada, SEM giro: centro + tamanho (px da superfície) + ângulo. */
interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

type Grip = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e' | 'rotate';

/** Tamanho de fonte que as alças podem dar (% da altura do slide). */
const FONT_MIN = 1;
const FONT_MAX = 60;
/** Ímã do giro: 0°, 45°, 90°… grudam quando chega perto (Alt desliga; Shift anda de 15 em 15). */
const ROT_SNAP = 4;

const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Alças estilo Canva em volta da caixa: cantos aumentam/diminuem tudo na mesma proporção (letra e largura),
 * laterais mudam só a largura (o texto quebra de outro jeito) e o botão de baixo gira em torno do centro.
 */
function Handles({ box, layerName, onBusy }: { box: Box; layerName: string; onBusy: (v: boolean) => void }) {
  const [label, setLabel] = useState<string | null>(null);
  const start = (grip: Grip) => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = editorStore.get().project?.slides.find((x) => x.id === editorStore.get().slideId)?.layers.find((l) => l.id === editorStore.get().layerId);
    const surface = (e.currentTarget.closest('.surface') as HTMLElement | null)?.getBoundingClientRect();
    if (!layer || !surface) return;
    const st = layer.style;
    const C = { x: surface.left + box.cx, y: surface.top + box.cy };
    const d0 = Math.max(4, Math.hypot(e.clientX - C.x, e.clientY - C.y));
    const a0 = Math.atan2(e.clientY - C.y, e.clientX - C.x);
    const rad = (st.rotation * Math.PI) / 180;
    onBusy(true);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - C.x;
      const dy = ev.clientY - C.y;
      if (grip === 'rotate') {
        let a = st.rotation + ((Math.atan2(dy, dx) - a0) * 180) / Math.PI;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        else if (!ev.altKey) {
          const near = Math.round(a / 45) * 45;
          if (Math.abs(a - near) < ROT_SNAP) a = near;
        }
        a = Math.round(norm180(a) * 10) / 10;
        editor.patchStyle({ rotation: a === -180 ? 180 : a });
        setLabel(`${Math.round(a)}°`);
      } else if (grip === 'w' || grip === 'e') {
        // distância até o centro medida no eixo da própria caixa (vale com ela girada)
        const u = Math.abs(dx * Math.cos(rad) + dy * Math.sin(rad));
        const w = clamp(Math.round(((2 * u) / surface.width) * 1000) / 10, 8, 100);
        editor.patchStyle({ width: w, autoWidth: false });
        setLabel(`${String(w).replace('.', ',')}%`);
      } else {
        const k = Math.hypot(dx, dy) / d0;
        const fs = clamp(Math.round(st.fontSize * k * 10) / 10, FONT_MIN, FONT_MAX);
        const patch: Partial<typeof st> = { fontSize: fs };
        if (!st.autoWidth) patch.width = clamp(Math.round(st.width * (fs / st.fontSize) * 10) / 10, 8, 100);
        editor.patchStyle(patch);
        setLabel(`${String(fs).replace('.', ',')}%`);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setLabel(null);
      onBusy(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const corners: Grip[] = ['nw', 'ne', 'sw', 'se'];
  return (
    <div className="sel" style={{ left: box.cx, top: box.cy, width: box.w, height: box.h, transform: `translate(-50%, -50%) rotate(${box.rot}deg)` }}>
      <span className="sel-tag">{layerName}</span>
      {corners.map((g) => (
        <i key={g} className={`grip grip-${g}`} data-grip={g} role="presentation" title="Arraste para aumentar ou diminuir" onPointerDown={start(g)} />
      ))}
      <i className="grip grip-side grip-w" data-grip="w" role="presentation" title="Arraste para mudar a largura" onPointerDown={start('w')} />
      <i className="grip grip-side grip-e" data-grip="e" role="presentation" title="Arraste para mudar a largura" onPointerDown={start('e')} />
      <button
        type="button"
        className="grip-rot"
        aria-label="Girar o texto (arraste; clique duplo volta a 0°)"
        title="Arraste para girar · Shift: de 15 em 15° · clique duplo: 0°"
        onPointerDown={start('rotate')}
        onDoubleClick={() => editor.patchStyle({ rotation: 0 })}
      >
        <LuRotateCw aria-hidden />
      </button>
      {label && <span className="grip-label">{label}</span>}
    </div>
  );
}

const SNAP = 1.3;

/** Palco editável: o mesmo renderizador do telão + seleção e arraste do texto. */
function Surface({ guides }: { guides: boolean }) {
  const project = useEditor((s) => s.project)!;
  const slide = useActiveSlide();
  const layerId = useEditor((s) => s.layerId);
  const replayKey = useEditor((s) => s.replayKey);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [hover, setHover] = useState(false);
  const selectedWords = useWordSelection();
  const pendingWord = useRef<{ key: string | null; add: boolean; sx: number; sy: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const [drag, setDrag] = useState<{ sx: number; sy: number; x0: number; y0: number; snapX: boolean; snapY: boolean } | null>(null);
  const [busy, setBusy] = useState(false); // usando uma alça (tamanho/giro)
  const slideRef = useRef(slide);
  slideRef.current = slide;

  // mede a camada selecionada depois que o palco terminou de atualizar
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const raf = requestAnimationFrame(() => {
      const els = layerId ? root.querySelectorAll<HTMLElement>(`[data-layer="${layerId}"]`) : [];
      const el = els.length ? els[els.length - 1] : null;
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      const p = root.getBoundingClientRect();
      // centro: o da caixa na tela (girar não tira o centro do lugar); tamanho: o do layout, sem giro
      const k = root.offsetWidth ? p.width / root.offsetWidth : 1;
      const rot = slideRef.current?.layers.find((l) => l.id === layerId)?.style.rotation ?? 0;
      const next = { cx: r.left + r.width / 2 - p.left, cy: r.top + r.height / 2 - p.top, w: el.offsetWidth * k, h: el.offsetHeight * k, rot };
      setBox((b) =>
        b && Math.abs(b.cx - next.cx) < 0.5 && Math.abs(b.cy - next.cy) < 0.5 && Math.abs(b.w - next.w) < 0.5 && Math.abs(b.h - next.h) < 0.5 && b.rot === next.rot ? b : next,
      );
    });
    return () => cancelAnimationFrame(raf);
  });

  /** Camada visível sob o ponteiro (a de cima primeiro). */
  const hit = (clientX: number, clientY: number): string | null => {
    const root = ref.current;
    if (!root || !slide) return null;
    for (const layer of [...slide.layers].reverse()) {
      if (!layer.visible) continue;
      const els = root.querySelectorAll<HTMLElement>(`[data-layer="${layer.id}"]`);
      const el = els[els.length - 1];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const pad = 6;
      if (clientX >= r.left - pad && clientX <= r.right + pad && clientY >= r.top - pad && clientY <= r.bottom + pad) return layer.id;
    }
    return null;
  };

  /** Palavra sob o ponteiro, no quadro de texto atual. */
  const wordAt = (clientX: number, clientY: number): string | null => {
    const root = ref.current;
    if (!root) return null;
    const frames = root.querySelectorAll('.text-frame');
    const frame = frames[frames.length - 1];
    if (!frame) return null;
    for (const el of Array.from(frame.querySelectorAll<HTMLElement>('[data-w]'))) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left - 3 && clientX <= r.right + 3 && clientY >= r.top - 2 && clientY <= r.bottom + 2) return wordKey(el.dataset.lid ?? '', Number(el.dataset.w));
    }
    return null;
  };

  const layer = slide?.layers.find((l) => l.id === layerId);
  const highlight = selectedWords
    .map((k) => {
      const i = k.lastIndexOf(':');
      return `.surface [data-lid="${CSS.escape(k.slice(0, i))}"][data-w="${Number(k.slice(i + 1))}"]`;
    })
    .join(',');

  return (
    <div ref={ref} className="surface">
      {highlight && <style>{`${highlight}{outline:2px solid var(--accent);outline-offset:5px;border-radius:6px}`}</style>}
      <Stage theme={project.theme} slide={slide} mode="live" replayKey={replayKey} />

      {(guides || drag) && (
        <div className="guides" aria-hidden>
          <i className="g-safe" />
          <i className="g-v" data-hot={drag?.snapX ? '1' : '0'} />
          <i className="g-h" data-hot={drag?.snapY ? '1' : '0'} />
        </div>
      )}


      <div
        className="hit"
        data-hover={hover && !drag ? '1' : '0'}
        data-drag={drag ? '1' : '0'}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          pendingWord.current = { key: wordAt(e.clientX, e.clientY), add: e.shiftKey || e.ctrlKey || e.metaKey, sx: e.clientX, sy: e.clientY };
          if (!layer) return;
          const id = hit(e.clientX, e.clientY);
          if (!id) return;
          editor.selectLayer(id);
          const target = slide?.layers.find((l) => l.id === id);
          if (!target) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ sx: e.clientX, sy: e.clientY, x0: target.style.x, y0: target.style.y, snapX: false, snapY: false });
        }}
        onPointerMove={(e) => {
          const root = ref.current;
          if (!root) return;
          if (!drag) {
            setHover(hit(e.clientX, e.clientY) !== null);
            return;
          }
          const r = root.getBoundingClientRect();
          let x = clamp(drag.x0 + ((e.clientX - drag.sx) / r.width) * 100, 0, 100);
          let y = clamp(drag.y0 + ((e.clientY - drag.sy) / r.height) * 100, 0, 100);
          const snapX = !e.altKey && Math.abs(x - 50) < SNAP;
          const snapY = !e.altKey && Math.abs(y - 50) < SNAP;
          if (snapX) x = 50;
          if (snapY) y = 50;
          setDrag((d) => (d ? { ...d, snapX, snapY } : d));
          editor.patchStyle({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
        }}
        onPointerUp={(e) => {
          setDrag(null);
          const p = pendingWord.current;
          pendingWord.current = null;
          if (!p || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) return; // foi um arraste, não um clique
          if (p.key) {
            wordSelection.click(p.key, p.add);
            writeSetting('right-tab', 'words');
          } else if (!p.add) wordSelection.clear();
        }}
        onPointerCancel={() => {
          setDrag(null);
          pendingWord.current = null;
        }}
        onPointerLeave={() => setHover(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          const root = ref.current;
          if (!root || !slide) return;
          setDrag(null);
          pendingWord.current = null;
          const key = wordAt(e.clientX, e.clientY);
          const i = key ? key.lastIndexOf(':') : -1;
          const word = key ? { layerId: key.slice(0, i), index: Number(key.slice(i + 1)) } : null;
          const id = word?.layerId ?? hit(e.clientX, e.clientY);
          if (id) editor.selectLayer(id);
          const r = root.getBoundingClientRect();
          const at = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
          setMenu({ x: e.clientX, y: e.clientY, items: buildStageMenu({ stage: root, slide, word, layerId: id, at, toast }) });
        }}
      />
      {box && layer && (
        <div className="sel-wrap" data-drag={drag ? '1' : '0'} data-busy={busy ? '1' : '0'}>
          <Handles box={box} layerName={layer.name} onBusy={setBusy} />
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

export function StageArea({ onLyrics }: { onLyrics: () => void }) {
  const aspect = useEditor((s) => s.project!.aspect);
  const index = useEditor((s) => s.project!.slides.findIndex((x) => x.id === s.slideId));
  const count = useEditor((s) => s.project!.slides.length);
  const allEmpty = useEditor((s) => s.project!.slides.every((x) => !slideText(x).trim()));
  const [guides, setGuides] = useSetting<boolean>('guides', false);

  const go = (delta: number) => {
    const p = editorStore.get().project;
    const target = p?.slides[clamp(index + delta, 0, count - 1)];
    if (target) editor.selectSlide(target.id);
  };

  return (
    <section className="sa" aria-label="Pré-visualização">
      <div className="sa-view">
        <FitBox ratio={ASPECT_RATIOS[aspect]} padding={22}>
          <Surface guides={guides} />
        </FitBox>
        {allEmpty && (
          <div className="sa-empty">
            <h3>Comece pela letra</h3>
            <p>Cole a letra do louvor e ela será dividida em trechos prontos para o telão.</p>
            <Button variant="primary" icon={<LuClipboardPaste />} onClick={onLyrics}>
              Colar letra
            </Button>
          </div>
        )}
      </div>

      <div className="sa-bar">
        <div className="sa-nav">
          <IconButton label="Trecho anterior (↑)" icon={<LuChevronLeft />} size="sm" onClick={() => go(-1)} disabled={index <= 0} />
          <span className="sa-pos" aria-live="polite">
            {index + 1} <small>de {count}</small>
          </span>
          <IconButton label="Próximo trecho (↓)" icon={<LuChevronRight />} size="sm" onClick={() => go(1)} disabled={index >= count - 1} />
        </div>
        <div className="sa-tools">
          <Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => editor.replay()} title="Repetir a animação de entrada e saída (R)">
            Repetir animação
          </Button>
          <IconButton label="Guias de centralização e área segura" icon={<LuGrid3X3 />} size="sm" active={guides} onClick={() => setGuides(!guides)} />
          <span className="chip">{aspect}</span>
        </div>
      </div>
    </section>
  );
}
