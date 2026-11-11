import { useEffect } from 'react';
import { readSetting, useSetting } from '../core/settings';

/**
 * Tema da interface (claro/escuro). A escolha fica salva no navegador (`cs:theme`) e vale em todas as janelas
 * abertas (biblioteca, editor, operador): o evento `storage` leva a troca de uma janela para as outras.
 * Sem escolha salva, segue o sistema operacional.
 */
export type ThemeMode = 'light' | 'dark';

const KEY = 'theme';
const BAR: Record<ThemeMode, string> = { light: '#e9ebee', dark: '#141517' };

const systemTheme = (): ThemeMode => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function savedTheme(): ThemeMode {
  const v = readSetting<ThemeMode | null>(KEY, null);
  return v === 'light' || v === 'dark' ? v : systemTheme();
}

/** Aplica no documento. `animate` liga por um instante a transição suave de cores (só na interface, nunca no slide). */
export function applyTheme(mode: ThemeMode, animate = false) {
  const root = document.documentElement;
  if (root.dataset.theme === mode) return;
  if (animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 320);
  }
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[mode]);
}

/** Tema atual + troca. Mantém o documento em dia quando outra janela troca o tema. */
export function useThemeMode(): [ThemeMode, () => void] {
  const [stored, setStored] = useSetting<ThemeMode | null>(KEY, null);
  const mode: ThemeMode = stored === 'light' || stored === 'dark' ? stored : systemTheme();
  useEffect(() => applyTheme(mode, true), [mode]);
  return [mode, () => setStored(mode === 'dark' ? 'light' : 'dark')];
}
