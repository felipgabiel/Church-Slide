import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowDown, LuArrowUp, LuClipboardPaste, LuCopy, LuEllipsis, LuMerge, LuPlus, LuTrash2 } from 'react-icons/lu';
import { slideText } from '../../core/defaults';
import type { Aspect, Slide, Theme } from '../../core/types';
import { SlideThumb } from '../../render/SlideThumb';
import { editor, useEditor } from '../../store/editor';
import { Button, IconButton } from '../../ui/Button';
import { LazyMount } from '../../ui/LazyMount';
import { Menu, type MenuItem } from '../../ui/Menu';

interface ItemProps {
  slide: Slide;
  index: number;
  count: number;
  theme: Theme;
  aspect: Aspect;
  selected: boolean;
  drop: 'before' | 'after' | null;
  dragging: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (i: number, edge: 'before' | 'after') => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

const SlideItem = memo(function SlideItem({ slide, index, count, theme, aspect, selected, drop, dragging, onDragStart, onDragOver, onDrop, onDragEnd }: ItemProps) {
  const text = slideText(slide).trim();
  // legenda curta: o rótulo (ex.: Refrão) ou a primeira linha; a miniatura já mostra o resto
  const caption = slide.label || text.split('\n')[0] || '';
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const items: MenuItem[] = [
    { label: 'Duplicar', icon: <LuCopy />, hint: 'Ctrl+D', onClick: () => editor.duplicateSlide(slide.id) },
    { label: 'Mesclar com o próximo', icon: <LuMerge />, disabled: index >= count - 1, onClick: () => editor.mergeWithNext(slide.id) },
    { label: 'Mover para cima', icon: <LuArrowUp />, hint: 'Alt+↑', disabled: index === 0, onClick: () => editor.moveSlide(index, index - 1) },
    { label: 'Mover para baixo', icon: <LuArrowDown />, hint: 'Alt+↓', disabled: index >= count - 1, onClick: () => editor.moveSlide(index, index + 1) },
    { divider: true },
    { label: 'Excluir trecho', icon: <LuTrash2 />, danger: true, hint: 'Del', onClick: () => editor.deleteSlide(slide.id) },
  ];

  return (
    <li
      ref={ref}
      className="si"
      data-selected={selected ? '1' : '0'}
      data-dragging={dragging ? '1' : '0'}
      data-drop={drop ?? undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        onDragOver(index, e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <span className="si-num" aria-hidden>
        {index + 1}
      </span>
      <button type="button" className="si-main" onClick={() => editor.selectSlide(slide.id)} aria-current={selected ? 'true' : undefined} aria-label={`Trecho ${index + 1}${slide.label ? `, ${slide.label}` : ''}`} title={text || 'Trecho vazio'}>
        <span className="si-thumb">
          <LazyMount>
            <SlideThumb slide={slide} theme={theme} aspect={aspect} />
          </LazyMount>
        </span>
        <span className="si-cap" data-label={slide.label ? '1' : undefined} data-blank={caption ? undefined : '1'}>
          {caption || 'Trecho vazio'}
        </span>
      </button>
      <span className="si-actions">
        <Menu
          align="end"
          items={items}
          width={230}
          trigger={(open, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={open ? '1' : undefined} aria-label={`Ações do trecho ${index + 1}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              <LuEllipsis />
            </button>
          )}
        />
      </span>
    </li>
  );
});

const NONE: Slide[] = [];

export function SlideList({ onLyrics }: { onLyrics: () => void }) {
  const slides = useEditor((s) => s.project?.slides ?? NONE);
  const theme = useEditor((s) => s.project!.theme);
  const aspect = useEditor((s) => s.project!.aspect);
  const slideId = useEditor((s) => s.slideId);

  const from = useRef<number | null>(null);
  const [over, setOver] = useState<{ index: number; edge: 'before' | 'after' } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const onDragStart = useCallback((i: number) => {
    from.current = i;
    setDragIdx(i);
  }, []);
  const onDragOver = useCallback((index: number, edge: 'before' | 'after') => {
    setOver((o) => (o && o.index === index && o.edge === edge ? o : { index, edge }));
  }, []);
  const onDragEnd = useCallback(() => {
    from.current = null;
    setOver(null);
    setDragIdx(null);
  }, []);
  const onDrop = useCallback(() => {
    const f = from.current;
    const o = over;
    onDragEnd();
    if (f === null || !o) return;
    let to = o.edge === 'before' ? o.index : o.index + 1;
    if (f < to) to -= 1; // ao remover o item de origem, os índices seguintes recuam
    if (to !== f) editor.moveSlide(f, to);
  }, [over, onDragEnd]);

  const empty = slides.every((s) => !slideText(s).trim());

  return (
    <div className="sl">
      <div className="sl-head">
        <span className="sl-title">
          Trechos <em>{slides.length}</em>
        </span>
        <IconButton label="Colar a letra completa" icon={<LuClipboardPaste />} size="sm" onClick={onLyrics} />
        <IconButton label="Novo trecho" icon={<LuPlus />} size="sm" onClick={() => editor.addSlide()} />
      </div>
      {empty && (
        <div className="sl-empty">
          <Button size="sm" variant="primary" icon={<LuClipboardPaste />} onClick={onLyrics}>
            Colar a letra completa
          </Button>
          <p>Cole a letra e ela é dividida em trechos automaticamente.</p>
        </div>
      )}
      <ol className="sl-list" aria-label="Trechos do louvor" title="Arraste um trecho para mudar a ordem">
        {slides.map((s, i) => (
          <SlideItem
            key={s.id}
            slide={s}
            index={i}
            count={slides.length}
            theme={theme}
            aspect={aspect}
            selected={s.id === slideId}
            dragging={dragIdx === i}
            drop={over && over.index === i && dragIdx !== null ? over.edge : null}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
      </ol>
    </div>
  );
}
