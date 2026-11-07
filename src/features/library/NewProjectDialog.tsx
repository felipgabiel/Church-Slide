import { useMemo, useState } from 'react';
import { defaultTheme, newSlide } from '../../core/defaults';
import { splitLyrics, SPLIT_MODE_LABELS } from '../../core/split';
import { createProject, saveProject } from '../../core/storage/projects';
import { THEME_PRESETS } from '../../core/themes';
import type { Aspect, Project, SplitMode, Theme } from '../../core/types';
import { SlideThumb } from '../../render/SlideThumb';
import { Button } from '../../ui/Button';
import { Segmented, Select } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { toastError } from '../../ui/toast';

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
      { id: 'default', name: 'Simples', theme: defaultTheme() },
      ...THEME_PRESETS.map((t) => ({ id: t.id, name: t.name, theme: t.theme })),
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
      let p = await createProject(name.trim() || 'Novo louvor', { theme: chosen.theme, aspect: chosen.aspect ?? aspect, category: category.trim(), artist: artist.trim() });
      if (lyrics.trim()) {
        const slides = splitLyrics(lyrics, { mode }).map((x) => newSlide(x.text, p.theme, x.label));
        if (slides.length) p = await saveProject({ ...p, slides, lyrics, splitMode: mode });
      }
      onCreated(p);
    } catch (err) {
      console.error(err);
      toastError('Não foi possível criar o projeto. Verifique o espaço disponível no navegador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo louvor"
      description="Escolha um visual de partida. Tudo pode ser mudado depois, trecho por trecho."
      width={760}
      footer={
        <>
          <span className="np-count">{parts ? `${parts} ${parts === 1 ? 'trecho' : 'trechos'} serão criados` : 'Você pode colar a letra agora ou depois.'}</span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? 'Criando…' : 'Criar e abrir'}
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
              Nome do louvor
            </label>
            <input id="np-name" className="input" autoFocus value={name} placeholder="Ex.: Grande é o Senhor" onChange={(e) => setName(e.currentTarget.value)} />
          </div>
          <div className="np-two">
            <div className="field">
              <label className="field-label" htmlFor="np-artist">
                Artista ou ministério
              </label>
              <input id="np-artist" className="input" value={artist} placeholder="Ex.: Ministério Jovem" onChange={(e) => setArtist(e.currentTarget.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="np-cat">
                Categoria
              </label>
              <input id="np-cat" className="input" list="np-cats" value={category} placeholder="Ex.: Adoração" onChange={(e) => setCategory(e.currentTarget.value)} />
              <datalist id="np-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="field">
            <span className="field-label">Proporção da tela</span>
            <Segmented
              label="Proporção"
              value={chosen.aspect ?? aspect}
              onChange={setAspect}
              options={ASPECTS.map((a) => ({ value: a, label: a, title: `Proporção ${a}` }))}
            />
            {chosen.aspect && <p className="field-hint">O modelo escolhido usa {chosen.aspect}.</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="np-lyrics">
              Letra (opcional)
            </label>
            <textarea id="np-lyrics" className="textarea" rows={7} value={lyrics} placeholder={'Cole a letra completa aqui.\nUma linha em branco separa as estrofes.'} onChange={(e) => setLyrics(e.currentTarget.value)} />
            <div className="np-split">
              <Select value={mode} onChange={(v) => setMode(v as SplitMode)} label="Como dividir a letra">
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
          <span className="field-label">Visual</span>
          <div className="np-themes" role="radiogroup" aria-label="Visual de partida">
            {choices.map((c) => {
              const slide = newSlide('Santo, santo, santo\nÉ o Senhor', c.theme);
              return (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === chosen.id} data-on={c.id === chosen.id ? '1' : '0'} className="np-theme" onClick={() => setThemeId(c.id)}>
                  <SlideThumb slide={slide} theme={c.theme} aspect={c.aspect ?? aspect} />
                  <span>
                    {c.name}
                    {c.custom && <small>seu modelo</small>}
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
