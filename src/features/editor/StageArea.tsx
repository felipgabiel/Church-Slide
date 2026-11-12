import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { LuChevronLeft, LuChevronRight, LuClipboardPaste, LuGrid3X3, LuRotateCcw, LuRotateCw, LuZoomIn, LuZoomOut } from 'react-icons/lu';
import { SnapToggle } from '../../ui/SnapToggle';
import { slideText } from '../../core/defaults';
import { ASPECT_RATIOS } from '../../core/types';
import { clamp } from '../../core/util';
import { useSetting, writeSetting } from '../../core/settings';
import { useWordSelection, wordKey, wordSelection } from '../../store/wordSelection';
import { stepZoom, ZoomView, ZOOM_MAX, ZOOM_MIN } from './ZoomView';
import { rotatedHalf, SAFE_MARGIN, snapAxis, SNAP_PX, SNAP_SETTING, type SnapHit } from '../../core/snap';
import { Stage } from '../../render/Stage';
import { editor, editorStore, useActiveSlide, useEditor, useSelectedLayerIds } from '../../store/editor';
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


/** Palco editável: o mesmo renderizador do telão + seleção e arraste do texto. */
function Surface({ guides }: { guides: boolean }) {
  const project = useEditor((s) => s.project)!;
  const slide = useActiveSlide();
  const layerId = useEditor((s) => s.layerId);
  const replayKey = useEditor((s) => s.replayKey);
  const ref = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [editing, setEditing] = useState<string | null>(null);
  // botão "Texto" da barra de cima: abre o texto novo já para digitar
  useEffect(() => {
    const on = (e: Event) => setEditing((e as CustomEvent<string>).detail);
    window.addEventListener('cs:edit-layer', on);
    return () => window.removeEventListener('cs:edit-layer', on);
  }, []);
  const selIds = useSelectedLayerIds();
  const selKey = selIds.join(',');
  const box = layerId ? boxes[layerId] ?? null : null;
  const [snapOn] = useSetting<boolean>(SNAP_SETTING, true);
  const [hover, setHover] = useState(false);
  const selectedWords = useWordSelection();
  const pendingWord = useRef<{ key: string | null; add: boolean; sx: number; sy: number; layer?: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const [drag, setDrag] = useState<{
    sx: number;
    sy: number;
    /** posição inicial de cada camada arrastada (a principal primeiro) */
    starts: Record<string, { x: number; y: number }>;
    /** caixa que envolve tudo o que está sendo arrastado, em % (centro e metades), no início */
    ux: number;
    uy: number;
    uhw: number;
    uhh: number;
    hitX: SnapHit;
    hitY: SnapHit;
  } | null>(null);
  const [busy, setBusy] = useState(false); // usando uma alça (tamanho/giro)
  const slideRef = useRef(slide);
  slideRef.current = slide;

  // mede as camadas selecionadas depois que o palco terminou de atualizar
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const raf = requestAnimationFrame(() => {
      const p = root.getBoundingClientRect();
      const k = root.offsetWidth ? p.width / root.offsetWidth : 1;
      const next: Record<string, Box> = {};
      for (const id of selKey ? selKey.split(',') : []) {
        const els = root.querySelectorAll<HTMLElement>(`[data-layer="${id}"]`);
        const el = els.length ? els[els.length - 1] : null;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // centro: o da caixa na tela (girar não tira o centro do lugar); tamanho: o do layout, sem giro
        const rot = slideRef.current?.layers.find((l) => l.id === id)?.style.rotation ?? 0;
        next[id] = { cx: r.left + r.width / 2 - p.left, cy: r.top + r.height / 2 - p.top, w: el.offsetWidth * k, h: el.offsetHeight * k, rot };
      }
      setBoxes((prev) => {
        const same =
          Object.keys(prev).length === Object.keys(next).length &&
          Object.entries(next).every(([id, b]) => {
            const a = prev[id];
            return a && Math.abs(a.cx - b.cx) < 0.5 && Math.abs(a.cy - b.cy) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && a.rot === b.rot;
          });
        return same ? prev : next;
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  /** Camada visível sob o ponteiro (a de cima primeiro). */
  const hit = (clientX: number, clientY: number): string | null => {
    const root = ref.current;
    if (!root || !slide) return null;
    // a palavra que está de fato sob o ponteiro vence (caixas de texto podem se sobrepor)
    const k = wordAt(clientX, clientY);
    if (k) {
      const lid = k.slice(0, k.lastIndexOf(':'));
      if (slide.layers.some((l) => l.id === lid && l.visible)) return lid;
    }
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
    // de trás para frente: a camada de cima (desenhada por último) vence quando as palavras se sobrepõem
    for (const el of Array.from(frame.querySelectorAll<HTMLElement>('[data-w]')).reverse()) {
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
          <i className="g-safe" data-hot={drag && (drag.hitX?.startsWith('safe') || drag.hitY?.startsWith('safe')) ? '1' : '0'} />
          <i className="g-v" data-hot={drag?.hitX === 'center' ? '1' : '0'} />
          <i className="g-h" data-hot={drag?.hitY === 'center' ? '1' : '0'} />
          {drag?.hitX === 'start' && <i className="g-edge g-edge-l" />}
          {drag?.hitX === 'end' && <i className="g-edge g-edge-r" />}
          {drag?.hitY === 'start' && <i className="g-edge g-edge-t" />}
          {drag?.hitY === 'end' && <i className="g-edge g-edge-b" />}
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
          const additive = e.ctrlKey || e.metaKey;
          const already = selIds.includes(id);
          if (additive && !already) {
            // Ctrl + clique noutra camada: soma ela à seleção (não marca palavra nem arrasta)
            editor.selectLayer(id, true);
            pendingWord.current = null;
            return;
          }
          // clique simples numa camada que já faz parte da seleção múltipla: arrasta o grupo todo
          const group = already && selIds.length > 1 ? selIds : [id];
          if (group.length > 1) editor.focusLayer(id);
          else if (!additive) editor.selectLayer(id);
          if (pendingWord.current) pendingWord.current.layer = id;
          const root = ref.current!;
          const r = root.getBoundingClientRect();
          const starts: Record<string, { x: number; y: number }> = {};
          for (const gid of [id, ...group.filter((g) => g !== id)]) {
            const l = slide?.layers.find((q) => q.id === gid);
            if (l) starts[gid] = { x: l.style.x, y: l.style.y };
          }
          // caixa que envolve o grupo (em % do slide), para o ímã alinhar a borda de fora
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const gid of Object.keys(starts)) {
            const b = boxes[gid];
            if (!b) continue;
            const hh = rotatedHalf(b.w, b.h, b.rot);
            minX = Math.min(minX, b.cx - hh.hw);
            maxX = Math.max(maxX, b.cx + hh.hw);
            minY = Math.min(minY, b.cy - hh.hh);
            maxY = Math.max(maxY, b.cy + hh.hh);
          }
          const known = Number.isFinite(minX);
          const st0 = starts[id];
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            sx: e.clientX,
            sy: e.clientY,
            starts,
            ux: known ? (((minX + maxX) / 2) / r.width) * 100 : st0.x,
            uy: known ? (((minY + maxY) / 2) / r.height) * 100 : st0.y,
            uhw: known ? (((maxX - minX) / 2) / r.width) * 100 : 0,
            uhh: known ? (((maxY - minY) / 2) / r.height) * 100 : 0,
            hitX: null,
            hitY: null,
          });
        }}
        onPointerMove={(e) => {
          const root = ref.current;
          if (!root) return;
          if (!drag) {
            setHover(hit(e.clientX, e.clientY) !== null);
            return;
          }
          const r = root.getBoundingClientRect();
          const ddx = ((e.clientX - drag.sx) / r.width) * 100;
          const ddy = ((e.clientY - drag.sy) / r.height) * 100;
          // o grupo inteiro (ou a caixa sozinha) anda junto; o ímã olha para a caixa que envolve tudo
          let ux = drag.ux + ddx;
          let uy = drag.uy + ddy;
          let hitX: SnapHit = null;
          let hitY: SnapHit = null;
          // ímã: encosta na borda, na margem segura ou no centro quando chega perto; continuar arrastando solta.
          // Desligado no botão "Ímã" (ou segurando Alt), o movimento é totalmente livre.
          if (snapOn && !e.altKey) {
            const known = drag.uhw > 0 || drag.uhh > 0;
            const sx = snapAxis(ux, drag.uhw, (SNAP_PX / r.width) * 100, { edges: known, safe: SAFE_MARGIN });
            const sy = snapAxis(uy, drag.uhh, (SNAP_PX / r.height) * 100, { edges: known, safe: SAFE_MARGIN });
            ux = sx.pos;
            uy = sy.pos;
            hitX = sx.hit;
            hitY = sy.hit;
          }
          const mx = ux - drag.ux;
          const my = uy - drag.uy;
          if (hitX !== drag.hitX || hitY !== drag.hitY) setDrag((d) => (d ? { ...d, hitX, hitY } : d));
          const ids = Object.keys(drag.starts);
          const at = (id: string) => ({
            x: Math.round(clamp(drag.starts[id].x + mx, 0, 100) * 10) / 10,
            y: Math.round(clamp(drag.starts[id].y + my, 0, 100) * 10) / 10,
          });
          if (ids.length > 1) editor.moveLayers(Object.fromEntries(ids.map((id) => [id, at(id)])));
          else editor.patchStyle(at(ids[0]));
        }}
        onPointerUp={(e) => {
          setDrag(null);
          const p = pendingWord.current;
          pendingWord.current = null;
          if (!p || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) return; // foi um arraste, não um clique
          // clique simples (sem arrastar) numa camada do grupo: volta a selecionar só ela
          if (!p.add && p.layer && editorStore.get().extraLayerIds.length) editor.selectLayer(p.layer);
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
        onDoubleClick={(e) => {
          // duplo clique no texto: edita ali mesmo
          const id = hit(e.clientX, e.clientY);
          if (!id || !slide) return;
          editor.selectLayer(id);
          setEditing(id);
        }}
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
      {selIds.slice(1).map((id) => {
        const b = boxes[id];
        return b ? <div key={id} className="sel sel-extra" style={{ left: b.cx, top: b.cy, width: b.w, height: b.h, transform: `translate(-50%, -50%) rotate(${b.rot}deg)` }} aria-hidden /> : null;
      })}
      {selIds.length > 1 && <span className="sel-count">{selIds.length} textos selecionados · Ctrl + clique soma ou tira</span>}
      {box && layer && (
        <div className="sel-wrap" data-drag={drag ? '1' : '0'} data-busy={busy ? '1' : '0'}>
          <Handles box={box} layerName={layer.name} onBusy={setBusy} />
        </div>
      )}
      {editing && slide && boxes[editing] && (
        <InlineText
          key={editing}
          box={boxes[editing]}
          text={slide.layers.find((l) => l.id === editing)?.text ?? ''}
          onChange={(t) => editor.setLayerText(slide.id, editing, t)}
          onDone={() => setEditing(null)}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/**
 * Edição no próprio palco (duplo clique): uma caixa por cima do texto, do tamanho dele. O palco atrás
 * acompanha cada letra digitada. Enter quebra a linha; Esc, Ctrl+Enter ou clicar fora termina.
 */
function InlineText({ box, text, onChange, onDone }: { box: Box; text: string; onChange: (t: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
  const w = Math.max(260, box.w);
  return (
    <div className="inline-edit" style={{ left: box.cx - w / 2, top: box.cy - box.h / 2, width: w }} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        value={text}
        aria-label="Editar texto no palco"
        spellCheck
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          e.stopPropagation(); // atalhos do editor não disparam enquanto digita
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            onDone();
          }
        }}
      />
      <small>Enter quebra a linha · Esc ou clicar fora termina</small>
    </div>
  );
}

export function StageArea({ onLyrics }: { onLyrics: () => void }) {
  const aspect = useEditor((s) => s.project!.aspect);
  const index = useEditor((s) => s.project!.slides.findIndex((x) => x.id === s.slideId));
  const count = useEditor((s) => s.project!.slides.length);
  const allEmpty = useEditor((s) => s.project!.slides.every((x) => !slideText(x).trim()));
  const [guides, setGuides] = useSetting<boolean>('guides', false);
  const [zoom, setZoom] = useState(1);
  const zoomTo = (z: number) => window.dispatchEvent(new CustomEvent('cs:stage-zoom', { detail: z }));

  const go = (delta: number) => {
    const p = editorStore.get().project;
    const target = p?.slides[clamp(index + delta, 0, count - 1)];
    if (target) editor.selectSlide(target.id);
  };

  return (
    <section className="sa" aria-label="Pré-visualização">
      <div className="sa-view">
        <ZoomView ratio={ASPECT_RATIOS[aspect]} padding={22} zoom={zoom} onZoom={setZoom}>
          <Surface guides={guides} />
        </ZoomView>
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
          <div className="sa-zoom" role="group" aria-label="Zoom do palco">
            <IconButton label="Diminuir zoom (Ctrl + roda do mouse)" icon={<LuZoomOut />} size="sm" onClick={() => zoomTo(stepZoom(zoom, -1))} disabled={zoom <= ZOOM_MIN} />
            <button type="button" className="sa-zoom-val" onClick={() => zoomTo(1)} title="Caber na tela" aria-label={`Zoom ${Math.round(zoom * 100)}%. Clique para caber na tela`}>
              {Math.round(zoom * 100)}%
            </button>
            <IconButton label="Aumentar zoom (Ctrl + roda do mouse)" icon={<LuZoomIn />} size="sm" onClick={() => zoomTo(stepZoom(zoom, 1))} disabled={zoom >= ZOOM_MAX} />
          </div>
          <SnapToggle />
          <IconButton label="Guias de centralização e área segura" icon={<LuGrid3X3 />} size="sm" active={guides} onClick={() => setGuides(!guides)} />
          <span className="chip">{aspect}</span>
        </div>
      </div>
    </section>
  );
}
