import { useEffect, useState } from 'react';
import { LuLoaderCircle } from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { useSetting } from '../../core/settings';
import { listProjects, collectCategories } from '../../core/storage/projects';
import { editor, useEditor } from '../../store/editor';
import { Button } from '../../ui/Button';
import { InfoDialog, SettingsDialog, ShortcutsDialog } from './Dialogs';
import { ExportDialog } from './ExportDialog';
import { LeftPanel } from './LeftPanel';
import { LyricsDialog } from './LyricsDialog';
import { RightPanel } from './panels/RightPanel';
import { SlideTextEditor } from './SlideTextEditor';
import { LayersPanel } from './LayersPanel';
import { StageArea } from './StageArea';
import { Topbar, type DialogName } from './Topbar';
import { useEditorShortcuts } from './useEditorShortcuts';

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
          <h1>Não foi possível abrir o louvor</h1>
          <p>{error}</p>
          <Button variant="primary" onClick={() => navigate(paths.library)}>
            Voltar à biblioteca
          </Button>
        </div>
      </div>
    );
  }
  if (loading || !ready) {
    return (
      <div className="fatal" role="status">
        <LuLoaderCircle className="spin" style={{ fontSize: 26, color: 'var(--accent)' }} aria-label="Carregando" />
      </div>
    );
  }
  return <Workspace />;
}

function Workspace() {
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

  return (
    <div className="ed" data-left={left ? '1' : '0'} data-right={right ? '1' : '0'}>
      <Topbar left={left} right={right} onToggleLeft={() => setLeft(!left)} onToggleRight={() => setRight(!right)} open={setDialog} />
      {left && (
        <aside className="ed-left" aria-label="Bibliotecas">
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
        <aside className="ed-right" aria-label="Propriedades">
          <RightPanel />
        </aside>
      )}
      <LyricsDialog open={dialog === 'lyrics'} onClose={close} />
      <InfoDialog open={dialog === 'info'} onClose={close} categories={categories} />
      <SettingsDialog open={dialog === 'settings'} onClose={close} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={close} />
      <ExportDialog open={dialog === 'export'} onClose={close} />
    </div>
  );
}
