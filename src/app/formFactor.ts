import { useEffect, useState } from 'react';
import { readSetting, useSetting } from '../core/settings';

/**
 * Celular ou computador. Automático pelo tamanho da tela (celular em pé, ou deitado com tela de toque baixa);
 * a pessoa pode fixar um dos dois em Configurações. Fica em `<html data-form="phone|desktop">` para o CSS
 * e em `useFormFactor()` para as telas que mudam de estrutura (editor, estúdio, operador).
 */
export type Form = 'phone' | 'desktop';
export type LayoutChoice = 'auto' | 'phone' | 'desktop';
export const LAYOUT_SETTING = 'layout';

const QUERY = '(max-width: 860px), (max-height: 520px) and (pointer: coarse)';

function mq(): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
}

export function detectForm(choice: LayoutChoice = readSetting<LayoutChoice>(LAYOUT_SETTING, 'auto')): Form {
  if (choice === 'phone' || choice === 'desktop') return choice;
  return mq()?.matches ? 'phone' : 'desktop';
}

export function applyForm(form: Form) {
  document.documentElement.dataset.form = form;
}

export function useFormFactor(): Form {
  const [choice] = useSetting<LayoutChoice>(LAYOUT_SETTING, 'auto');
  const [form, setForm] = useState<Form>(() => detectForm(choice));
  useEffect(() => {
    const update = () => setForm(detectForm(choice));
    update();
    const m = mq();
    m?.addEventListener('change', update);
    return () => m?.removeEventListener('change', update);
  }, [choice]);
  useEffect(() => applyForm(form), [form]);
  return form;
}
