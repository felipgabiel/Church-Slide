import type { ReactNode } from 'react';
import { LuALargeSmall, LuLayers, LuClapperboard, LuType, LuImage } from 'react-icons/lu';
import { useSetting } from '../../../core/settings';
import { editor, useActiveLayer, useEditor, useSelectedLayerIds, type EditScope } from '../../../store/editor';
import { Segmented } from '../../../ui/Controls';
import { AnimationPanel } from './AnimationPanel';
import { BackgroundPanel } from './BackgroundPanel';
import { TextPanel } from './TextPanel';
import { WordsPanel } from './WordsPanel';
import { tr } from '../../../core/i18n';

type Tab = 'text' | 'words' | 'background' | 'animation';

/** Só mostra qual camada está sendo editada; a lista completa fica no painel "Camadas", embaixo do palco. */
function ActiveLayerName() {
  const layer = useActiveLayer();
  const n = useSelectedLayerIds().length;
  if (!layer) return null;
  return (
    <span className="ctx-layer" data-static="1" data-hidden={layer.visible ? undefined : '1'} title={tr('Troque a camada no painel Camadas, embaixo do palco')}>
      <LuLayers aria-hidden />
      <b>{layer.name}</b>
      {n > 1 && <em>+{n - 1}</em>}
    </span>
  );
}

export function RightPanel() {
  const [tab, setTab] = useSetting<Tab>('right-tab', 'text');
  const scope = useEditor((s) => s.scope);
  return (
    <div className="panel">
      {/* uma linha só: o que está sendo editado (camada) e onde vale (este trecho ou todos) */}
      <div className="ctx">
        <ActiveLayerName />
        <Segmented<EditScope>
          size="sm"
          label={tr('Escopo das alterações')}
          value={scope}
          onChange={(v) => editor.setScope(v)}
          options={[
            { value: 'slide', label: tr('Este trecho'), title: tr('As alterações valem só para o trecho selecionado') },
            { value: 'all', label: tr('Todos'), title: tr('As alterações valem para todos os trechos do louvor') },
          ]}
        />
      </div>
      <div className="tabs" role="tablist" aria-label={tr('Propriedades')}>
        {(
          [
            { id: 'text', label: tr('Texto'), icon: <LuType /> },
            { id: 'words', label: tr('Palavras'), icon: <LuALargeSmall /> },
            { id: 'background', label: tr('Fundo'), icon: <LuImage /> },
            { id: 'animation', label: tr('Animação'), icon: <LuClapperboard /> },
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
