import { useEffect, useState } from 'react';
import { LuArrowLeftRight, LuMinus, LuPalette, LuPlus, LuRefreshCw, LuUndo2 } from 'react-icons/lu';
import { navigate, paths } from '../../../app/router';
import { getDesign, saveDesign } from '../../../core/storage/designs';
import type { BackgroundDesign } from '../../../core/types';
import { toast, toastError } from '../../../ui/toast';
import { ANIMATED_LABELS, ensureStops } from '../../../core/backgrounds';
import { resolveBackground } from '../../../core/defaults';
import type { AnimatedKind, BackgroundKind } from '../../../core/types';
import { editor, useActiveSlide, useEditor } from '../../../store/editor';
import { Button, IconButton } from '../../../ui/Button';
import { ColorField, Row, Section, Segmented, Select, Slider } from '../../../ui/Controls';
import { MediaGrid } from '../MediaGrid';

const KINDS: { value: BackgroundKind; label: string }[] = [
  { value: 'solid', label: 'Cor' },
  { value: 'gradient', label: 'Degradê' },
  { value: 'image', label: 'Imagem' },
  { value: 'video', label: 'Vídeo' },
  { value: 'animated', label: 'Animado' },
];

export function BackgroundPanel() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const scope = useEditor((s) => s.scope);
  const bg = resolveBackground(slide, theme);
  const set = editor.patchBackground;
  const a = bg.adjust;
  const media = bg.kind === 'image' || bg.kind === 'video';
  const own = !!slide?.background && scope === 'slide';
  const projectId = useEditor((s) => s.project!.id);
  const kinds = bg.design ? [...KINDS, { value: 'design' as BackgroundKind, label: 'Estúdio' }] : KINDS;

  const setStops = (stops: typeof bg.gradient.stops) => set({ gradient: { stops } });

  return (
    <div className="props">
      {own && (
        <div className="notice">
          <span>Este trecho tem um fundo próprio.</span>
          <Button size="sm" variant="ghost" icon={<LuUndo2 />} onClick={() => editor.clearOverride('background')}>
            Usar o do tema
          </Button>
        </div>
      )}

      <Section title="Tipo de fundo">
        <Segmented<BackgroundKind> size="sm" label="Tipo de fundo" value={bg.kind} onChange={(v) => set({ kind: v })} options={kinds} />
      </Section>

      <Section title={bg.kind === 'solid' ? 'Cor' : bg.kind === 'gradient' ? 'Degradê' : bg.kind === 'animated' ? 'Fundo animado' : bg.kind === 'design' ? 'Fundo do Estúdio' : bg.kind === 'image' ? 'Imagem' : 'Vídeo'}>
        {bg.kind === 'design' && bg.design && <DesignSection design={bg.design} projectId={projectId} speed={bg.speed} color={bg.color} />}
        {bg.kind === 'solid' && (
          <Row label="Cor de fundo">
            <ColorField label="Cor de fundo" value={bg.color} onChange={(v) => set({ color: v })} />
          </Row>
        )}

        {bg.kind === 'gradient' && (
          <>
            <Slider label="Ângulo" value={bg.gradient.angle} min={0} max={360} step={1} unit="°" reset={160} onChange={(v) => set({ gradient: { angle: v } })} />
            <div className="stops">
              {bg.gradient.stops.map((st, i) => (
                <div className="stop" key={i}>
                  <ColorField
                    label={`Cor ${i + 1}`}
                    value={st.color}
                    onChange={(v) => setStops(bg.gradient.stops.map((x, j) => (j === i ? { ...x, color: v } : x)))}
                  />
                  <input
                    className="range stop-range"
                    type="range"
                    min={0}
                    max={100}
                    value={st.at}
                    aria-label={`Posição da cor ${i + 1}`}
                    style={{ '--p': `${st.at}%` }}
                    onChange={(e) => setStops(bg.gradient.stops.map((x, j) => (j === i ? { ...x, at: Number(e.currentTarget.value) } : x)))}
                  />
                  <IconButton
                    label={`Remover cor ${i + 1}`}
                    icon={<LuMinus />}
                    size="sm"
                    disabled={bg.gradient.stops.length <= 2}
                    onClick={() => setStops(bg.gradient.stops.filter((_, j) => j !== i))}
                  />
                </div>
              ))}
            </div>
            <div className="props-pair">
              <Button
                size="sm"
                icon={<LuPlus />}
                disabled={bg.gradient.stops.length >= 5}
                onClick={() => setStops([...bg.gradient.stops, { color: '#ffffff', at: 100 }])}
              >
                Adicionar cor
              </Button>
              <Button size="sm" icon={<LuArrowLeftRight />} onClick={() => setStops([...bg.gradient.stops].reverse().map((x) => ({ ...x, at: 100 - x.at })))}>
                Inverter
              </Button>
            </div>
          </>
        )}

        {bg.kind === 'animated' && (
          <>
            <Row label="Estilo">
              <Select value={bg.animated} onChange={(v) => set({ animated: v as AnimatedKind })} label="Estilo do fundo animado">
                {(Object.keys(ANIMATED_LABELS) as AnimatedKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ANIMATED_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Row>
            {[0, 1, 2].map((i) => {
              const stops = ensureStops(bg, 3);
              return (
                <Row key={i} label={`Cor ${i + 1}`}>
                  <ColorField label={`Cor ${i + 1}`} value={stops[i].color} onChange={(v) => setStops(stops.map((x, j) => (j === i ? { ...x, color: v } : x)))} />
                </Row>
              );
            })}
            <Row label="Cor base">
              <ColorField label="Cor base" value={bg.color} onChange={(v) => set({ color: v })} />
            </Row>
            <Slider label="Velocidade" value={bg.speed} min={0.25} max={2.5} step={0.05} unit="×" reset={1} onChange={(v) => set({ speed: v })} />
          </>
        )}

        {media && (
          <>
            <MediaGrid
              kinds={[bg.kind === 'video' ? 'video' : 'image']}
              selectedId={bg.mediaId}
              uploadLabel={bg.kind === 'video' ? 'Enviar vídeo' : 'Enviar imagem'}
              onPick={(m) => set({ kind: m.kind === 'video' ? 'video' : 'image', mediaId: m.id })}
            />
            {!bg.mediaId && <p className="props-note">Escolha um arquivo acima. Enquanto isso, a cor de fundo é usada.</p>}
            <Row label="Cor de reserva" hint="Aparece se o arquivo faltar">
              <ColorField label="Cor de reserva" value={bg.color} onChange={(v) => set({ color: v })} />
            </Row>
            <Slider label="Escala" value={bg.scale} min={100} max={300} step={1} unit="%" reset={100} onChange={(v) => set({ scale: v })} />
            <Slider label="Posição horizontal" value={bg.posX} min={0} max={100} step={1} unit="%" reset={50} onChange={(v) => set({ posX: v })} />
            <Slider label="Posição vertical" value={bg.posY} min={0} max={100} step={1} unit="%" reset={50} onChange={(v) => set({ posY: v })} />
            {bg.kind === 'video' && <Slider label="Velocidade do vídeo" value={bg.speed} min={0.25} max={2} step={0.05} unit="×" reset={1} onChange={(v) => set({ speed: v })} />}
          </>
        )}
      </Section>

      <Section title="Ajustes de imagem" defaultOpen={false} hint="Escurecer ajuda a destacar a letra sobre imagens claras ou vídeos movimentados.">
        <Slider label="Brilho" value={a.brightness} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { brightness: v } })} />
        <Slider label="Contraste" value={a.contrast} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { contrast: v } })} />
        <Slider label="Saturação" value={a.saturate} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { saturate: v } })} />
        <Slider label="Desfoque" value={a.blur} min={0} max={60} step={0.5} reset={0} onChange={(v) => set({ adjust: { blur: v } })} />
        <Slider label="Escurecer (transparência)" value={a.dim} min={0} max={90} unit="%" reset={0} onChange={(v) => set({ adjust: { dim: v } })} />
      </Section>
    </div>
  );
}

/** Fundo do Estúdio aplicado neste louvor (uma cópia). Oferece editar e, se "Meus fundos" tiver versão mais nova, atualizar. */
function DesignSection({ design, projectId, speed, color }: { design: BackgroundDesign; projectId: string; speed: number; color: string }) {
  const [saved, setSaved] = useState<BackgroundDesign | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void getDesign(design.id).then((d) => alive && setSaved(d));
    return () => {
      alive = false;
    };
  }, [design.id]);
  const newer = !!saved && saved.updatedAt > design.updatedAt && JSON.stringify(saved.layers) + saved.base + saved.loopSec !== JSON.stringify(design.layers) + design.base + design.loopSec;

  const edit = async () => {
    try {
      // edita a versão de "Meus fundos"; se ela não existir mais (louvor importado, fundo excluído), volta a existir a partir desta cópia
      if (!saved) await saveDesign(design, false);
      navigate(paths.studio(design.id, projectId));
    } catch {
      toastError('Não foi possível abrir o estúdio.');
    }
  };
  return (
    <>
      <div className="bg-design">
        <b>{design.name}</b>
        <small>
          Loop de {design.loopSec} s · {design.layers.length} {design.layers.length === 1 ? 'camada' : 'camadas'}. Este louvor guarda a própria cópia.
        </small>
      </div>
      {newer && saved && (
        <div className="notice">
          <span>Há uma versão mais nova em Meus fundos.</span>
          <Button
            size="sm"
            variant="ghost"
            icon={<LuRefreshCw />}
            onClick={() => {
              editor.replaceDesignCopies(saved);
              toast('Fundo atualizado');
            }}
          >
            Atualizar
          </Button>
        </div>
      )}
      <div className="props-pair">
        <Button size="sm" icon={<LuPalette />} onClick={() => void edit()}>
          Editar no estúdio
        </Button>
      </div>
      <Slider label="Velocidade" value={speed} min={0.25} max={2.5} step={0.05} unit="×" reset={1} onChange={(v) => editor.patchBackground({ speed: v })} />
      <Row label="Cor de reserva" hint="Aparece se o desenho não puder ser mostrado">
        <ColorField label="Cor de reserva" value={color} onChange={(v) => editor.patchBackground({ color: v })} />
      </Row>
    </>
  );
}
