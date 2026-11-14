import { getPreset } from '../../../core/anim/presets';
import { totalDuration } from '../../../core/anim/engine';
import { resolveAnimation, slideText } from '../../../core/defaults';
import { tr } from '../../../core/i18n';
import { editor, useActiveSlide, useEditor } from '../../../store/editor';
import { Slider } from '../../../ui/Controls';
import { useDebouncedReplay } from '../hooks';

/**
 * Duração do estilo de animação escolhido, em segundos, logo abaixo da escolha do estilo.
 * Muda `duration` (o tempo de cada parte entrar); com várias partes (linhas/palavras) o total aparece embaixo.
 * Duplo clique no rótulo volta à duração original do estilo.
 */
export function AnimDuration() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const replay = useDebouncedReplay();
  const cfg = resolveAnimation(slide, theme);
  const preset = getPreset(cfg.preset);
  const none = cfg.preset === 'none';
  const sec = Math.round(cfg.duration / 100) / 10;
  const original = (preset?.config.duration ?? 800) / 1000;
  // quantas partes entram (para mostrar o total quando há intervalo entre linhas/palavras)
  const text = slide ? slideText(slide).trim() : '';
  const parts = cfg.unit === 'block' ? 1 : cfg.unit === 'line' ? text.split('\n').filter((l) => l.trim()).length : text.split(/\s+/).filter(Boolean).length;
  const total = totalDuration(cfg, 'enter', Math.max(1, parts)) / 1000;
  return (
    <div className="anim-dur">
      <Slider
        label={tr('Duração da animação')}
        value={none ? 0 : sec}
        min={0.1}
        max={6}
        step={0.1}
        unit=" s"
        reset={original}
        disabled={none}
        onChange={(v) => {
          editor.patchAnimation({ duration: Math.round(v * 1000) });
          replay();
        }}
      />
      {!none && parts > 1 && cfg.stagger > 0 && Math.abs(total - sec) > 0.05 && (
        <p className="field-hint">{tr('Com {0} partes entrando uma depois da outra, o trecho leva {1} s para aparecer inteiro.', parts, total.toFixed(1))}</p>
      )}
    </div>
  );
}
