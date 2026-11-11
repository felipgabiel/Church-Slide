import { useState, type ReactNode } from 'react';
import { LuArrowDown, LuArrowUp, LuBlend, LuCopy, LuEllipsis, LuEye, LuEyeOff, LuGrid3X3, LuLock, LuLockOpen, LuPlus, LuShapes, LuSparkles, LuSun, LuTrash2, LuWaves } from 'react-icons/lu';
import { LAYER_KINDS } from '../../core/design/model';
import type { DesignLayerKind } from '../../core/types';
import { IconButton } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import type { StudioApi } from './Studio';

export const KIND_ICON: Record<DesignLayerKind, ReactNode> = {
  gradient: <LuBlend />,
  shape: <LuShapes />,
  glow: <LuSun />,
  waves: <LuWaves />,
  texture: <LuGrid3X3 />,
  particles: <LuSparkles />,
};

/** Lista de camadas como a pilha real: a de cima da lista é a que fica na frente. */
export function StudioLayers({ api }: { api: StudioApi }) {
  const { design, selected } = api;
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const top = [...design.layers].reverse(); // índice visual 0 = topo da pilha
  const n = design.layers.length;

  const addItems: MenuItem[] = LAYER_KINDS.map((k) => ({ label: k.label, desc: k.hint, icon: KIND_ICON[k.kind], onClick: () => api.addLayer(k.kind) }));

  return (
    <div className="sl-panel">
      <div className="sl-panel-head">
        <h2>Camadas</h2>
        <Menu
          align="end"
          width={280}
          items={addItems}
          trigger={(open, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={open ? '1' : undefined} aria-label="Adicionar camada" aria-haspopup="menu" aria-expanded={open} onClick={toggle} title="Adicionar camada">
              <LuPlus />
            </button>
          )}
        />
      </div>

      {n === 0 ? (
        <div className="sl-panel-empty">
          <p>Sem camadas: aparece só a cor de base.</p>
          <p>Use o + para adicionar um degradê, uma forma ou uma luz.</p>
        </div>
      ) : (
        <ol className="dl-list" aria-label="Camadas, da frente para trás" onDragLeave={() => setDrag((d) => (d ? { ...d, over: null } : d))}>
          {top.map((l, vi) => {
            const idx = n - 1 - vi; // índice real na pilha
            const items: MenuItem[] = [
              { label: 'Duplicar', icon: <LuCopy />, hint: 'Ctrl+D', onClick: () => api.duplicateLayer(l.id) },
              { label: 'Trazer para frente', icon: <LuArrowUp />, disabled: idx === n - 1, onClick: () => api.moveLayer(l.id, idx + 1) },
              { label: 'Enviar para trás', icon: <LuArrowDown />, disabled: idx === 0, onClick: () => api.moveLayer(l.id, idx - 1) },
              { divider: true },
              { label: 'Excluir', icon: <LuTrash2 />, danger: true, hint: 'Del', onClick: () => api.removeLayer(l.id) },
            ];
            return (
              <li
                key={l.id}
                className="dl-row"
                data-on={selected?.id === l.id ? '1' : undefined}
                data-hidden={l.visible ? undefined : '1'}
                data-clip={l.clip && idx > 0 ? '1' : undefined}
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
                  if (drag && drag.id !== l.id) api.moveLayer(drag.id, idx);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <button type="button" className="dl-main" onClick={() => api.select(l.id)} onDoubleClick={() => setRenaming(l.id)} aria-pressed={selected?.id === l.id}>
                  <span className="dl-ico" aria-hidden>
                    {KIND_ICON[l.kind]}
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
                        if (v && v !== l.name) api.patchLayer(l.id, { name: v.slice(0, 60) });
                        setRenaming(null);
                      }}
                    />
                  ) : (
                    <span className="dl-name" title={l.clip ? `${l.name}: recortada pela camada de baixo` : l.name}>
                      {l.name}
                    </span>
                  )}
                </button>
                <span className="dl-tools">
                  <IconButton label={l.locked ? 'Destravar' : 'Travar no palco'} icon={l.locked ? <LuLock /> : <LuLockOpen />} size="sm" active={l.locked} className="dl-lock" onClick={() => api.patchLayer(l.id, { locked: !l.locked })} />
                  <IconButton label={l.visible ? 'Ocultar' : 'Mostrar'} icon={l.visible ? <LuEye /> : <LuEyeOff />} size="sm" className="dl-eye" onClick={() => api.patchLayer(l.id, { visible: !l.visible })} />
                  <Menu
                    align="end"
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
      )}
      <p className="sl-panel-hint">Arraste para mudar a ordem. Duplo clique renomeia.</p>
      <button type="button" className="dl-base" data-on={!selected ? '1' : undefined} onClick={() => api.select(null)}>
        <span className="dl-swatch" style={{ background: design.base }} aria-hidden />
        <span>
          <b>Fundo inteiro</b>
          <small>Cor de base e duração do loop</small>
        </span>
      </button>
    </div>
  );
}
