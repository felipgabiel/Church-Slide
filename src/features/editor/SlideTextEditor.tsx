import { useRef } from 'react';
import { LuMerge, LuScissors } from 'react-icons/lu';
import { editor, useActiveLayer, useActiveSlide, useEditor } from '../../store/editor';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/toast';

const LABELS = ['Verso 1', 'Verso 2', 'Verso 3', 'Pré-refrão', 'Refrão', 'Ponte', 'Final', 'Intro'];

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
    if (!editor.splitSlideAt(slide.id, layer.id, pos)) toast('Coloque o cursor no meio do texto para dividir o trecho.', 'info');
  };

  return (
    <section className="te" aria-label="Texto do trecho">
      <header className="te-head">
        <h2>
          Trecho {index + 1} <small>· {layer.name}</small>
        </h2>
        <div className="te-actions">
          <Button size="sm" variant="ghost" icon={<LuScissors />} onClick={split} title="Divide o texto na posição do cursor em dois trechos">
            Dividir no cursor
          </Button>
          <Button size="sm" variant="ghost" icon={<LuMerge />} onClick={() => editor.mergeWithNext(slide.id)} disabled={index >= count - 1} title="Junta com o trecho seguinte">
            Mesclar com o próximo
          </Button>
        </div>
      </header>

      <textarea
        ref={area}
        className="textarea te-area"
        rows={4}
        spellCheck
        lang="pt-BR"
        aria-label={`Texto da camada ${layer.name}`}
        value={layer.text}
        placeholder="Digite ou cole o texto deste trecho"
        onChange={(e) => editor.setLayerText(slide.id, layer.id, e.currentTarget.value)}
      />

      <div className="te-meta">
        <label>
          <span>Rótulo</span>
          <input className="input" list="te-labels" value={slide.label} placeholder="Ex.: Refrão" onChange={(e) => editor.setSlideMeta(slide.id, { label: e.currentTarget.value })} />
          <datalist id="te-labels">
            {LABELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label className="te-dur">
          <span>Avanço automático</span>
          <span className="te-dur-in">
            <input
              className="input"
              type="number"
              min={0}
              max={600}
              step={1}
              value={slide.duration ?? ''}
              placeholder="manual"
              onChange={(e) => {
                const n = parseFloat(e.currentTarget.value);
                editor.setSlideMeta(slide.id, { duration: Number.isFinite(n) && n > 0 ? n : null });
              }}
            />
            <em>s</em>
          </span>
        </label>
        <label className="te-notes">
          <span>Anotações do operador</span>
          <input className="input" value={slide.notes} placeholder="Só aparecem para quem controla a apresentação" onChange={(e) => editor.setSlideMeta(slide.id, { notes: e.currentTarget.value })} />
        </label>
      </div>
    </section>
  );
}
