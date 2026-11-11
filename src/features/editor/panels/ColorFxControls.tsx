import { DEFAULT_COLOR_FX } from '../../../core/anim/colorfx';
import type { ColorFx, ColorMode } from '../../../core/types';
import { ColorField, Row, Segmented, Slider, Switch } from '../../../ui/Controls';

interface Props {
  value: ColorFx | null | undefined;
  onChange: (fx: ColorFx | null) => void;
  /** texto da chave "ligar" */
  switchLabel: string;
  /** cor que o texto tem agora (para sugerir a de partida) */
  current?: string;
  /** numa palavra avulsa não faz sentido "por palavra": só inteira ou letra por letra */
  single?: boolean;
}

/**
 * Controles da troca de cor: a letra entra com a animação escolhida e, DEPOIS, a cor vai mudando.
 * Usado no trecho inteiro (painel Animação) e em palavras avulsas (painel Palavras).
 */
export function ColorFxControls({ value, onChange, switchLabel, current, single }: Props) {
  const fx = value ?? null;
  const set = (patch: Partial<ColorFx>) => fx && onChange({ ...fx, ...patch });
  return (
    <>
      <Row label={switchLabel}>
        <Switch checked={!!fx} onChange={(v) => onChange(v ? { ...DEFAULT_COLOR_FX } : null)} label={switchLabel} />
      </Row>
      {fx && (
        <>
          <Row label="Muda para">
            <ColorField label="Cor final" value={fx.to} onChange={(to) => set({ to })} />
          </Row>
          <Row label="Começa em" hint="De que cor parte">
            <Segmented<'now' | 'pick'>
              size="sm"
              label="Cor de partida"
              value={fx.from ? 'pick' : 'now'}
              onChange={(v) => (v === 'now' ? onChange({ to: fx.to, mode: fx.mode, delay: fx.delay, duration: fx.duration, stagger: fx.stagger, ...(fx.back ? { back: true } : {}) }) : set({ from: current && /^#[0-9a-f]{6}$/i.test(current) ? current : '#ffffff' }))}
              options={[
                { value: 'now', label: 'A do texto' },
                { value: 'pick', label: 'Escolher' },
              ]}
            />
          </Row>
          {fx.from && (
            <Row label="Cor inicial">
              <ColorField label="Cor inicial" value={fx.from} onChange={(from) => set({ from })} />
            </Row>
          )}
          <Row label="Como muda">
            <Segmented<ColorMode>
              size="sm"
              label="Como a cor muda"
              value={fx.mode}
              onChange={(mode) => set({ mode, stagger: mode === 'all' ? 0 : fx.stagger || (mode === 'letter' ? 55 : 260) })}
              options={
                single
                  ? [
                      { value: 'all', label: 'Palavra toda' },
                      { value: 'letter', label: 'Letra por letra' },
                    ]
                  : [
                      { value: 'all', label: 'Tudo junto' },
                      { value: 'word', label: 'Palavra' },
                      { value: 'letter', label: 'Letra' },
                    ]
              }
            />
          </Row>
          <Slider label="Espera depois da entrada" value={fx.delay} min={0} max={5000} step={50} unit="ms" reset={400} onChange={(delay) => set({ delay })} />
          <Slider label="Tempo para trocar" value={fx.duration} min={100} max={6000} step={50} unit="ms" reset={1400} onChange={(duration) => set({ duration })} />
          <Slider
            label={fx.mode === 'letter' ? 'Intervalo entre letras' : 'Intervalo entre palavras'}
            value={fx.stagger}
            min={0}
            max={800}
            step={5}
            unit="ms"
            reset={fx.mode === 'letter' ? 55 : 260}
            disabled={fx.mode === 'all'}
            onChange={(stagger) => set({ stagger })}
          />
          <Row label="Voltar à cor original" hint="Brilho que passa">
            <Switch checked={!!fx.back} onChange={(back) => (back ? set({ back: true }) : onChange({ ...fx, back: undefined }))} label="Voltar à cor original" />
          </Row>
        </>
      )}
    </>
  );
}
