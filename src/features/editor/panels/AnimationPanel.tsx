import { LuArrowDown, LuArrowLeft, LuArrowRight, LuArrowUp, LuRotateCcw, LuUndo2 } from 'react-icons/lu';
import { ANIMATION_PRESETS, PRESET_GROUPS, DEFAULT_STAGGER, DIRECTION_LABELS } from '../../../core/anim/presets';
import { EASING_LABELS } from '../../../core/anim/easing';
import { resolveAnimation } from '../../../core/defaults';
import type { AnimPhase, AnimUnit, AnimationConfig, Direction, EasingName } from '../../../core/types';
import { editor, useActiveSlide, useEditor } from '../../../store/editor';
import { Button } from '../../../ui/Button';
import { Row, Section, Segmented, Select, Slider, Switch } from '../../../ui/Controls';
import { useDebouncedReplay } from '../hooks';
import { ColorChange } from './ColorChange';
import { applyAnimationPreset } from '../applyPreset';
import { tr } from '../../../core/i18n';

const GROUPS = PRESET_GROUPS;

function PhaseControls({ title, value, onChange }: { title: string; value: AnimPhase; onChange: (p: Partial<AnimPhase>) => void }) {
  return (
    <Section title={title} defaultOpen={false}>
      <Row label={tr('Desvanecer (fade)')}>
        <Switch checked={value.fade} onChange={(v) => onChange({ fade: v })} label={tr('{0}: fade', title)} />
      </Row>
      <Row label={tr('Deslizar (slide)')}>
        <Switch checked={value.slide} onChange={(v) => onChange({ slide: v })} label={tr('{0}: slide', title)} />
      </Row>
      <Row label={tr('Desfocar (blur)')}>
        <Switch checked={value.blur} onChange={(v) => onChange({ blur: v })} label={tr('{0}: blur', title)} />
      </Row>
      <Row label={tr('Zoom')}>
        <Segmented<AnimPhase['zoom']>
          size="sm"
          label={tr('{0}: zoom', title)}
          value={value.zoom}
          onChange={(v) => onChange({ zoom: v })}
          options={[
            { value: 'none', label: tr('Nenhum') },
            { value: 'in', label: tr('Crescer') },
            { value: 'out', label: tr('Encolher') },
          ]}
        />
      </Row>
    </Section>
  );
}

export function AnimationPanel() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const scope = useEditor((s) => s.scope);
  const cfg = resolveAnimation(slide, theme);
  const replay = useDebouncedReplay();
  const own = !!slide?.animation && scope === 'slide';

  const set = (patch: Partial<AnimationConfig>) => {
    editor.patchAnimation(patch);
    replay();
  };
  const setPhase = (which: 'enter' | 'exit') => (p: Partial<AnimPhase>) => {
    editor.patchAnimation({ [which]: p });
    editor.replay();
  };

  const knownPreset = ANIMATION_PRESETS.some((p) => p.id === cfg.preset);

  return (
    <div className="props">
      {own && (
        <div className="notice">
          <span>{tr('Este trecho tem uma animação própria.')}</span>
          <Button size="sm" variant="ghost" icon={<LuUndo2 />} onClick={() => editor.clearOverride('animation')}>
            {tr('Usar a do tema')}
          </Button>
        </div>
      )}

      <Section title={tr('Predefinição')}>
        <Row label={tr('Estilo')}>
          <Select
            value={knownPreset ? cfg.preset : 'custom'}
            onChange={(v) => {
              if (v !== 'custom') applyAnimationPreset(v);
            }}
            label={tr('Predefinição de animação')}
          >
            {!knownPreset && <option value="custom">{tr('Personalizada')}</option>}
            {GROUPS.map((g) => (
              <optgroup key={g} label={tr(g)}>
                {ANIMATION_PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Row>
        <Button size="sm" icon={<LuRotateCcw />} className="props-upload" onClick={() => editor.replay()}>
          {tr('Ver animação')}
        </Button>
      </Section>

      <Section title={tr('Troca de cor')}>
        <ColorChange />
      </Section>

      <Section title={tr('Animar por')}>
        <Segmented<AnimUnit>
          size="sm"
          label={tr('Unidade da animação')}
          value={cfg.unit}
          onChange={(v) => set(v !== 'block' && cfg.stagger <= 0 ? { unit: v, stagger: DEFAULT_STAGGER[v] } : { unit: v })}
          options={[
            { value: 'block', label: tr('Frase toda'), title: tr('O trecho inteiro entra de uma vez') },
            { value: 'line', label: tr('Linha') },
            { value: 'word', label: tr('Palavra') },
          ]}
        />
        <Row label={tr('Direção')}>
          <Segmented<Direction>
            size="sm"
            label={tr('Direção do movimento')}
            value={cfg.direction}
            onChange={(v) => set({ direction: v })}
            options={[
              { value: 'up', icon: <LuArrowUp />, title: DIRECTION_LABELS.up },
              { value: 'down', icon: <LuArrowDown />, title: DIRECTION_LABELS.down },
              { value: 'left', icon: <LuArrowLeft />, title: DIRECTION_LABELS.left },
              { value: 'right', icon: <LuArrowRight />, title: DIRECTION_LABELS.right },
            ]}
          />
        </Row>
      </Section>

      <PhaseControls title={tr('Entrada')} value={cfg.enter} onChange={setPhase('enter')} />
      <PhaseControls title={tr('Saída')} value={cfg.exit} onChange={setPhase('exit')} />

      <Section title={tr('Tempo e curva')} defaultOpen={false}>
        <Slider label={tr('Duração')} value={cfg.duration} min={100} max={3000} step={50} unit="ms" reset={800} onChange={(v) => set({ duration: v })} />
        <Slider label={tr('Velocidade')} value={cfg.speed} min={0.25} max={3} step={0.05} unit="×" reset={1} onChange={(v) => set({ speed: v })} />
        <Slider label={tr('Atraso')} value={cfg.delay} min={0} max={3000} step={50} unit="ms" reset={0} onChange={(v) => set({ delay: v })} />
        <Slider label={tr('Intervalo entre partes')} value={cfg.stagger} min={0} max={600} step={10} unit="ms" reset={110} onChange={(v) => set({ stagger: v })} disabled={cfg.unit === 'block'} />
        <Slider label={tr('Intensidade')} value={cfg.intensity} min={0} max={100} unit="%" reset={50} onChange={(v) => set({ intensity: v })} />
        <Row label={tr('Curva de movimento')}>
          <Select value={cfg.easing} onChange={(v) => set({ easing: v as EasingName })} label={tr('Curva de movimento')}>
            {(Object.keys(EASING_LABELS) as EasingName[]).map((k) => (
              <option key={k} value={k}>
                {EASING_LABELS[k]}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      <Section title={tr('Motion Blur')} defaultOpen={false} hint={tr('O borrão acompanha a velocidade real do movimento: mais forte quando o texto corre, some quando ele para. Vale para deslizes e zooms.')}>
        <Slider label={tr('Intensidade do Motion Blur')} value={cfg.motionBlur} min={0} max={100} unit="%" reset={35} onChange={(v) => set({ motionBlur: v })} />
        <Slider label={tr('Flutuação contínua')} value={cfg.float} min={0} max={100} unit="%" reset={0} onChange={(v) => set({ float: v })} />
      </Section>
    </div>
  );
}
