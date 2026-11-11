import { getPreset } from '../../core/anim/presets';
import { editor } from '../../store/editor';
import { toast } from '../../ui/toast';

/** Aplica um estilo de animação e, se ele troca de cor, diz em quais palavras a troca foi parar. */
export function applyAnimationPreset(id: string) {
  const r = editor.setAnimationPreset(id);
  if (!getPreset(id)?.color) return;
  toast(
    r.onSelection
      ? `Troca de cor aplicada em ${r.colored === 1 ? '1 palavra marcada' : `${r.colored} palavras marcadas`}`
      : 'Troca de cor aplicada em todas as palavras do trecho. Para usar só em algumas, marque-as no slide antes.',
  );
}
