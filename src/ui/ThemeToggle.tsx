import { LuMoon, LuSun } from 'react-icons/lu';
import { useThemeMode } from '../app/theme';
import { IconButton } from './Button';

/** Botão de tema: mostra o tema para o qual vai trocar. */
export function ThemeToggle() {
  const [mode, toggle] = useThemeMode();
  const next = mode === 'dark' ? 'claro' : 'escuro';
  return <IconButton label={`Usar tema ${next}`} icon={mode === 'dark' ? <LuSun /> : <LuMoon />} onClick={toggle} />;
}
