import { LuMagnet } from 'react-icons/lu';
import { SNAP_SETTING } from '../core/snap';
import { useSetting } from '../core/settings';
import { Switch } from './Controls';

/**
 * Liga/desliga o alinhamento magnético (bordas, margem segura e centro) no editor e no Estúdio.
 * É uma preferência só: desligar num lugar desliga no outro.
 */
export function SnapToggle({ className = '' }: { className?: string }) {
  const [on, setOn] = useSetting<boolean>(SNAP_SETTING, true);
  return (
    <span className={`snap-toggle ${className}`} title={on ? 'Ímã ligado: encosta nas bordas, na margem segura e no centro. Segure Alt para soltar na hora.' : 'Ímã desligado: movimento livre'}>
      <LuMagnet aria-hidden />
      <span>Ímã</span>
      <Switch checked={on} onChange={setOn} label="Alinhamento magnético (ímã)" />
    </span>
  );
}
