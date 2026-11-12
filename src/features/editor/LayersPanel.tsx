import { useState, type ReactNode } from 'react';
import { LuArrowDown, LuArrowUp, LuChevronsDown, LuChevronsUp, LuCopy, LuEllipsis, LuEye, LuEyeOff, LuHeading, LuPencil, LuPlus, LuScissors, LuTextQuote, LuTrash2, LuType, LuUserRound } from 'react-icons/lu';
import { canMoveLayer } from '../../core/layers';
import type { LayerRole, TextLayer } from '../../core/types';
import { editor, useActiveSlide, useEditor, useSelectedLayerIds } from '../../store/editor';
import { IconButton } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';

const ROLE_ICON: Record<LayerRole, ReactNode> = {
  lyrics: <LuTextQuote />,
  title: <LuHeading />,
  credit: <LuUserRound />,
  free: <LuType />,
};

const ADD: { role: LayerRole; label: string; desc: string }[] = [
  { role: 'free', label: 'Texto livre', desc: 'Uma frase solta, em qualquer lugar do palco' },
  { role: 'title', label: 'Título da música', desc: 'Usa o nome do louvor' },
  { role: 'credit', label: 'Crédito do artista', desc: 'Usa o artista do louvor' },
];

function iconOf(l: TextLayer) {
  return l.detached ? <LuScissors /> : ROLE_ICON[l.role];
}

/**
 * Camadas do trecho, ao lado do texto. A ordem é a do palco: a de cima da lista fica na frente.
 * Clique seleciona, Ctrl + clique junta, duplo clique renomeia, arrastar muda a ordem.
 */
export function LayersPanel() {
  const slide = useActiveSlide();
  const selected = useSelectedLayerIds();
  const primary = useEditor((s) => s.layerId);
  const name = useEditor((s) => s.project!.name);
  const artist = useEditor((s) => s.project!.artist);
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!slide) return null;

  const layers = slide.layers;
  const n = layers.length;
  const top = [...layers].reverse();

  const addItems: MenuItem[] = ADD.map((a) => ({
    label: a.label,
    desc: a.desc,
    icon: ROLE_ICON[a.role],
    onClick: () => {
      if (a.role === 'free') editor.addFreeText();
      else editor.addLayer(a.role, a.role === 'title' ? name : artist || 'Artista');
    },
  }));

  return (
    <section className="lyr" aria-label="Camadas do trecho">
      <header className="lyr-head">
        <h2>
          Camadas <small>{n}</small>
        </h2>
        <Menu
          align="end"
          width={280}
          items={addItems}
          trigger={(open, toggle) => (
            <button type="button" className="btn btn-ghost btn-sm" data-active={open ? '1' : undefined} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              <span className="btn-icon">
                <LuPlus />
              </span>
              Adicionar camada
            </button>
          )}
        />
      </header>
      <ol className="dl-list lyr-list" aria-label="Camadas, da frente para trás" onDragLeave={() => setDrag((d) => (d ? { ...d, over: null } : d))}>
        {top.map((l, vi) => {
          const idx = n - 1 - vi;
          const preview = l.text.replace(/\s+/g, ' ').trim();
          const items: MenuItem[] = [
            { label: 'Renomear', icon: <LuPencil />, onClick: () => setRenaming(l.id) },
            { label: 'Duplicar', icon: <LuCopy />, onClick: () => editor.duplicateLayer(l.id) },
            { divider: true },
            { label: 'Trazer para frente', icon: <LuChevronsUp />, disabled: !canMoveLayer(layers, l.id, 'front'), onClick: () => editor.moveLayer(l.id, 'front') },
            { label: 'Subir uma camada', icon: <LuArrowUp />, disabled: !canMoveLayer(layers, l.id, 'up'), onClick: () => editor.moveLayer(l.id, 'up') },
            { label: 'Descer uma camada', icon: <LuArrowDown />, disabled: !canMoveLayer(layers, l.id, 'down'), onClick: () => editor.moveLayer(l.id, 'down') },
            { label: 'Enviar para trás', icon: <LuChevronsDown />, disabled: !canMoveLayer(layers, l.id, 'back'), onClick: () => editor.moveLayer(l.id, 'back') },
            { divider: true },
            { label: 'Excluir', icon: <LuTrash2 />, danger: true, disabled: n <= 1, onClick: () => editor.removeLayer(l.id) },
          ];
          return (
            <li
              key={l.id}
              className="dl-row"
              data-layer-row={l.id}
              data-on={selected.includes(l.id) ? '1' : undefined}
              data-primary={primary === l.id && selected.length > 1 ? '1' : undefined}
              data-hidden={l.visible ? undefined : '1'}
              data-over={drag && drag.over === vi && drag.id !== l.id ? '1' : undefined}
              draggable={renaming !== l.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', l.id);
                setDrag({ id: l.id, over: null });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                if (drag.over !== vi) setDrag({ ...drag, over: vi });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag.id !== l.id) editor.moveLayerTo(drag.id, idx);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <button
                type="button"
                className="dl-main"
                onClick={(e) => editor.selectLayer(l.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                onDoubleClick={() => setRenaming(l.id)}
                aria-pressed={selected.includes(l.id)}
                title="Ctrl + clique seleciona várias · duplo clique renomeia"
              >
                <span className="dl-ico" aria-hidden>
                  {iconOf(l)}
                </span>
                {renaming === l.id ? (
                  <input
                    className="dl-rename"
                    defaultValue={l.name}
                    autoFocus
                    aria-label="Nome da camada"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (v && v !== l.name) editor.renameLayer(l.id, v);
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="dl-name">
                    {l.name}
                    {preview && preview !== l.name && <small> · {preview.slice(0, 40)}</small>}
                    {!preview && <small> · vazia</small>}
                  </span>
                )}
              </button>
              <span className="dl-tools">
                <IconButton label={l.visible ? `Ocultar ${l.name}` : `Mostrar ${l.name}`} icon={l.visible ? <LuEye /> : <LuEyeOff />} size="sm" className="dl-eye" onClick={() => editor.toggleLayer(l.id)} />
                <IconButton label={`Excluir ${l.name}`} icon={<LuTrash2 />} size="sm" className="dl-more" disabled={n <= 1} onClick={() => editor.removeLayer(l.id)} />
                <Menu
                  align="end"
                  width={230}
                  items={items}
                  trigger={(open, toggle) => (
                    <button type="button" className="ibtn ibtn-sm dl-more" data-active={open ? '1' : undefined} aria-label={`Mais ações para ${l.name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                      <LuEllipsis />
                    </button>
                  )}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
