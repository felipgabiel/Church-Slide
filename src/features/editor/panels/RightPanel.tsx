import type { ReactNode } from 'react';
import { LuEye, LuEyeOff, LuLayers, LuPlus, LuSparkles, LuTrash2, LuType, LuImage } from 'react-icons/lu';
import { useSetting } from '../../../core/settings';
import type { LayerRole } from '../../../core/types';
import { editor, useActiveSlide, useEditor, type EditScope } from '../../../store/editor';
import { Segmented } from '../../../ui/Controls';
import { Menu } from '../../../ui/Menu';
import { AnimationPanel } from './AnimationPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { TextPanel } from './TextPanel';

type Tab = 'text' | 'background' | 'animation';

const ROLE_ITEMS: { role: LayerRole; label: string }[] = [
  { role: 'title', label: 'Título da música' },
  { role: 'credit', label: 'Crédito (artista/ministério)' },
  { role: 'free', label: 'Texto livre' },
];

function LayersBar() {
  const slide = useActiveSlide();
  const layerId = useEditor((s) => s.layerId);
  const name = useEditor((s) => s.project!.name);
  const artist = useEditor((s) => s.project!.artist);
  if (!slide) return null;
  return (
    <div className="layers">
      <div className="layers-head">
        <span>
          <LuLayers aria-hidden /> Camadas de texto
        </span>
        <Menu
          align="end"
          width={250}
          items={ROLE_ITEMS.map((r) => ({
            label: r.label,
            icon: <LuPlus />,
            onClick: () => editor.addLayer(r.role, r.role === 'title' ? name : r.role === 'credit' ? artist : 'Novo texto'),
          }))}
          trigger={(open, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={open ? '1' : undefined} aria-label="Adicionar camada de texto" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              <LuPlus />
            </button>
          )}
        />
      </div>
      <ul>
        {slide.layers.map((l) => (
          <li key={l.id} data-on={l.id === layerId ? '1' : '0'} data-hidden={l.visible ? '0' : '1'}>
            <button type="button" className="layers-main" onClick={() => editor.selectLayer(l.id)} aria-pressed={l.id === layerId}>
              <span className="layers-name">{l.name}</span>
              <span className="layers-text">{l.text.split('\n')[0] || 'vazio'}</span>
            </button>
            <button type="button" className="ibtn ibtn-sm" aria-label={l.visible ? `Ocultar ${l.name}` : `Mostrar ${l.name}`} onClick={() => editor.toggleLayer(l.id)}>
              {l.visible ? <LuEye /> : <LuEyeOff />}
            </button>
            <button type="button" className="ibtn ibtn-sm" aria-label={`Excluir camada ${l.name}`} disabled={slide.layers.length <= 1} onClick={() => editor.removeLayer(l.id)}>
              <LuTrash2 />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RightPanel() {
  const [tab, setTab] = useSetting<Tab>('right-tab', 'text');
  const scope = useEditor((s) => s.scope);
  return (
    <div className="panel">
      <div className="scope">
        <span>Aplicar em</span>
        <Segmented<EditScope>
          size="sm"
          label="Escopo das alterações"
          value={scope}
          onChange={(v) => editor.setScope(v)}
          options={[
            { value: 'slide', label: 'Este trecho', title: 'As alterações valem só para o trecho selecionado' },
            { value: 'all', label: 'Todos', title: 'As alterações valem para todos os trechos do louvor' },
          ]}
        />
      </div>
      <LayersBar />
      <div className="tabs" role="tablist" aria-label="Propriedades">
        {(
          [
            { id: 'text', label: 'Texto', icon: <LuType /> },
            { id: 'background', label: 'Fundo', icon: <LuImage /> },
            { id: 'animation', label: 'Animação', icon: <LuSparkles /> },
          ] as { id: Tab; label: string; icon: ReactNode }[]
        ).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-on={tab === t.id ? '1' : '0'} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'text' && <TextPanel />}
        {tab === 'background' && <BackgroundPanel />}
        {tab === 'animation' && <AnimationPanel />}
      </div>
    </div>
  );
}
