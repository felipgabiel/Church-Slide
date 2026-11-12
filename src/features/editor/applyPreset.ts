import { getPreset } from '../../core/anim/presets';
import { editor } from '../../store/editor';
import { toast } from '../../ui/toast';
import { tr } from '../../core/i18n';

/** Aplica um estilo de animação e, se ele troca de cor, diz em quais palavras a troca foi parar. */
export function applyAnimationPreset(id: string) {
  const r = editor.setAnimationPreset(id);
  if (!getPreset(id)?.color) return;
  toast(
    r.onSelection
      ? tr('Troca de cor aplicada em {0}', r.colored === 1 ? tr('1 palavra marcada') : tr('{0} palavras marcadas', r.colored))
      : tr('Troca de cor aplicada em todas as palavras do trecho. Para usar só em algumas, marque-as no slide antes.'),
  );
}
