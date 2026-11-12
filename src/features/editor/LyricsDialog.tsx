import { useMemo, useRef, useState } from 'react';
import { LuFileText } from 'react-icons/lu';
import { slideText } from '../../core/defaults';
import { slidesToLyrics, splitLyrics, SPLIT_MODE_LABELS } from '../../core/split';
import type { SplitMode } from '../../core/types';
import { editor, editorStore } from '../../store/editor';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { confirmDialog, toast, toastError } from '../../ui/toast';
import { tr } from '../../core/i18n';

const MODES: SplitMode[] = ['stanza', 'pairs', 'line', 'manual'];

/** Colar/editar a letra completa e escolher como ela vira trechos. */
export function LyricsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={tr('Letra completa')} description={tr('Cole ou digite a letra inteira. O Church Slide divide em trechos para o telão e reconhece marcadores como [Refrão] ou [Verso 1].')} width={900}>
      {open && <LyricsForm onClose={onClose} />}
    </Modal>
  );
}

function LyricsForm({ onClose }: { onClose: () => void }) {
  const project = editorStore.get().project!;
  const hasText = project.slides.some((s) => slideText(s).trim());
  const [text, setText] = useState(() => (hasText ? slidesToLyrics(project.slides, project.splitMode) : ''));
  const [mode, setMode] = useState<SplitMode>(project.splitMode);
  const [maxLines, setMaxLines] = useState(4);
  const file = useRef<HTMLInputElement>(null);

  const parts = useMemo(() => (text.trim() ? splitLyrics(text, { mode, maxLines }) : []), [text, mode, maxLines]);

  const apply = async (how: 'replace' | 'append') => {
    if (!parts.length) return;
    if (how === 'replace' && hasText) {
      const ok = await confirmDialog({
        title: tr('Substituir todos os trechos?'),
        message: tr('Os trechos atuais serão recriados a partir desta letra. Fundos e animações definidos trecho a trecho serão perdidos (o tema do projeto continua). Você pode desfazer com Ctrl+Z.'),
        confirmLabel: tr('Substituir'),
      });
      if (!ok) return;
    }
    editor.applyLyrics(text, mode, how, maxLines);
    toast(`${parts.length} ${parts.length === 1 ? tr('trecho criado') : tr('trechos criados')}`);
    onClose();
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const t = await f.text();
      setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${t}` : t));
    } catch {
      toastError(tr('Não foi possível ler o arquivo.'));
    }
    if (file.current) file.current.value = '';
  };

  return (
    <div className="ly">
      <div className="ly-col">
        <div className="ly-tools">
          <input ref={file} type="file" accept=".txt,text/plain" hidden onChange={(e) => void readFile(e.currentTarget.files?.[0])} />
          <Button size="sm" icon={<LuFileText />} onClick={() => file.current?.click()}>
            {tr('Abrir arquivo .txt')}
          </Button>
          <span className="ly-hint">{text.trim() ? tr('{0} linhas', text.split('\n').length) : tr('Cole a letra aqui')}</span>
        </div>
        <textarea
          className="textarea ly-text"
          autoFocus
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder={tr('[Verso 1]\nSanto, santo, santo\nÉ o Senhor Deus Todo-Poderoso\n\n[Refrão]\nDigno é o Cordeiro\nQue foi morto por nós')}
        />
      </div>

      <div className="ly-col">
        <span className="field-label">{tr('Como dividir')}</span>
        <Segmented<SplitMode> label={tr('Modo de divisão')} size="sm" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: m === 'pairs' ? tr('2 linhas') : SPLIT_MODE_LABELS[m].title }))} />
        <p className="field-hint">{SPLIT_MODE_LABELS[mode].hint}</p>
        {mode === 'stanza' && (
          <label className="ly-max">
            <span>{tr('Máximo de linhas por trecho')}</span>
            <input type="number" min={1} max={12} className="input" value={maxLines} onChange={(e) => setMaxLines(Math.max(1, Math.min(12, Number(e.currentTarget.value) || 4)))} />
          </label>
        )}

        <span className="field-label ly-prev-title">{tr('Prévia ·')}{' '}{parts.length} {parts.length === 1 ? tr('trecho') : tr('trechos')}</span>
        <ol className="ly-prev">
          {parts.length === 0 && <li className="ly-none">{tr('Os trechos aparecem aqui conforme você digita.')}</li>}
          {parts.map((p, i) => (
            <li key={i}>
              <b>{i + 1}</b>
              <div>
                {p.label && <em>{p.label}</em>}
                <span>{p.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="ly-foot">
        <Button onClick={onClose}>{tr('Cancelar')}</Button>
        <Button onClick={() => void apply('append')} disabled={!parts.length}>
          {tr('Adicionar ao final')}
        </Button>
        <Button variant="primary" onClick={() => void apply('replace')} disabled={!parts.length}>
          {hasText ? tr('Substituir trechos') : tr('Criar trechos')}
        </Button>
      </div>
    </div>
  );
}
