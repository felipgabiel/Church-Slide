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
import { tr } from '../../../core/i18n';

const KINDS: { value: BackgroundKind; label: string }[] = [
  { value: 'solid', label: tr('Cor') },
  { value: 'gradient', label: tr('Degradê') },
  { value: 'image', label: tr('Imagem') },
  { value: 'video', label: tr('Vídeo') },
  { value: 'animated', label: tr('Animado') },
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
  const kinds = bg.design ? [...KINDS, { value: 'design' as BackgroundKind, label: tr('Estúdio') }] : KINDS;

  const setStops = (stops: typeof bg.gradient.stops) => set({ gradient: { stops } });

  return (
    <div className="props">
      {own && (
        <div className="notice">
          <span>{tr('Este trecho tem um fundo próprio.')}</span>
          <Button size="sm" variant="ghost" icon={<LuUndo2 />} onClick={() => editor.clearOverride('background')}>
            {tr('Usar o do tema')}
          </Button>
        </div>
      )}

      <Section title={tr('Tipo de fundo')}>
        <Segmented<BackgroundKind> size="sm" label={tr('Tipo de fundo')} value={bg.kind} onChange={(v) => set({ kind: v })} options={kinds} />
      </Section>

      <Section title={bg.kind === 'solid' ? tr('Cor') : bg.kind === 'gradient' ? tr('Degradê') : bg.kind === 'animated' ? tr('Fundo animado') : bg.kind === 'design' ? tr('Fundo do Estúdio') : bg.kind === 'image' ? tr('Imagem') : tr('Vídeo')}>
        {bg.kind === 'design' && bg.design && <DesignSection design={bg.design} projectId={projectId} speed={bg.speed} color={bg.color} />}
        {bg.kind === 'solid' && (
          <Row label={tr('Cor de fundo')}>
            <ColorField label={tr('Cor de fundo')} value={bg.color} onChange={(v) => set({ color: v })} />
          </Row>
        )}

        {bg.kind === 'gradient' && (
          <>
            <Slider label={tr('Ângulo')} value={bg.gradient.angle} min={0} max={360} step={1} unit="°" reset={160} onChange={(v) => set({ gradient: { angle: v } })} />
            <div className="stops">
              {bg.gradient.stops.map((st, i) => (
                <div className="stop" key={i}>
                  <ColorField
                    label={tr('Cor {0}', i + 1)}
                    value={st.color}
                    onChange={(v) => setStops(bg.gradient.stops.map((x, j) => (j === i ? { ...x, color: v } : x)))}
                  />
                  <input
                    className="range stop-range"
                    type="range"
                    min={0}
                    max={100}
                    value={st.at}
                    aria-label={tr('Posição da cor {0}', i + 1)}
                    style={{ '--p': `${st.at}%` }}
                    onChange={(e) => setStops(bg.gradient.stops.map((x, j) => (j === i ? { ...x, at: Number(e.currentTarget.value) } : x)))}
                  />
                  <IconButton
                    label={tr('Remover cor {0}', i + 1)}
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
                {tr('Adicionar cor')}
              </Button>
              <Button size="sm" icon={<LuArrowLeftRight />} onClick={() => setStops([...bg.gradient.stops].reverse().map((x) => ({ ...x, at: 100 - x.at })))}>
                {tr('Inverter')}
              </Button>
            </div>
          </>
        )}

        {bg.kind === 'animated' && (
          <>
            <Row label={tr('Estilo')}>
              <Select value={bg.animated} onChange={(v) => set({ animated: v as AnimatedKind })} label={tr('Estilo do fundo animado')}>
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
                <Row key={i} label={tr('Cor {0}', i + 1)}>
                  <ColorField label={tr('Cor {0}', i + 1)} value={stops[i].color} onChange={(v) => setStops(stops.map((x, j) => (j === i ? { ...x, color: v } : x)))} />
                </Row>
              );
            })}
            <Row label={tr('Cor base')}>
              <ColorField label={tr('Cor base')} value={bg.color} onChange={(v) => set({ color: v })} />
            </Row>
            <Slider label={tr('Velocidade')} value={bg.speed} min={0.25} max={2.5} step={0.05} unit="×" reset={1} onChange={(v) => set({ speed: v })} />
          </>
        )}

        {media && (
          <>
            <MediaGrid
              kinds={[bg.kind === 'video' ? 'video' : 'image']}
              selectedId={bg.mediaId}
              uploadLabel={bg.kind === 'video' ? tr('Enviar vídeo') : tr('Enviar imagem')}
              onPick={(m) => set({ kind: m.kind === 'video' ? 'video' : 'image', mediaId: m.id })}
            />
            {!bg.mediaId && <p className="props-note">{tr('Escolha um arquivo acima. Enquanto isso, a cor de fundo é usada.')}</p>}
            <Row label={tr('Cor de reserva')} hint={tr('Aparece se o arquivo faltar')}>
              <ColorField label={tr('Cor de reserva')} value={bg.color} onChange={(v) => set({ color: v })} />
            </Row>
            <Slider label={tr('Escala')} value={bg.scale} min={100} max={300} step={1} unit="%" reset={100} onChange={(v) => set({ scale: v })} />
            <Slider label={tr('Posição horizontal')} value={bg.posX} min={0} max={100} step={1} unit="%" reset={50} onChange={(v) => set({ posX: v })} />
            <Slider label={tr('Posição vertical')} value={bg.posY} min={0} max={100} step={1} unit="%" reset={50} onChange={(v) => set({ posY: v })} />
            {bg.kind === 'video' && <Slider label={tr('Velocidade do vídeo')} value={bg.speed} min={0.25} max={2} step={0.05} unit="×" reset={1} onChange={(v) => set({ speed: v })} />}
          </>
        )}
      </Section>

      <Section title={tr('Ajustes de imagem')} defaultOpen={false} hint={tr('Escurecer ajuda a destacar a letra sobre imagens claras ou vídeos movimentados.')}>
        <Slider label={tr('Brilho')} value={a.brightness} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { brightness: v } })} />
        <Slider label={tr('Contraste')} value={a.contrast} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { contrast: v } })} />
        <Slider label={tr('Saturação')} value={a.saturate} min={0} max={200} unit="%" reset={100} onChange={(v) => set({ adjust: { saturate: v } })} />
        <Slider label={tr('Desfoque')} value={a.blur} min={0} max={60} step={0.5} reset={0} onChange={(v) => set({ adjust: { blur: v } })} />
        <Slider label={tr('Escurecer (transparência)')} value={a.dim} min={0} max={90} unit="%" reset={0} onChange={(v) => set({ adjust: { dim: v } })} />
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
      toastError(tr('Não foi possível abrir o estúdio.'));
    }
  };
  return (
    <>
      <div className="bg-design">
        <b>{design.name}</b>
        <small>
          {tr('Loop de')}{' '}{design.loopSec} s · {design.layers.length} {design.layers.length === 1 ? tr('camada') : tr('camadas')}{tr('. Este louvor guarda a própria cópia.')}
        </small>
      </div>
      {newer && saved && (
        <div className="notice">
          <span>{tr('Há uma versão mais nova em Meus fundos.')}</span>
          <Button
            size="sm"
            variant="ghost"
            icon={<LuRefreshCw />}
            onClick={() => {
              editor.replaceDesignCopies(saved);
              toast(tr('Fundo atualizado'));
            }}
          >
            {tr('Atualizar')}
          </Button>
        </div>
      )}
      <div className="props-pair">
        <Button size="sm" icon={<LuPalette />} onClick={() => void edit()}>
          {tr('Editar no estúdio')}
        </Button>
      </div>
      <Slider label={tr('Velocidade')} value={speed} min={0.25} max={2.5} step={0.05} unit="×" reset={1} onChange={(v) => editor.patchBackground({ speed: v })} />
      <Row label={tr('Cor de reserva')} hint={tr('Aparece se o desenho não puder ser mostrado')}>
        <ColorField label={tr('Cor de reserva')} value={color} onChange={(v) => editor.patchBackground({ color: v })} />
      </Row>
    </>
  );
}
