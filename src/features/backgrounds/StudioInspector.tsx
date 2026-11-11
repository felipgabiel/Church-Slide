import { LuArrowLeftRight, LuMinus, LuPlus, LuX } from 'react-icons/lu';
import { BLEND_LABEL, KIND_LABEL, LOOP_OPTIONS, MAX_STOPS, MOTION_HINT, MOTION_LABEL, motionsFor, SHAPE_LABEL } from '../../core/design/model';
import type { DesignBlend, DesignFill, DesignFillType, DesignLayer, DesignMotion, DesignShape, DesignTexture } from '../../core/types';
import { Button, IconButton } from '../../ui/Button';
import { SwatchButton } from '../../ui/ColorPicker';
import { ColorField, Row, Section, Segmented, Select, Slider, ToggleRow } from '../../ui/Controls';
import { Menu } from '../../ui/Menu';
import type { StudioApi } from './Studio';
import { KIND_ICON } from './StudioLayers';

const FILL_TYPES: { value: DesignFillType; label: string }[] = [
  { value: 'solid', label: 'Cor' },
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
  { value: 'conic', label: 'Cônico' },
];

export function StudioInspector({ api }: { api: StudioApi }) {
  const l = api.selected;
  if (!l) return <DesignSettings api={api} />;
  const set = (patch: Partial<DesignLayer>, key?: string) => api.patchLayer(l.id, patch, key);
  const placed = l.kind === 'shape' || l.kind === 'glow' || l.kind === 'waves' || (l.kind === 'gradient' && l.fill.type !== 'linear' && l.fill.type !== 'solid');
  const idx = api.design.layers.findIndex((x) => x.id === l.id);

  return (
    <div className="props studio-props">
      <div className="insp-head">
        <span className="insp-ico" aria-hidden>
          {KIND_ICON[l.kind]}
        </span>
        <input className="insp-name" value={l.name} aria-label="Nome da camada" onChange={(e) => set({ name: e.currentTarget.value.slice(0, 60) }, `name:${l.id}`)} />
        <span className="insp-kind">{KIND_LABEL[l.kind]}</span>
      </div>

      {l.kind === 'shape' && (
        <Section title="Forma">
          <Row label="Formato">
            <Select value={l.shape} onChange={(v) => set({ shape: v as DesignShape })} label="Formato">
              {(Object.keys(SHAPE_LABEL) as DesignShape[]).map((s) => (
                <option key={s} value={s}>
                  {SHAPE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Row>
          {l.shape === 'rounded' && <Slider label="Cantos" value={l.radius} min={0} max={50} unit="%" reset={18} onChange={(v) => set({ radius: v })} />}
          {l.shape === 'polygon' && <Slider label="Lados" value={l.sides} min={3} max={12} reset={6} onChange={(v) => set({ sides: v })} />}
        </Section>
      )}

      {l.kind === 'texture' && (
        <Section title="Textura">
          <Segmented<DesignTexture> size="sm" label="Tipo de textura" value={l.texture} onChange={(v) => set({ texture: v })} options={[{ value: 'stripes', label: 'Listras' }, { value: 'grain', label: 'Grão' }]} />
          <Slider label={l.texture === 'stripes' ? 'Espaço entre listras' : 'Tamanho do grão'} value={l.scale} min={0.5} max={20} step={0.1} reset={l.texture === 'stripes' ? 3 : 3} onChange={(v) => set({ scale: v })} />
          {l.texture === 'stripes' && (
            <>
              <Slider label="Espessura" value={l.thickness} min={5} max={95} unit="%" reset={45} onChange={(v) => set({ thickness: v })} />
              <Slider label="Inclinação" value={l.rotation} min={-180} max={180} unit="°" reset={-35} onChange={(v) => set({ rotation: v })} />
            </>
          )}
        </Section>
      )}

      {l.kind === 'waves' && (
        <Section title="Ondas">
          <Slider label="Fios" value={l.count} min={1} max={20} reset={6} onChange={(v) => set({ count: v })} />
          <Slider label="Ondulação" value={l.amplitude} min={0} max={40} step={0.5} unit="%" reset={9} onChange={(v) => set({ amplitude: v })} />
          <Slider label="Espessura do fio" value={l.thickness} min={1} max={60} reset={6} onChange={(v) => set({ thickness: v })} />
        </Section>
      )}

      {l.kind === 'particles' && (
        <Section title="Partículas">
          <Slider label="Quantidade" value={l.count} min={1} max={120} reset={28} onChange={(v) => set({ count: v })} />
          <Slider label="Tamanho" value={l.scale} min={0.5} max={20} step={0.1} unit="%" reset={3} onChange={(v) => set({ scale: v })} />
          <p className="props-note">Elas sobem a tela inteira uma vez por loop.</p>
        </Section>
      )}

      {placed && (
        <Section title="Posição e tamanho" hint="Também dá para arrastar no palco. Setas movem um pouco; com Shift, mais.">
          <div className="insp-pair">
            <Slider label="Horizontal" value={l.x} min={-50} max={150} step={0.5} unit="%" reset={50} onChange={(v) => set({ x: v })} />
            <Slider label="Vertical" value={l.y} min={-50} max={150} step={0.5} unit="%" reset={50} onChange={(v) => set({ y: v })} />
          </div>
          {l.kind !== 'gradient' && (
            <div className="insp-pair">
              {l.kind !== 'waves' && <Slider label="Largura" value={l.w} min={1} max={300} step={0.5} unit="%" onChange={(v) => set({ w: v })} />}
              <Slider label={l.kind === 'waves' ? 'Altura da faixa' : 'Altura'} value={l.h} min={1} max={300} step={0.5} unit="%" onChange={(v) => set({ h: v })} />
            </div>
          )}
          {l.kind === 'gradient' && <Slider label="Alcance" value={l.w} min={10} max={300} unit="%" reset={100} onChange={(v) => set({ w: v })} />}
          <Slider label="Giro" value={l.rotation} min={-180} max={180} unit="°" reset={0} onChange={(v) => set({ rotation: v })} />
        </Section>
      )}

      <Section title={l.kind === 'texture' || l.kind === 'glow' ? 'Cor' : 'Cores'}>
        <FillEditor
          fill={l.fill}
          types={l.kind === 'gradient' || l.kind === 'shape' ? FILL_TYPES : l.kind === 'waves' || l.kind === 'particles' || l.kind === 'glow' ? null : 'single'}
          onChange={(fill, key) => set({ fill }, key ? `fill:${l.id}:${key}` : undefined)}
          allowAngle={l.kind === 'gradient' || l.kind === 'shape'}
        />
      </Section>

      <Section title="Movimento" hint="Tudo se repete sem emenda no fim do loop, no telão e no vídeo.">
        <MotionList layer={l} onChange={(motions, key) => set({ motions }, key)} />
      </Section>

      <Section title="Camada">
        <Slider label="Opacidade" value={l.opacity} min={0} max={100} unit="%" reset={100} onChange={(v) => set({ opacity: v })} />
        <Row label="Mistura" hint="“Tela” e “Somar luz” fazem luz somar com luz">
          <Select value={l.blend} onChange={(v) => set({ blend: v as DesignBlend })} label="Modo de mistura">
            {(Object.keys(BLEND_LABEL) as DesignBlend[]).map((b) => (
              <option key={b} value={b}>
                {BLEND_LABEL[b]}
              </option>
            ))}
          </Select>
        </Row>
        <Slider label="Desfoque" value={l.blur} min={0} max={100} reset={0} onChange={(v) => set({ blur: v })} />
        {idx > 0 && <ToggleRow label="Recortar pela camada de baixo" hint="Aparece só dentro dela (listras dentro do sol)" checked={l.clip} onChange={(v) => set({ clip: v })} />}
      </Section>

      <div className="insp-foot">
        <Button size="sm" variant="ghost" onClick={() => api.duplicateLayer(l.id)}>
          Duplicar
        </Button>
        <Button size="sm" variant="ghost" className="danger-text" onClick={() => api.removeLayer(l.id)}>
          Excluir camada
        </Button>
      </div>
    </div>
  );
}

function DesignSettings({ api }: { api: StudioApi }) {
  const d = api.design;
  return (
    <div className="props studio-props">
      <div className="insp-head">
        <span className="insp-ico insp-swatch" style={{ background: d.base }} aria-hidden />
        <b className="insp-title">Fundo inteiro</b>
      </div>
      <Section title="Loop" hint="O tempo que o fundo leva para voltar exatamente ao começo. Movimentos com mais voltas ficam mais rápidos.">
        <Segmented<string>
          size="sm"
          label="Duração do loop"
          value={String(d.loopSec)}
          onChange={(v) =>
            api.update((x) => {
              x.loopSec = Number(v);
            })
          }
          options={LOOP_OPTIONS.map((s) => ({ value: String(s), label: `${s} s` }))}
        />
      </Section>
      <Section title="Cor de base">
        <Row label="Cor por baixo de tudo">
          <ColorField
            label="Cor de base"
            value={d.base}
            onChange={(v) =>
              api.update((x) => {
                x.base = v;
              }, 'base')
            }
          />
        </Row>
      </Section>
      <p className="props-note insp-tip">Clique numa camada à esquerda, ou numa forma no palco, para ajustar.</p>
    </div>
  );
}

/* ------------------------------ cores ------------------------------ */

function FillEditor({ fill, types, onChange, allowAngle }: { fill: DesignFill; types: typeof FILL_TYPES | null | 'single'; onChange: (f: DesignFill, key?: string) => void; allowAngle: boolean }) {
  const stops = fill.stops;
  const single = types === 'single';
  const setStops = (s: DesignFill['stops'], key?: string) => onChange({ ...fill, stops: s }, key);
  return (
    <div className="fill-ed">
      {Array.isArray(types) && <Segmented<DesignFillType> size="sm" label="Tipo de preenchimento" value={fill.type} onChange={(v) => onChange({ ...fill, type: v, stops: v !== 'solid' && stops.length < 2 ? [...stops, { color: '#ffffff', at: 100 }] : stops })} options={types} />}
      {single || fill.type === 'solid' ? (
        <Row label="Cor">
          <ColorField label="Cor" value={stops[0]?.color ?? '#ffffff'} onChange={(v) => setStops([{ color: v, at: 0 }, ...stops.slice(1)], 'c0')} />
        </Row>
      ) : (
        <>
          <div className="stops">
            {stops.map((st, i) => (
              <div className="stop" key={i}>
                <SwatchButton label={`Cor ${i + 1}`} value={st.color} onChange={(v) => setStops(stops.map((x, j) => (j === i ? { ...x, color: v } : x)), `c${i}`)} />
                <input
                  className="range stop-range"
                  type="range"
                  min={0}
                  max={100}
                  value={st.at}
                  aria-label={`Posição da cor ${i + 1}`}
                  style={{ '--p': `${st.at}%` } as Record<string, string>}
                  onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, at: Number(e.currentTarget.value) } : x)), `at${i}`)}
                />
                <IconButton label={`Remover cor ${i + 1}`} icon={<LuMinus />} size="sm" disabled={stops.length <= (types === null ? 1 : 2)} onClick={() => setStops(stops.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          <div className="props-pair">
            <Button size="sm" icon={<LuPlus />} disabled={stops.length >= MAX_STOPS} onClick={() => setStops([...stops, { color: stops[stops.length - 1]?.color ?? '#ffffff', at: 100 }])}>
              Adicionar cor
            </Button>
            <Button size="sm" icon={<LuArrowLeftRight />} disabled={stops.length < 2} onClick={() => setStops([...stops].reverse().map((x) => ({ ...x, at: 100 - x.at })))}>
              Inverter
            </Button>
          </div>
          {allowAngle && (fill.type === 'linear' || fill.type === 'conic') && <Slider label="Ângulo" value={fill.angle} min={0} max={360} unit="°" reset={135} onChange={(v) => onChange({ ...fill, angle: v }, 'angle')} />}
        </>
      )}
    </div>
  );
}

/* ---------------------------- movimento ---------------------------- */

function MotionList({ layer, onChange }: { layer: DesignLayer; onChange: (m: DesignMotion[], key?: string) => void }) {
  const list = layer.motions;
  const avail = motionsFor(layer.kind).filter((k) => !list.some((m) => m.kind === k));
  const set = (i: number, patch: Partial<DesignMotion>, key?: string) => onChange(list.map((m, j) => (j === i ? { ...m, ...patch } : m)), key ? `motion:${layer.id}:${i}:${key}` : undefined);
  return (
    <div className="motions">
      {list.length === 0 && <p className="props-note">Parada. Adicione um movimento para dar vida ao fundo.</p>}
      {list.map((m, i) => (
        <div className="motion" key={m.kind}>
          <div className="motion-head">
            <b>{MOTION_LABEL[m.kind]}</b>
            <IconButton label={`Remover ${MOTION_LABEL[m.kind]}`} icon={<LuX />} size="sm" onClick={() => onChange(list.filter((_, j) => j !== i))} />
          </div>
          <Row label="Voltas por loop">
            <Segmented<string> size="sm" label="Voltas por loop" value={String(m.cycles)} onChange={(v) => set(i, { cycles: Number(v) })} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
          </Row>
          {m.kind !== 'spin' && m.kind !== 'flow' && <Slider label="Intensidade" value={m.amount} min={0} max={100} unit="%" reset={50} onChange={(v) => set(i, { amount: v }, 'amount')} />}
          {m.kind === 'colors' && (
            <div className="motion-pal">
              <span className="row-label">Paleta</span>
              <div className="motion-swatches">
                {(m.colors ?? []).map((c, ci) => (
                  <span key={ci} className="motion-sw">
                    <SwatchButton label={`Cor ${ci + 1} da paleta`} value={c} onChange={(v) => set(i, { colors: (m.colors ?? []).map((x, k) => (k === ci ? v : x)) }, `pal${ci}`)} />
                    {(m.colors ?? []).length > 2 && (
                      <button type="button" className="motion-sw-x" aria-label={`Tirar cor ${ci + 1}`} onClick={() => set(i, { colors: (m.colors ?? []).filter((_, k) => k !== ci) })}>
                        <LuX />
                      </button>
                    )}
                  </span>
                ))}
                {(m.colors ?? []).length < 6 && <IconButton label="Adicionar cor à paleta" icon={<LuPlus />} size="sm" onClick={() => set(i, { colors: [...(m.colors ?? []), '#ffffff'] })} />}
              </div>
            </div>
          )}
        </div>
      ))}
      {avail.length > 0 && (
        <Menu
          width={260}
          items={avail.map((k) => ({
            label: MOTION_LABEL[k],
            desc: MOTION_HINT[k],
            onClick: () => onChange([...list, { kind: k, amount: 50, cycles: 1, ...(k === 'colors' ? { colors: paletteFrom(layer) } : {}) }]),
          }))}
          trigger={(open, toggle) => (
            <Button size="sm" icon={<LuPlus />} onClick={toggle} aria-expanded={open}>
              Adicionar movimento
            </Button>
          )}
        />
      )}
    </div>
  );
}

/** Paleta inicial do ciclo de cores: as cores da própria camada + um tom vizinho. */
function paletteFrom(l: DesignLayer): string[] {
  const own = l.fill.stops.map((s) => s.color);
  const extra = ['#f97316', '#a78bfa', '#38bdf8', '#f43f5e'];
  const out = [...new Set([...own, ...extra])];
  return out.slice(0, Math.max(3, Math.min(4, own.length + 1)));
}
