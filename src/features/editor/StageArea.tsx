import { useLayoutEffect, useRef, useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuClipboardPaste, LuGrid3X3, LuRotateCcw } from 'react-icons/lu';
import { slideText } from '../../core/defaults';
import { ASPECT_RATIOS } from '../../core/types';
import { clamp } from '../../core/util';
import { useSetting } from '../../core/settings';
import { FitBox } from '../../render/FitBox';
import { Stage } from '../../render/Stage';
import { editor, editorStore, useActiveSlide, useEditor } from '../../store/editor';
import { Button, IconButton } from '../../ui/Button';

interface Box {
  l: number;
  t: number;
  w: number;
  h: number;
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
  const [drag, setDrag] = useState<{ sx: number; sy: number; x0: number; y0: number; snapX: boolean; snapY: boolean } | null>(null);

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
      const next = { l: r.left - p.left, t: r.top - p.top, w: r.width, h: r.height };
      setBox((b) => (b && Math.abs(b.l - next.l) < 0.5 && Math.abs(b.t - next.t) < 0.5 && Math.abs(b.w - next.w) < 0.5 && Math.abs(b.h - next.h) < 0.5 ? b : next));
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

  const layer = slide?.layers.find((l) => l.id === layerId);

  return (
    <div ref={ref} className="surface">
      <Stage theme={project.theme} slide={slide} mode="live" replayKey={replayKey} />

      {(guides || drag) && (
        <div className="guides" aria-hidden>
          <i className="g-safe" />
          <i className="g-v" data-hot={drag?.snapX ? '1' : '0'} />
          <i className="g-h" data-hot={drag?.snapY ? '1' : '0'} />
        </div>
      )}

      {box && layer && (
        <div className="sel" style={{ left: box.l, top: box.t, width: box.w, height: box.h }} data-drag={drag ? '1' : '0'} aria-hidden>
          <span className="sel-tag">{layer.name}</span>
        </div>
      )}

      <div
        className="hit"
        data-hover={hover && !drag ? '1' : '0'}
        data-drag={drag ? '1' : '0'}
        onPointerDown={(e) => {
          if (e.button !== 0 || !layer) return;
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
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(false)}
      />
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
