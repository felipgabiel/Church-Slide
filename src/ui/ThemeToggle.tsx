import { LuMoon, LuSun } from 'react-icons/lu';
import { useThemeMode } from '../app/theme';
import { IconButton } from './Button';
import { tr } from '../core/i18n';

/** Botão de tema: mostra o tema para o qual vai trocar. */
export function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  return <IconButton label={mode === 'dark' ? tr('Usar tema claro') : tr('Usar tema escuro')} icon={mode === 'dark' ? <LuSun /> : <LuMoon />} onClick={toggle} />;
}
