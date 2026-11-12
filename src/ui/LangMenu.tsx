import { LuLanguages } from 'react-icons/lu';
import { LANG, LANGS, setLang, tr } from '../core/i18n';
import { Menu } from './Menu';

/** Botão de idioma: a troca recarrega a página para todos os textos virem no idioma novo. */
export function LangMenu() {
  return (
    <Menu
      align="end"
      width={210}
      items={LANGS.map((l) => ({ label: l.label, hint: l.id === 'pt-BR' ? 'BR' : l.id.toUpperCase(), checked: l.id === LANG, onClick: () => l.id !== LANG && setLang(l.id) }))}
      trigger={(open, toggle) => (
        <button type="button" className="ibtn ibtn-md" data-active={open ? '1' : undefined} aria-label={tr('Idioma')} title={tr('Idioma')} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <LuLanguages />
        </button>
      )}
    />
  );
}
