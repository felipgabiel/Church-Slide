import { LuCheck, LuChevronLeft, LuCloudOff, LuDownload, LuEllipsis, LuFilm, LuHistory, LuInfo, LuKeyboard, LuLayoutTemplate, LuLoaderCircle, LuMonitorPlay, LuPanelLeft, LuPanelRight, LuRedo2, LuSettings, LuUndo2, LuClipboardPaste, LuType } from 'react-icons/lu';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { navigate, paths } from '../../app/router';
import { slideText } from '../../core/defaults';
import { downloadBlob, exportFileName, exportProject } from '../../core/storage/exchange';
import { readSnapshot, saveAsTemplate } from '../../core/storage/projects';
import { ASPECT_RATIOS, type Aspect } from '../../core/types';
import { timeAgo } from '../../core/util';
import { editor, editorStore, flushSave, useEditor } from '../../store/editor';
import { Button, IconButton } from '../../ui/Button';
import { Select } from '../../ui/Controls';
import { LogoMark } from '../../ui/Logo';
import { Menu } from '../../ui/Menu';
import { confirmDialog, promptDialog, toast, toastError, useNow } from '../../ui/toast';
import { startPresenting } from './useEditorShortcuts';

export type DialogName = 'lyrics' | 'info' | 'settings' | 'shortcuts' | 'export';

function SaveStatus() {
  const status = useEditor((s) => s.status);
  const lastSaved = useEditor((s) => s.lastSaved);
  const now = useNow(20_000);
  if (status === 'error') {
    return (
      <button type="button" className="save save-bad" onClick={() => void flushSave()} title="Clique para tentar salvar de novo">
        <LuCloudOff aria-hidden /> Não foi possível salvar. Tentar de novo
      </button>
    );
  }
  if (status === 'dirty' || status === 'saving') {
    return (
      <span className="save" role="status">
        <LuLoaderCircle className="spin" aria-hidden /> Salvando…
      </span>
    );
  }
  return (
    <span className="save save-ok" role="status" title={lastSaved ? `Salvo ${timeAgo(lastSaved, now)}` : undefined}>
      <LuCheck aria-hidden /> Salvo
    </span>
  );
}

interface Props {
  left: boolean;
  right: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  open: (d: DialogName) => void;
}

export function Topbar({ left, right, onToggleLeft, onToggleRight, open }: Props) {
  const name = useEditor((s) => s.project!.name);
  const aspect = useEditor((s) => s.project!.aspect);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasText = useEditor((s) => s.project!.slides.some((x) => slideText(x).trim()));

  return (
    <header className="tb">
      <div className="tb-left">
        <IconButton label="Voltar à biblioteca" icon={<LuChevronLeft />} onClick={() => navigate(paths.library)} />
        <span className="tb-logo" aria-hidden>
          <LogoMark size={20} />
        </span>
        <input
          className="tb-name"
          value={name}
          aria-label="Nome do louvor"
          spellCheck={false}
          onChange={(e) => editor.setProjectMeta({ name: e.currentTarget.value })}
          onBlur={(e) => {
            if (!e.currentTarget.value.trim()) editor.setProjectMeta({ name: 'Sem título' });
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <SaveStatus />
      </div>

      <div className="tb-center">
        <IconButton label="Desfazer (Ctrl+Z)" icon={<LuUndo2 />} onClick={() => editor.undo()} disabled={!canUndo} />
        <IconButton label="Refazer (Ctrl+Shift+Z)" icon={<LuRedo2 />} onClick={() => editor.redo()} disabled={!canRedo} />
        <span className="tb-sep" />
        <Button variant="ghost" size="sm" icon={<LuType />} onClick={() => editor.addFreeText()} title="Adicionar um texto livre neste trecho (duplo clique no palco edita)">
          Texto
        </Button>
        <span className="tb-sep" />
        <div className="tb-aspect">
          <Select value={aspect} onChange={(v) => editor.setProjectMeta({ aspect: v as Aspect })} label="Proporção da tela">
            {(Object.keys(ASPECT_RATIOS) as Aspect[]).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="tb-right">
        <ThemeToggle />
        <IconButton label={left ? 'Ocultar painel esquerdo' : 'Mostrar painel esquerdo'} icon={<LuPanelLeft />} active={left} onClick={onToggleLeft} />
        <IconButton label={right ? 'Ocultar painel direito' : 'Mostrar painel direito'} icon={<LuPanelRight />} active={right} onClick={onToggleRight} />
        <Menu
          align="end"
          width={270}
          items={[
            { label: 'Letra completa…', icon: <LuClipboardPaste />, onClick: () => open('lyrics') },
            { label: 'Informações do louvor…', icon: <LuInfo />, onClick: () => open('info') },
            { divider: true },
            {
              label: 'Exportar arquivo (.json)',
              icon: <LuDownload />,
              onClick: async () => {
                try {
                  await flushSave();
                  const p = editorStore.get().project!;
                  downloadBlob(await exportProject(p), exportFileName(p));
                } catch {
                  toastError('Não foi possível exportar o projeto.');
                }
              },
            },
            {
              label: 'Salvar como modelo…',
              icon: <LuLayoutTemplate />,
              onClick: async () => {
                const p = editorStore.get().project!;
                const n = await promptDialog({ title: 'Salvar como modelo', label: 'Nome do modelo', value: `${p.name} (modelo)` });
                if (!n) return;
                await flushSave();
                await saveAsTemplate(p.id, n);
                toast('Modelo salvo. Ele aparece ao criar um novo louvor.');
              },
            },
            {
              label: 'Restaurar cópia de segurança…',
              icon: <LuHistory />,
              onClick: async () => {
                const p = editorStore.get().project!;
                const snap = await readSnapshot(p.id);
                if (!snap) return toast('Ainda não há cópia de segurança deste louvor.', 'info');
                const ok = await confirmDialog({
                  title: 'Restaurar cópia de segurança?',
                  message: `O louvor voltará ao estado de ${timeAgo(snap.savedAt)} (${snap.project.slides.length} trechos). Dá para desfazer com Ctrl+Z.`,
                  confirmLabel: 'Restaurar',
                });
                if (ok) {
                  editor.replaceProject(snap.project);
                  toast('Cópia de segurança restaurada');
                }
              },
            },
            { divider: true },
            { label: 'Configurações…', icon: <LuSettings />, onClick: () => open('settings') },
            { label: 'Atalhos de teclado…', icon: <LuKeyboard />, onClick: () => open('shortcuts') },
          ]}
          trigger={(isOpen, toggle) => <IconButton label="Mais opções" icon={<LuEllipsis />} active={isOpen} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle} />}
        />
        <Button icon={<LuFilm />} onClick={() => open('export')} disabled={!hasText} title={hasText ? 'Gerar um vídeo MP4 por trecho (animação + letra parada)' : 'Adicione a letra para exportar'}>
          Exportar vídeos
        </Button>
        <Button variant="primary" icon={<LuMonitorPlay />} onClick={() => void startPresenting()} disabled={!hasText} title={hasText ? 'Abrir o modo de apresentação (Ctrl+Enter)' : 'Adicione a letra para apresentar'}>
          Apresentar
        </Button>
      </div>
    </header>
  );
}
