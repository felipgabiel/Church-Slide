import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuLayers, LuListOrdered, LuLoaderCircle, LuMonitor, LuPalette } from 'react-icons/lu';
import { useFormFactor } from '../../app/formFactor';
import { SlideThumb } from '../../render/SlideThumb';
import { navigate, paths } from '../../app/router';
import { useSetting } from '../../core/settings';
import { listProjects, collectCategories } from '../../core/storage/projects';
import { editor, useActiveSlide, useEditor } from '../../store/editor';
import { Button } from '../../ui/Button';
import { InfoDialog, ShortcutsDialog } from './Dialogs';
import { ExportDialog } from './ExportDialog';
import { LeftPanel } from './LeftPanel';
import { LyricsDialog } from './LyricsDialog';
import { RightPanel } from './panels/RightPanel';
import { SlideTextEditor } from './SlideTextEditor';
import { LayersPanel } from './LayersPanel';
import { StageArea } from './StageArea';
import { Topbar, type DialogName } from './Topbar';
import { useEditorShortcuts } from './useEditorShortcuts';
import { tr } from '../../core/i18n';

export function Editor({ id }: { id: string }) {
  const loading = useEditor((s) => s.loading);
  const error = useEditor((s) => s.loadError);
  const ready = useEditor((s) => s.project?.id === id);

  useEffect(() => {
    void editor.open(id);
    return () => {
      void editor.close();
    };
  }, [id]);

  if (error) {
    return (
      <div className="fatal" role="alert">
        <div className="fatal-box">
          <h1>{tr('Não foi possível abrir o louvor')}</h1>
          <p>{error}</p>
          <Button variant="primary" onClick={() => navigate(paths.library)}>
            {tr('Voltar à biblioteca')}
          </Button>
        </div>
      </div>
    );
  }
  if (loading || !ready) {
    return (
      <div className="fatal" role="status">
        <LuLoaderCircle className="spin" style={{ fontSize: 26, color: 'var(--accent)' }} aria-label={tr('Carregando')} />
      </div>
    );
  }
  return <Workspace />;
}

type PhoneView = 'slide' | 'slides' | 'style' | 'layers';

/** Prévia do trecho atual no topo das abas de ajuste (no celular o palco não cabe junto). */
function PhonePreview() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const aspect = useEditor((s) => s.project!.aspect);
  if (!slide) return null;
  return (
    <div className="ph-preview" aria-hidden>
      <SlideThumb slide={slide} theme={theme} aspect={aspect} />
    </div>
  );
}

/**
 * Editor no celular: uma coisa por vez, com abas embaixo (Slide, Trechos, Estilo, Camadas).
 * São os mesmos painéis do computador; só a arrumação muda.
 */
function PhoneWorkspace({ dialog, setDialog, categories }: { dialog: DialogName | null; setDialog: (d: DialogName | null) => void; categories: string[] }) {
  const [view, setView] = useState<PhoneView>('slide');
  const close = () => setDialog(null);
  // escolher um trecho na lista leva de volta ao slide
  const slideId = useEditor((s) => s.slideId);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setView((v) => (v === 'slides' ? 'slide' : v));
  }, [slideId]);
  const tabs: { id: PhoneView; label: string; icon: ReactNode }[] = [
    { id: 'slide', label: tr('Slide'), icon: <LuMonitor /> },
    { id: 'slides', label: tr('Trechos'), icon: <LuListOrdered /> },
    { id: 'style', label: tr('Estilo'), icon: <LuPalette /> },
    { id: 'layers', label: tr('Camadas'), icon: <LuLayers /> },
  ];
  return (
    <div className="ed ed-phone" data-view={view}>
      <Topbar left right onToggleLeft={() => undefined} onToggleRight={() => undefined} open={setDialog} />
      <main className="ph-main">
        {view === 'slide' && (
          <div className="ph-slide">
            <StageArea onLyrics={() => setDialog('lyrics')} />
            <SlideTextEditor />
          </div>
        )}
        {view === 'slides' && (
          <aside className="ed-left ph-pane" aria-label={tr('Bibliotecas')}>
            <LeftPanel onLyrics={() => setDialog('lyrics')} />
          </aside>
        )}
        {view === 'style' && (
          <aside className="ed-right ph-pane" aria-label={tr('Propriedades')}>
            <PhonePreview />
            <RightPanel />
          </aside>
        )}
        {view === 'layers' && (
          <div className="ph-pane ph-layers">
            <PhonePreview />
            <LayersPanel />
          </div>
        )}
      </main>
      <nav className="ph-tabs" aria-label={tr('Partes do editor')}>
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-current={view === t.id ? 'page' : undefined} data-on={view === t.id ? '1' : undefined} onClick={() => setView(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <LyricsDialog open={dialog === 'lyrics'} onClose={close} />
      <InfoDialog open={dialog === 'info'} onClose={close} categories={categories} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={close} />
      <ExportDialog open={dialog === 'export'} onClose={close} />
    </div>
  );
}

function Workspace() {
  const form = useFormFactor();
  const [left, setLeft] = useSetting<boolean>('panel-left', true);
  const [right, setRight] = useSetting<boolean>('panel-right', true);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  useEditorShortcuts();

  // categorias já usadas, para sugerir no diálogo de informações
  useEffect(() => {
    if (dialog !== 'info') return;
    void listProjects().then((all) => setCategories(collectCategories(all.filter((p) => !p.deletedAt)))).catch(() => undefined);
  }, [dialog]);

  const close = () => setDialog(null);

  // aviso flutuante da exportação em segundo plano: "Abrir" volta para este diálogo
  useEffect(() => {
    const on = () => setDialog('export');
    window.addEventListener('cs:open-export', on);
    return () => window.removeEventListener('cs:open-export', on);
  }, []);

  if (form === 'phone') return <PhoneWorkspace dialog={dialog} setDialog={setDialog} categories={categories} />;

  return (
    <div className="ed" data-left={left ? '1' : '0'} data-right={right ? '1' : '0'}>
      <Topbar left={left} right={right} onToggleLeft={() => setLeft(!left)} onToggleRight={() => setRight(!right)} open={setDialog} />
      {left && (
        <aside className="ed-left" aria-label={tr('Bibliotecas')}>
          <LeftPanel onLyrics={() => setDialog('lyrics')} />
        </aside>
      )}
      <main className="ed-center">
        <StageArea onLyrics={() => setDialog('lyrics')} />
        <div className="ed-bottom">
          <SlideTextEditor />
          <LayersPanel />
        </div>
      </main>
      {right && (
        <aside className="ed-right" aria-label={tr('Propriedades')}>
          <RightPanel />
        </aside>
      )}
      <LyricsDialog open={dialog === 'lyrics'} onClose={close} />
      <InfoDialog open={dialog === 'info'} onClose={close} categories={categories} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={close} />
      <ExportDialog open={dialog === 'export'} onClose={close} />
    </div>
  );
}
