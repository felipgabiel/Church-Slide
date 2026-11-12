import { useEffect, useRef, useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { applyTheme, savedTheme, type ThemeMode } from '../../app/theme';
import { LANG, LANGS, langChosen, saveLang, type Lang } from '../../core/i18n';
import { writeSetting } from '../../core/settings';
import { LogoMark } from '../../ui/Logo';

/**
 * Primeiro acesso: idioma e aparência. Os textos desta tela ficam aqui nos três idiomas para trocarem na hora
 * em que a pessoa escolhe (o resto do site troca ao recarregar).
 */
const COPY: Record<Lang, { hello: string; lead: string; lang: string; look: string; light: string; dark: string; lightHint: string; darkHint: string; go: string; later: string }> = {
  'pt-BR': {
    hello: 'Bem-vindo ao Church Slide',
    lead: 'Escolha o idioma e a aparência do site. Dá para mudar os dois depois.',
    lang: 'Idioma',
    look: 'Aparência',
    light: 'Claro',
    dark: 'Escuro',
    lightHint: 'Bom em salas iluminadas',
    darkHint: 'Descansa a vista no culto',
    go: 'Começar',
    later: 'O telão é sempre escuro, nos dois.',
  },
  en: {
    hello: 'Welcome to Church Slide',
    lead: 'Choose the language and look of the site. You can change both later.',
    lang: 'Language',
    look: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    lightHint: 'Good in bright rooms',
    darkHint: 'Easy on the eyes during service',
    go: 'Get started',
    later: 'The projector screen is always dark, in both.',
  },
  es: {
    hello: 'Bienvenido a Church Slide',
    lead: 'Elige el idioma y la apariencia del sitio. Puedes cambiar ambos después.',
    lang: 'Idioma',
    look: 'Apariencia',
    light: 'Claro',
    dark: 'Oscuro',
    lightHint: 'Bueno en salas iluminadas',
    darkHint: 'Descansa la vista en el culto',
    go: 'Empezar',
    later: 'La pantalla del proyector siempre es oscura, en ambos.',
  },
};

/** Miniatura da interface no tema escolhido: barra lateral, lista e um slide (sempre escuro). */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  return (
    <span className="wl-prev" data-mode={mode} aria-hidden>
      <span className="wl-prev-side">
        <i />
        <i />
        <i />
      </span>
      <span className="wl-prev-main">
        <span className="wl-prev-bar" />
        <span className="wl-prev-slide">
          <i />
          <i />
        </span>
        <span className="wl-prev-rows">
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

export function Welcome() {
  const [open, setOpen] = useState(() => !langChosen());
  const [lang, setLangChoice] = useState<Lang>(LANG);
  const [mode, setMode] = useState<ThemeMode>(savedTheme());
  const ref = useRef<HTMLDialogElement>(null);
  const c = COPY[lang];

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  // a aparência muda na hora, para a pessoa ver como fica
  useEffect(() => {
    if (open) applyTheme(mode, true);
  }, [mode, open]);

  if (!open) return null;

  const finish = () => {
    writeSetting('theme', mode);
    saveLang(lang);
    if (lang !== LANG) {
      location.reload();
      return;
    }
    ref.current?.close();
    setOpen(false);
  };

  return (
    <dialog
      ref={ref}
      className="modal wl"
      lang={lang}
      aria-labelledby="wl-title"
      onCancel={(e: { preventDefault(): void }) => {
        // Esc também confirma o que está marcado: a tela não volta a aparecer
        e.preventDefault();
        finish();
      }}
    >
      <div className="wl-box">
        <header className="wl-head">
          <LogoMark size={34} />
          <h2 id="wl-title">{c.hello}</h2>
          <p>{c.lead}</p>
        </header>

        <section className="wl-sec" aria-labelledby="wl-lang">
          <h3 id="wl-lang">{c.lang}</h3>
          <div className="wl-langs" role="radiogroup" aria-labelledby="wl-lang">
            {LANGS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className="wl-lang" data-on={lang === l.id ? '1' : undefined} lang={l.id} onClick={() => setLangChoice(l.id)}>
                <b>{l.label}</b>
                <small>{l.id === 'pt-BR' ? 'Olá! · Brasil' : l.id === 'en' ? 'Hello!' : '¡Hola!'}</small>
                {lang === l.id && <LuCheck className="wl-check" aria-hidden />}
              </button>
            ))}
          </div>
        </section>

        <section className="wl-sec" aria-labelledby="wl-look">
          <h3 id="wl-look">{c.look}</h3>
          <div className="wl-themes" role="radiogroup" aria-labelledby="wl-look">
            {(['light', 'dark'] as ThemeMode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className="wl-theme" data-on={mode === m ? '1' : undefined} onClick={() => setMode(m)}>
                <ThemePreview mode={m} />
                <span className="wl-theme-txt">
                  <b>{m === 'light' ? c.light : c.dark}</b>
                  <small>{m === 'light' ? c.lightHint : c.darkHint}</small>
                </span>
                {mode === m && <LuCheck className="wl-check" aria-hidden />}
              </button>
            ))}
          </div>
          <p className="wl-note">{c.later}</p>
        </section>

        <footer className="wl-foot">
          <button type="button" className="btn btn-primary btn-lg" onClick={finish} autoFocus>
            {c.go}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
