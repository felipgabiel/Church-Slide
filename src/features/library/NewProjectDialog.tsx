import { useMemo, useState } from 'react';
import { defaultTheme, newSlide } from '../../core/defaults';
import { splitLyrics, SPLIT_MODE_LABELS } from '../../core/split';
import { createProject, listProjects, saveProject } from '../../core/storage/projects';
import { findDuplicate, numberedName } from '../../core/duplicates';
import { THEME_PRESETS } from '../../core/themes';
import { applyImpactToLayer, DEFAULT_IMPACT } from '../../core/impact';
import type { Aspect, Project, SplitMode, Theme } from '../../core/types';
import { SlideThumb } from '../../render/SlideThumb';
import { Button } from '../../ui/Button';
import { Segmented, Select } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { confirmDialog, toastError } from '../../ui/toast';
import { tr } from '../../core/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: string[];
  templates: Project[];
  onCreated: (p: Project) => void;
  /** categoria pré-selecionada (filtro atual da biblioteca) */
  defaultCategory?: string;
  /** visual pré-selecionado (ex.: `tpl:<id>` ao usar um modelo) */
  initialThemeId?: string;
}

interface ThemeChoice {
  id: string;
  name: string;
  theme: Theme;
  aspect?: Aspect;
  custom?: boolean;
  autoLayout?: 'impact';
}

const ASPECTS: Aspect[] = ['16:9', '16:10', '4:3', '21:9'];

export function NewProjectDialog({ open, onClose, categories, templates, onCreated, defaultCategory = '', initialThemeId = 'default' }: Props) {
  const [name, setName] = useState('');
  const [artist, setArtist] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [aspect, setAspect] = useState<Aspect>('16:9');
  const [themeId, setThemeId] = useState(initialThemeId);
  const [lyrics, setLyrics] = useState('');
  const [mode, setMode] = useState<SplitMode>('stanza');
  const [busy, setBusy] = useState(false);

  const choices = useMemo<ThemeChoice[]>(
    () => [
      { id: 'default', name: tr('Simples'), theme: defaultTheme() },
      ...THEME_PRESETS.map((t) => ({ id: t.id, name: t.name, theme: t.theme, autoLayout: t.autoLayout })),
      ...templates.map((t) => ({ id: `tpl:${t.id}`, name: t.name, theme: t.theme, aspect: t.aspect, custom: true })),
    ],
    [templates],
  );
  const chosen = choices.find((c) => c.id === themeId) ?? choices[0];
  const parts = useMemo(() => (lyrics.trim() ? splitLyrics(lyrics, { mode }).length : 0), [lyrics, mode]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // mesmo nome e mesmo autor de um louvor que já existe: avisa; seguindo, o novo ganha um número
      let finalName = name.trim() || tr('Novo louvor');
      const all = await listProjects();
      const dup = findDuplicate(all, finalName, artist);
      if (dup) {
        const numbered = numberedName(finalName, all.filter((x) => !x.isTemplate && !x.deletedAt).map((x) => x.name));
        // sem nome digitado não há o que avisar: o "Novo louvor" só ganha o número
        const ok = !name.trim() || (await confirmDialog({
          title: tr('Este louvor já existe'),
          message: dup.artist
            ? tr('Você já tem “{0}” de {1}. Criar mesmo assim? O novo vai se chamar “{2}” (dá para renomear depois).', dup.name, dup.artist, numbered)
            : tr('Você já tem “{0}”. Criar mesmo assim? O novo vai se chamar “{1}” (dá para renomear depois).', dup.name, numbered),
          confirmLabel: tr('Criar “{0}”', numbered),
        }));
        if (!ok) return;
        finalName = numbered;
      }
      let p = await createProject(finalName, { theme: chosen.theme, aspect: chosen.aspect ?? aspect, category: category.trim(), artist: artist.trim() });
      if (lyrics.trim()) {
        const slides = splitLyrics(lyrics, { mode }).map((x) => newSlide(x.text, p.theme, x.label));
        if (chosen.autoLayout === 'impact') for (const sl of slides) for (const l of sl.layers) if (l.role === 'lyrics') applyImpactToLayer(l, DEFAULT_IMPACT);
        if (slides.length) p = await saveProject({ ...p, slides, lyrics, splitMode: mode, autoLayout: chosen.autoLayout });
      } else if (chosen.autoLayout) {
        p = await saveProject({ ...p, autoLayout: chosen.autoLayout });
      }
      onCreated(p);
    } catch (err) {
      console.error(err);
      toastError(tr('Não foi possível criar o projeto. Verifique o espaço disponível no navegador.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('Novo louvor')}
      description={tr('Escolha um visual de partida. Tudo pode ser mudado depois, trecho por trecho.')}
      width={760}
      footer={
        <>
          <span className="np-count">{parts ? tr('{0} {1} serão criados', parts, parts === 1 ? tr('trecho') : tr('trechos')) : tr('Você pode colar a letra agora ou depois.')}</span>
          <Button onClick={onClose}>{tr('Cancelar')}</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? tr('Criando…') : tr('Criar e abrir')}
          </Button>
        </>
      }
    >
      <form
        className="np"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="np-col">
          <div className="field">
            <label className="field-label" htmlFor="np-name">
              {tr('Nome do louvor')}
            </label>
            <input id="np-name" className="input" autoFocus value={name} placeholder={tr('Ex.: Grande é o Senhor')} onChange={(e) => setName(e.currentTarget.value)} />
          </div>
          <div className="np-two">
            <div className="field">
              <label className="field-label" htmlFor="np-artist">
                {tr('Artista ou ministério')}
              </label>
              <input id="np-artist" className="input" value={artist} placeholder={tr('Ex.: Ministério Jovem')} onChange={(e) => setArtist(e.currentTarget.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="np-cat">
                {tr('Categoria')}
              </label>
              <input id="np-cat" className="input" list="np-cats" value={category} placeholder={tr('Ex.: Adoração')} onChange={(e) => setCategory(e.currentTarget.value)} />
              <datalist id="np-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="field">
            <span className="field-label">{tr('Proporção da tela')}</span>
            <Segmented
              label={tr('Proporção')}
              value={chosen.aspect ?? aspect}
              onChange={setAspect}
              options={ASPECTS.map((a) => ({ value: a, label: a, title: tr('Proporção {0}', a) }))}
            />
            {chosen.aspect && <p className="field-hint">{tr('O modelo escolhido usa')}{' '}{chosen.aspect}.</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="np-lyrics">
              {tr('Letra (opcional)')}
            </label>
            <textarea id="np-lyrics" className="textarea" rows={7} value={lyrics} placeholder={tr('Cole a letra completa aqui.\nUma linha em branco separa as estrofes.')} onChange={(e) => setLyrics(e.currentTarget.value)} />
            <div className="np-split">
              <Select value={mode} onChange={(v) => setMode(v as SplitMode)} label={tr('Como dividir a letra')}>
                {(Object.keys(SPLIT_MODE_LABELS) as SplitMode[]).map((m) => (
                  <option key={m} value={m}>
                    {SPLIT_MODE_LABELS[m].title}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="np-col">
          <span className="field-label">{tr('Visual')}</span>
          <div className="np-themes" role="radiogroup" aria-label={tr('Visual de partida')}>
            {choices.map((c) => {
              const slide = newSlide(tr('Santo, santo, santo\nÉ o Senhor'), c.theme);
              return (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === chosen.id} data-on={c.id === chosen.id ? '1' : '0'} className="np-theme" onClick={() => setThemeId(c.id)}>
                  <SlideThumb slide={slide} theme={c.theme} aspect={c.aspect ?? aspect} />
                  <span>
                    {c.name}
                    {c.custom && <small>{tr('seu modelo')}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
