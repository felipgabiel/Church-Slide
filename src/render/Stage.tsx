import { memo, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { captureOpacity, collectOverrides, FilterPool, play, type Geometry, type PlayHandle } from '../core/anim/engine';
import { resolveAnimation, resolveBackground } from '../core/defaults';
import type { Background, Slide, Theme } from '../core/types';
import { hasWordAnim } from '../core/words';
import { BackgroundView } from './Background';
import { applyFinalColors, colorSignature, layerNeedsLetters, startColorRun, type ColorRun } from './colorRun';
import { sameJson } from './css';
import { collectUnits, TextLayerView } from './TextLayerView';

/**
 * Palco do telão. É o ÚNICO componente que desenha um slide — usado no editor,
 * na prévia do operador e na janela do público. Assim o que se vê ao editar é
 * exatamente o que vai para o projetor.
 *
 * Modo `static`: estado final, sem vídeo nem animação (miniaturas).
 * Modo `live`: anima entrada/saída; ao trocar de trecho o novo texto entra
 * enquanto o antigo ainda sai, e o fundo faz crossfade — nunca há quadro vazio.
 * Se o fundo do próximo trecho for idêntico ao atual, ele NÃO é recarregado
 * (o vídeo continua tocando sem reinício).
 */

const BG_FADE_MS = 700;

interface Frame {
  key: number;
  slide: Slide;
  leaving: boolean;
}
interface BgFrame {
  key: number;
  bg: Background;
  leaving: boolean;
  instant: boolean;
}

export interface StageProps {
  theme: Theme;
  slide: Slide | null;
  mode: 'live' | 'static';
  /** Incrementar para reexecutar a animação do trecho atual. */
  replayKey?: number;
  blackout?: boolean;
}

type Shared = {
  geoRef: MutableRefObject<Geometry>;
  poolRef: MutableRefObject<FilterPool | null>;
};

function TextFrame({ frame, theme, shared, onExited }: { frame: Frame; theme: Theme; shared: Shared; onExited: (key: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<PlayHandle | null>(null);
  const colorRun = useRef<ColorRun | null>(null);
  const exiting = useRef(false);
  const cfg = resolveAnimation(frame.slide, theme);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  // palavra com animação própria só faz sentido se cada palavra for uma unidade
  const wordAnim = hasWordAnim(frame.slide.layers);
  const t0 = useRef(0);
  const enterEnd = useRef(0);
  // quais palavras trocam de cor e como: se mudar no meio (marcar/desmarcar), a troca é refeita na hora
  const colorSig = colorSignature(frame.slide.layers);

  // Entrada: roda uma vez, antes da primeira pintura.
  useLayoutEffect(() => {
    const units = collectUnits(ref.current);
    const h = play(units, cfgRef.current, 'enter', shared.geoRef.current, shared.poolRef.current, { overrides: collectOverrides(units) });
    handle.current = h;
    t0.current = performance.now();
    enterEnd.current = h.total;
    // terminou de entrar: cada camada refaz o ajuste de tamanho com o texto parado (igual ao vídeo)
    void h.finished.then(() => ref.current?.querySelectorAll('.layer').forEach((l) => l.dispatchEvent(new Event('cs:refit'))));
    colorRun.current = startColorRun(ref.current, frame.slide.layers, h.total);
    return () => {
      h.cancel();
      colorRun.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcou/desmarcou palavras ou mudou as cores durante a edição: limpa e recalcula no ponto atual do relógio.
  const prevSig = useRef(colorSig);
  useLayoutEffect(() => {
    if (colorSig === prevSig.current || exiting.current || !ref.current) return;
    prevSig.current = colorSig;
    colorRun.current?.cancel();
    ref.current.querySelectorAll<HTMLElement>('[data-w], .ch').forEach((el) => el.style.removeProperty('color'));
    colorRun.current = startColorRun(ref.current, frame.slide.layers, enterEnd.current, performance.now() - t0.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorSig]);

  // Saída: quando o quadro é marcado como "leaving".
  useLayoutEffect(() => {
    if (!frame.leaving || exiting.current) return;
    exiting.current = true;
    const units = collectUnits(ref.current);
    const startOpacity = captureOpacity(units);
    handle.current?.cancel();
    colorRun.current?.cancel();
    units.forEach((u) => {
      u.style.transform = '';
      u.style.filter = '';
    });
    const h = play(units, cfgRef.current, 'exit', shared.geoRef.current, shared.poolRef.current, { startOpacity });
    handle.current = h;
    void h.finished.then(() => onExited(frame.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.leaving]);

  return (
    <div ref={ref} className="text-frame">
      {frame.slide.layers
        .filter((l) => l.visible)
        .map((l) => (
          <TextLayerView key={l.id} layer={l} unit={wordAnim ? 'word' : cfg.unit} float={cfg.float} letters={layerNeedsLetters(l)} />
        ))}
    </div>
  );
}

/** Estado final do trecho (miniaturas): sem animação, já na cor de chegada da troca de cor. */
function StaticFrame({ slide }: { slide: Slide }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    applyFinalColors(ref.current, slide.layers);
  });
  return (
    <div ref={ref} className="text-frame">
      {slide.layers
        .filter((l) => l.visible)
        .map((l) => (
          <TextLayerView key={l.id} layer={l} unit="block" letters={layerNeedsLetters(l)} />
        ))}
    </div>
  );
}

function BgLayer({ frame, onGone }: { frame: BgFrame; onGone: (key: number) => void }) {
  useEffect(() => {
    if (!frame.leaving) return;
    const t = setTimeout(() => onGone(frame.key), BG_FADE_MS + 120);
    return () => clearTimeout(t);
  }, [frame.leaving, frame.key, onGone]);
  return (
    <div className={`bg-layer${frame.instant ? '' : ' bg-in'}`}>
      <BackgroundView bg={frame.bg} mode="live" />
    </div>
  );
}

export const Stage = memo(function Stage({ theme, slide, mode, replayKey = 0, blackout = false }: StageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);
  const poolRef = useRef<FilterPool | null>(null);
  const geoRef = useRef<Geometry>({ w: 1920, h: 1080 });
  const shared = useRef<Shared>({ geoRef, poolRef }).current;

  const [frames, setFrames] = useState<Frame[]>([]);
  const [bgs, setBgs] = useState<BgFrame[]>([]);
  const seq = useRef(0);
  const last = useRef<{ id: string | null; replay: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !defsRef.current) return;
    poolRef.current = new FilterPool(defsRef.current);
    const measure = () => {
      geoRef.current = { w: root.clientWidth || 1920, h: root.clientHeight || 1080 };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // Sincroniza os quadros com as props (apenas no modo ao vivo).
  useLayoutEffect(() => {
    if (mode !== 'live') return;
    const id = slide?.id ?? null;
    const prev = last.current;
    const changed = !prev || prev.id !== id || prev.replay !== replayKey;
    last.current = { id, replay: replayKey };
    const nextBg = slide ? resolveBackground(slide, theme) : null;

    if (changed) {
      const frameKey = ++seq.current;
      const bgKey = ++seq.current;
      const first = !prev;
      setFrames((fs) => [...fs.map((f) => (f.leaving ? f : { ...f, leaving: true })), ...(slide ? [{ key: frameKey, slide, leaving: false }] : [])]);
      setBgs((bs) => {
        const cur = bs.find((b) => !b.leaving);
        if (!nextBg) return bs.map((b) => (b.leaving ? b : { ...b, leaving: true }));
        if (cur && sameJson(cur.bg, nextBg)) return bs; // mesmo fundo: não recarrega (vídeo segue tocando)
        return [...bs.map((b) => (b.leaving ? b : { ...b, leaving: true })), { key: bgKey, bg: nextBg, leaving: false, instant: first }];
      });
    } else if (slide && nextBg) {
      setFrames((fs) => fs.map((f) => (f.leaving ? f : { ...f, slide })));
      setBgs((bs) => bs.map((b) => (b.leaving || sameJson(b.bg, nextBg) ? b : { ...b, bg: nextBg })));
    }
  }, [slide, theme, replayKey, mode]);

  const removeFrame = (key: number) => setFrames((fs) => fs.filter((f) => f.key !== key));
  const removeBg = (key: number) => setBgs((bs) => bs.filter((b) => b.key !== key));

  return (
    <div ref={rootRef} className="stage">
      <svg className="stage-filters" width="0" height="0" aria-hidden>
        <defs ref={defsRef} />
      </svg>

      {mode === 'static' ? (
        slide && (
          <>
            <div className="bg-layer">
              <BackgroundView bg={resolveBackground(slide, theme)} mode="static" />
            </div>
            <StaticFrame slide={slide} />
          </>
        )
      ) : (
        <>
          {bgs.map((b) => (
            <BgLayer key={b.key} frame={b} onGone={removeBg} />
          ))}
          {frames.map((f) => (
            <TextFrame key={f.key} frame={f} theme={theme} shared={shared} onExited={removeFrame} />
          ))}
        </>
      )}

      <div className="stage-black" data-on={blackout ? '1' : '0'} />
    </div>
  );
});
