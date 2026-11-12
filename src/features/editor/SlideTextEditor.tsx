import { useRef } from 'react';
import { LuMerge, LuScissors } from 'react-icons/lu';
import { editor, useActiveLayer, useActiveSlide, useEditor } from '../../store/editor';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/toast';
import { LANG, tr } from '../../core/i18n';

const LABELS = [tr('Verso 1'), tr('Verso 2'), tr('Verso 3'), tr('Pré-refrão'), tr('Refrão'), tr('Ponte'), tr('Final'), tr('Intro')];

/** Texto, rótulo, duração e anotações do trecho selecionado. */
export function SlideTextEditor() {
  const slide = useActiveSlide();
  const layer = useActiveLayer();
  const index = useEditor((s) => s.project!.slides.findIndex((x) => x.id === s.slideId));
  const count = useEditor((s) => s.project!.slides.length);
  const area = useRef<HTMLTextAreaElement>(null);

  if (!slide || !layer) return null;

  const split = () => {
    const pos = area.current?.selectionStart ?? 0;
    if (!editor.splitSlideAt(slide.id, layer.id, pos)) toast(tr('Coloque o cursor no meio do texto para dividir o trecho.'), 'info');
  };

  return (
    <section className="te" aria-label={tr('Texto do trecho')}>
      <header className="te-head">
        <h2>
          {tr('Trecho')}{' '}{index + 1} <small>· {layer.name}</small>
        </h2>
        <div className="te-actions">
          <Button size="sm" variant="ghost" icon={<LuScissors />} onClick={split} title={tr('Divide o texto na posição do cursor em dois trechos')}>
            {tr('Dividir no cursor')}
          </Button>
          <Button size="sm" variant="ghost" icon={<LuMerge />} onClick={() => editor.mergeWithNext(slide.id)} disabled={index >= count - 1} title={tr('Junta com o trecho seguinte')}>
            {tr('Mesclar com o próximo')}
          </Button>
        </div>
      </header>

      <textarea
        ref={area}
        className="textarea te-area"
        rows={4}
        spellCheck
        lang={LANG}
        aria-label={tr('Texto da camada {0}', layer.name)}
        value={layer.text}
        placeholder={tr('Digite ou cole o texto deste trecho')}
        onChange={(e) => editor.setLayerText(slide.id, layer.id, e.currentTarget.value)}
      />

      <div className="te-meta">
        <label>
          <span>{tr('Rótulo')}</span>
          <input className="input" list="te-labels" value={slide.label} placeholder={tr('Ex.: Refrão')} onChange={(e) => editor.setSlideMeta(slide.id, { label: e.currentTarget.value })} />
          <datalist id="te-labels">
            {LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label className="te-dur">
          <span>{tr('Avanço automático')}</span>
          <span className="te-dur-in">
            <input
              className="input"
              type="number"
              min={0}
              max={600}
              step={1}
              value={slide.duration ?? ''}
              placeholder={tr('manual')}
              onChange={(e) => {
                const n = parseFloat(e.currentTarget.value);
                editor.setSlideMeta(slide.id, { duration: Number.isFinite(n) && n > 0 ? n : null });
              }}
            />
            <em>s</em>
          </span>
        </label>
        <label className="te-notes">
          <span>{tr('Anotações do operador')}</span>
          <input className="input" value={slide.notes} placeholder={tr('Só aparecem para quem controla a apresentação')} onChange={(e) => editor.setSlideMeta(slide.id, { notes: e.currentTarget.value })} />
        </label>
      </div>
    </section>
  );
}
