import type { ReactNode } from 'react';
import { LuALargeSmall, LuChevronDown, LuEye, LuEyeOff, LuLayers, LuPlus, LuClapperboard, LuTrash2, LuType, LuImage } from 'react-icons/lu';
import { useSetting } from '../../../core/settings';
import type { LayerRole } from '../../../core/types';
import { editor, useActiveSlide, useEditor, type EditScope } from '../../../store/editor';
import { Segmented } from '../../../ui/Controls';
import { Menu, type MenuItem } from '../../../ui/Menu';
import { AnimationPanel } from './AnimationPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { TextPanel } from './TextPanel';
import { WordsPanel } from './WordsPanel';

type Tab = 'text' | 'words' | 'background' | 'animation';

const ROLE_ITEMS: { role: LayerRole; label: string }[] = [
  { role: 'title', label: 'Título da música' },
  { role: 'credit', label: 'Crédito do artista' },
  { role: 'free', label: 'Texto livre' },
];

/**
 * Camada que está sendo editada, num botão só. A lista completa (trocar, ocultar, excluir, adicionar)
 * fica no menu — no dia a dia há uma camada só ("Letra") e ela não precisa ocupar espaço.
 */
function LayerPicker() {
  const slide = useActiveSlide();
  const layerId = useEditor((s) => s.layerId);
  const name = useEditor((s) => s.project!.name);
  const artist = useEditor((s) => s.project!.artist);
  if (!slide) return null;
  const cur = slide.layers.find((l) => l.id === layerId) ?? slide.layers[0];
  const items: MenuItem[] = [
    ...slide.layers.map((l) => ({
      label: l.name,
      hint: l.visible ? (l.text.split('\n')[0] || 'vazio').slice(0, 22) : 'oculta',
      checked: l.id === cur?.id,
      onClick: () => editor.selectLayer(l.id),
    })),
    { divider: true },
    ...(cur
      ? [
          { label: cur.visible ? 'Ocultar esta camada' : 'Mostrar esta camada', icon: cur.visible ? <LuEyeOff /> : <LuEye />, onClick: () => editor.toggleLayer(cur.id) },
          { label: 'Excluir esta camada', icon: <LuTrash2 />, danger: true, disabled: slide.layers.length <= 1, onClick: () => editor.removeLayer(cur.id) },
          { divider: true },
        ]
      : []),
    ...ROLE_ITEMS.map((r) => ({
      label: `Adicionar ${r.label.toLowerCase()}`,
      icon: <LuPlus />,
      onClick: () => editor.addLayer(r.role, r.role === 'title' ? name : r.role === 'credit' ? artist : 'Novo texto'),
    })),
  ];
  return (
    <Menu
      align="start"
      width={260}
      items={items}
      trigger={(open, toggle) => (
        <button type="button" className="ctx-layer" data-hidden={cur && !cur.visible ? '1' : undefined} aria-label={`Camada: ${cur?.name ?? ''}. Trocar, ocultar ou adicionar camadas`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <LuLayers aria-hidden />
          <b>{cur?.name}</b>
          {slide.layers.length > 1 && <em>{slide.layers.length}</em>}
          <LuChevronDown aria-hidden className="ctx-caret" />
        </button>
      )}
    />
  );
}

export function RightPanel() {
  const [tab, setTab] = useSetting<Tab>('right-tab', 'text');
  const scope = useEditor((s) => s.scope);
  return (
    <div className="panel">
      {/* uma linha só: o que está sendo editado (camada) e onde vale (este trecho ou todos) */}
      <div className="ctx">
        <LayerPicker />
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
      <div className="tabs" role="tablist" aria-label="Propriedades">
        {(
          [
            { id: 'text', label: 'Texto', icon: <LuType /> },
            { id: 'words', label: 'Palavras', icon: <LuALargeSmall /> },
            { id: 'background', label: 'Fundo', icon: <LuImage /> },
            { id: 'animation', label: 'Animação', icon: <LuClapperboard /> },
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
        {tab === 'words' && <WordsPanel />}
        {tab === 'background' && <BackgroundPanel />}
        {tab === 'animation' && <AnimationPanel />}
      </div>
    </div>
  );
}
