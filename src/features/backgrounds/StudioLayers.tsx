import { useRef, useState, type ReactNode } from 'react';
import { LuArrowDown, LuArrowUp, LuBlend, LuCopy, LuEllipsis, LuEye, LuEyeOff, LuGrid3X3, LuImage, LuLock, LuLockOpen, LuPlus, LuShapes, LuSparkles, LuSun, LuTrash2, LuWaves } from 'react-icons/lu';
import { LAYER_KINDS } from '../../core/design/model';
import type { DesignLayerKind } from '../../core/types';
import { IconButton } from '../../ui/Button';
import { Menu, type MenuItem } from '../../ui/Menu';
import type { StudioApi } from './Studio';
import { tr } from '../../core/i18n';

export const KIND_ICON: Record<DesignLayerKind, ReactNode> = {
  gradient: <LuBlend />,
  shape: <LuShapes />,
  glow: <LuSun />,
  waves: <LuWaves />,
  texture: <LuGrid3X3 />,
  particles: <LuSparkles />,
  media: <LuImage />,
};

/** Lista de camadas como a pilha real: a de cima da lista é a que fica na frente. */
export function StudioLayers({ api }: { api: StudioApi }) {
  const { design, selected } = api;
  const [drag, setDrag] = useState<{ id: string; over: number | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const top = [...design.layers].reverse(); // índice visual 0 = topo da pilha
  const n = design.layers.length;

  const fileRef = useRef<HTMLInputElement>(null);
  // "Imagem ou vídeo" pede o arquivo primeiro (ele fica guardado em "Meus arquivos")
  const addItems: MenuItem[] = LAYER_KINDS.map((k) => ({ label: k.label, desc: k.hint, icon: KIND_ICON[k.kind], onClick: () => (k.kind === 'media' ? fileRef.current?.click() : api.addLayer(k.kind)) }));

  return (
    <div className="sl-panel">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        data-testid="studio-media-input"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void api.addMediaLayer(f);
        }}
      />
      <div className="sl-panel-head">
        <h2>{tr('Camadas')}</h2>
        <Menu
          align="end"
          width={280}
          items={addItems}
          trigger={(open, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={open ? '1' : undefined} aria-label={tr('Adicionar camada')} aria-haspopup="menu" aria-expanded={open} onClick={toggle} title={tr('Adicionar camada')}>
              <LuPlus />
            </button>
          )}
        />
      </div>

      {n === 0 ? (
        <div className="sl-panel-empty">
          <p>{tr('Sem camadas: aparece só a cor de base.')}</p>
          <p>{tr('Use o + para adicionar um degradê, uma forma ou uma luz.')}</p>
        </div>
      ) : (
        <ol className="dl-list" aria-label={tr('Camadas, da frente para trás')} onDragLeave={() => setDrag((d) => (d ? { ...d, over: null } : d))}>
          {top.map((l, vi) => {
            const idx = n - 1 - vi; // índice real na pilha
            const items: MenuItem[] = [
              { label: tr('Duplicar'), icon: <LuCopy />, hint: 'Ctrl+D', onClick: () => api.duplicateLayer(l.id) },
              { label: tr('Trazer para frente'), icon: <LuArrowUp />, disabled: idx === n - 1, onClick: () => api.moveLayer(l.id, idx + 1) },
              { label: tr('Enviar para trás'), icon: <LuArrowDown />, disabled: idx === 0, onClick: () => api.moveLayer(l.id, idx - 1) },
              { divider: true },
              { label: tr('Excluir'), icon: <LuTrash2 />, danger: true, hint: 'Del', onClick: () => api.removeLayer(l.id) },
            ];
            return (
              <li
                key={l.id}
                className="dl-row"
                data-on={api.selectedIds.includes(l.id) ? '1' : undefined}
                data-primary={selected?.id === l.id && api.selectedIds.length > 1 ? '1' : undefined}
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
                <button
                  type="button"
                  className="dl-main"
                  onClick={(e) => api.select(l.id, e.ctrlKey || e.metaKey || e.shiftKey)}
                  onDoubleClick={() => setRenaming(l.id)}
                  aria-pressed={api.selectedIds.includes(l.id)}
                  title={tr('Ctrl + clique seleciona várias')}
                >
                  <span className="dl-ico" aria-hidden>
                    {KIND_ICON[l.kind]}
                  </span>
                  {renaming === l.id ? (
                    <input
                      className="dl-rename"
                      defaultValue={l.name}
                      autoFocus
                      aria-label={tr('Nome da camada')}
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
                    <span className="dl-name" title={l.clip ? tr('{0}: recortada pela camada de baixo', l.name) : l.name}>
                      {l.name}
                    </span>
                  )}
                </button>
                <span className="dl-tools">
                  <IconButton label={l.locked ? tr('Destravar') : tr('Travar no palco')} icon={l.locked ? <LuLock /> : <LuLockOpen />} size="sm" active={l.locked} className="dl-lock" onClick={() => api.patchLayer(l.id, { locked: !l.locked })} />
                  <IconButton label={l.visible ? tr('Ocultar') : tr('Mostrar')} icon={l.visible ? <LuEye /> : <LuEyeOff />} size="sm" className="dl-eye" onClick={() => api.patchLayer(l.id, { visible: !l.visible })} />
                  <Menu
                    align="end"
                    items={items}
                    trigger={(open, toggle) => (
                      <button type="button" className="ibtn ibtn-sm dl-more" data-active={open ? '1' : undefined} aria-label={tr('Mais ações para {0}', l.name)} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
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
      <p className="sl-panel-hint">{tr('Arraste para mudar a ordem. Ctrl + clique seleciona várias. Duplo clique renomeia.')}</p>
      <button type="button" className="dl-base" data-on={!selected ? '1' : undefined} onClick={() => api.select(null)}>
        <span className="dl-swatch" style={{ background: design.base }} aria-hidden />
        <span>
          <b>{tr('Fundo inteiro')}</b>
          <small>{tr('Cor de base e duração do loop')}</small>
        </span>
      </button>
    </div>
  );
}
