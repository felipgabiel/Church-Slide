import { useMemo, useRef, useState, type ReactNode } from 'react';
import { SupportCard } from '../support/SupportCard';
import { ThemeToggle } from '../../ui/ThemeToggle';
import {
  LuArchive,
  LuCopy,
  LuDownload,
  LuEllipsis,
  LuFolderOpen,
  LuHeart,
  LuHistory,
  LuLayoutTemplate,
  LuLibrary,
  LuMonitorPlay,
  LuMusic,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuUpload,
  LuWifiOff,
} from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { useOfflineReady } from '../../app/pwa';
import { slideText } from '../../core/defaults';
import { storageMode } from '../../core/storage/db';
import { downloadBlob, exportFileName, exportProject, importProjectFile } from '../../core/storage/exchange';
import { collectCategories, duplicateProject, readSnapshot, restoreFromSnapshot, saveAsTemplate, trashProject } from '../../core/storage/projects';
import type { Project } from '../../core/types';
import { timeAgo } from '../../core/util';
import { SlideThumb } from '../../render/SlideThumb';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Controls';
import { LazyMount } from '../../ui/LazyMount';
import { Wordmark } from '../../ui/Logo';
import { Menu, type MenuItem } from '../../ui/Menu';
import { confirmDialog, promptDialog, toast, toastError } from '../../ui/toast';
import { InfoDialog } from './InfoDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { TrashDialog } from './TrashDialog';
import { useProjects } from './useProjects';

type Filter = { kind: 'all' } | { kind: 'templates' } | { kind: 'category'; name: string } | { kind: 'none' };
type Sort = 'recent' | 'name';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Library() {
  const { projects, loading, error, reload } = useProjects();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>('recent');
  const [newOpen, setNewOpen] = useState(false);
  const [newTheme, setNewTheme] = useState('impacto');
  const [trashOpen, setTrashOpen] = useState(false);
  const [info, setInfo] = useState<Project | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const offline = useOfflineReady();

  const alive = useMemo(() => projects.filter((p) => !p.deletedAt), [projects]);
  const trashed = useMemo(() => projects.filter((p) => p.deletedAt), [projects]);
  const songs = useMemo(() => alive.filter((p) => !p.isTemplate), [alive]);
  const templates = useMemo(() => alive.filter((p) => p.isTemplate), [alive]);
  const categories = useMemo(() => collectCategories(songs), [songs]);
  const uncategorized = useMemo(() => songs.filter((p) => !p.category.trim()).length, [songs]);

  const visible = useMemo(() => {
    let list = filter.kind === 'templates' ? templates : songs;
    if (filter.kind === 'category') list = list.filter((p) => p.category.trim() === filter.name);
    if (filter.kind === 'none') list = list.filter((p) => !p.category.trim());
    const q = norm(query.trim());
    if (q) {
      list = list.filter((p) => norm(`${p.name} ${p.artist} ${p.category}`).includes(q) || p.slides.some((s) => norm(slideText(s)).includes(q)));
    }
    return [...list].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : b.updatedAt - a.updatedAt));
  }, [songs, templates, filter, query, sort]);

  const open = (p: Project) => navigate(paths.edit(p.id));

  const doImport = async (files: FileList | null) => {
    if (!files?.length) return;
    let last: Project | null = null;
    for (const f of Array.from(files)) {
      try {
        last = await importProjectFile(f);
        toast(`“${last.name}” importado`);
      } catch (err) {
        toastError(err instanceof Error ? err.message : `Não foi possível importar ${f.name}.`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    if (last && files.length === 1) open(last);
  };

  const actionsFor = (p: Project): MenuItem[] => [
    { label: 'Abrir no editor', icon: <LuFolderOpen />, onClick: () => open(p) },
    { label: 'Informações…', icon: <LuPencil />, onClick: () => setInfo(p) },
    {
      label: 'Duplicar',
      icon: <LuCopy />,
      onClick: async () => {
        try {
          const c = await duplicateProject(p.id);
          toast(c ? `“${c.name}” criado` : 'Projeto não encontrado');
          await reload();
        } catch {
          toastError('Não foi possível duplicar.');
        }
      },
    },
    {
      label: 'Salvar como modelo…',
      icon: <LuLayoutTemplate />,
      disabled: p.isTemplate,
      onClick: async () => {
        const name = await promptDialog({ title: 'Salvar como modelo', label: 'Nome do modelo', value: `${p.name} (modelo)` });
        if (!name) return;
        await saveAsTemplate(p.id, name);
        toast('Modelo salvo. Ele aparece ao criar um novo louvor.');
        await reload();
      },
    },
    {
      label: 'Exportar arquivo',
      icon: <LuDownload />,
      hint: '.json',
      onClick: async () => {
        try {
          downloadBlob(await exportProject(p), exportFileName(p));
        } catch {
          toastError('Não foi possível exportar o projeto.');
        }
      },
    },
    {
      label: 'Restaurar cópia de segurança…',
      icon: <LuHistory />,
      onClick: async () => {
        const snap = await readSnapshot(p.id);
        if (!snap) return toast('Este projeto ainda não tem cópia de segurança.', 'info');
        const ok = await confirmDialog({
          title: 'Restaurar cópia de segurança?',
          message: `O projeto voltará ao estado salvo ${timeAgo(snap.savedAt)} (${snap.project.slides.length} trechos). As alterações feitas depois serão substituídas.`,
          confirmLabel: 'Restaurar',
        });
        if (!ok) return;
        await restoreFromSnapshot(p.id);
        toast('Cópia de segurança restaurada');
        await reload();
      },
    },
    { divider: true },
    {
      label: 'Mover para a lixeira',
      icon: <LuTrash2 />,
      danger: true,
      onClick: async () => {
        await trashProject(p.id);
        toast(`“${p.name}” foi para a lixeira`, 'info');
        await reload();
      },
    },
  ];

  const heading = filter.kind === 'templates' ? 'Modelos' : filter.kind === 'category' ? filter.name : filter.kind === 'none' ? 'Sem categoria' : 'Seus louvores';

  return (
    <div className="lib">
      <header className="lib-top">
        <Wordmark />
        <label className="lib-search">
          <LuSearch aria-hidden />
          <input type="search" placeholder="Buscar por nome, artista ou trecho da letra" value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label="Buscar louvores" />
        </label>
        <div className="lib-top-actions">
          <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => void doImport(e.currentTarget.files)} />
          <ThemeToggle />
          <Button icon={<LuUpload />} onClick={() => fileRef.current?.click()}>
            Importar
          </Button>
          <Button
            variant="primary"
            icon={<LuPlus />}
            onClick={() => {
              setNewTheme('impacto');
              setNewOpen(true);
            }}
          >
            Novo louvor
          </Button>
        </div>
      </header>

      <aside className="lib-side" aria-label="Filtros">
        <nav>
          <NavItem icon={<LuLibrary />} label="Todos os louvores" count={songs.length} on={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })} />
          <NavItem icon={<LuLayoutTemplate />} label="Modelos" count={templates.length} on={filter.kind === 'templates'} onClick={() => setFilter({ kind: 'templates' })} />
        </nav>
        {(categories.length > 0 || uncategorized > 0) && (
          <nav className="lib-cats" aria-label="Categorias">
            <h3>Categorias</h3>
            {categories.map((c) => (
              <NavItem key={c} label={c} count={songs.filter((p) => p.category.trim() === c).length} on={filter.kind === 'category' && filter.name === c} onClick={() => setFilter({ kind: 'category', name: c })} />
            ))}
            {uncategorized > 0 && categories.length > 0 && <NavItem label="Sem categoria" count={uncategorized} on={filter.kind === 'none'} onClick={() => setFilter({ kind: 'none' })} />}
          </nav>
        )}
        <div className="lib-side-foot">
          <button type="button" className="lib-trash" onClick={() => setTrashOpen(true)}>
            <LuArchive aria-hidden />
            Lixeira
            {trashed.length > 0 && <span>{trashed.length}</span>}
          </button>
          <p className="lib-status">
            {storageMode === 'memory' ? (
              <span data-bad="1">Armazenamento indisponível: nada será guardado ao fechar.</span>
            ) : offline === 'ready' ? (
              <span>Guardado neste computador. Funciona sem internet.</span>
            ) : (
              <span>Guardado neste computador.</span>
            )}
          </p>
        </div>
      </aside>

      <main className="lib-main">
        {storageMode === 'memory' && (
          <div className="lib-banner" role="alert">
            <LuWifiOff aria-hidden />
            Este navegador bloqueou o armazenamento local (navegação privada?). Os projetos só existem enquanto esta aba estiver aberta. Use “Exportar” para guardar uma cópia.
          </div>
        )}
        <div className="lib-head">
          <h1>{heading}</h1>
          <span className="lib-count">{visible.length === 1 ? '1 item' : `${visible.length} itens`}</span>
          <div className="lib-sort">
            <Select value={sort} onChange={(v) => setSort(v as Sort)} label="Ordenar">
              <option value="recent">Mais recentes</option>
              <option value="name">Nome (A–Z)</option>
            </Select>
          </div>
        </div>

        {error && (
          <div className="empty">
            <h3>Não foi possível carregar os projetos</h3>
            <p>{error}</p>
            <Button onClick={() => void reload()}>Tentar novamente</Button>
          </div>
        )}

        {!error && loading && <div className="empty">Carregando…</div>}

        {!error && !loading && visible.length === 0 && (
          <div className="lib-empty">
            <LuMusic aria-hidden />
            {songs.length === 0 && filter.kind === 'all' && !query ? (
              <>
                <h3>Comece pelo primeiro louvor</h3>
                <p>Cole a letra, escolha um visual e veja como fica no telão em poucos minutos.</p>
                <Button variant="primary" size="lg" icon={<LuPlus />} onClick={() => setNewOpen(true)}>
                  Criar louvor
                </Button>
              </>
            ) : (
              <>
                <h3>Nada encontrado</h3>
                <p>{query ? `Nenhum resultado para “${query}”.` : 'Não há itens neste filtro.'}</p>
                {query && <Button onClick={() => setQuery('')}>Limpar busca</Button>}
              </>
            )}
          </div>
        )}

        {!error && visible.length > 0 && (
          <div className="lib-grid">
            {visible.map((p) => (
              <ProjectCard key={p.id} project={p} onOpen={() => open(p)} items={actionsFor(p)} template={filter.kind === 'templates'} onUseTemplate={() => {
                  setNewTheme(`tpl:${p.id}`);
                  setNewOpen(true);
                }} />
            ))}
          </div>
        )}
      </main>

      <NewProjectDialog
        key={newOpen ? `open:${newTheme}` : 'closed'}
        open={newOpen}
        initialThemeId={newTheme}
        onClose={() => setNewOpen(false)}
        categories={categories}
        templates={templates}
        defaultCategory={filter.kind === 'category' ? filter.name : ''}
        onCreated={(p) => {
          setNewOpen(false);
          open(p);
        }}
      />
      <TrashDialog open={trashOpen} onClose={() => setTrashOpen(false)} items={trashed} onChanged={() => void reload()} />
      <InfoDialog project={info} categories={categories} onClose={() => setInfo(null)} onSaved={() => void reload()} />
      {/* apoio: botão redondo fixo no canto, longe das ações do dia a dia */}
      <button type="button" className="support-fab" aria-label="Apoiar o projeto" title="Apoiar o projeto" onClick={() => setSupportOpen(true)}>
        <LuHeart aria-hidden />
      </button>
      <Modal open={supportOpen} onClose={() => setSupportOpen(false)} title="Apoiar o projeto" width={560}>
        <SupportCard />
      </Modal>
    </div>
  );
}

function NavItem({ icon, label, count, on, onClick }: { icon?: ReactNode; label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className="lib-nav" data-on={on ? '1' : '0'} aria-current={on ? 'page' : undefined} onClick={onClick}>
      {icon && <span className="lib-nav-ico">{icon}</span>}
      <span className="lib-nav-label">{label}</span>
      <span className="lib-nav-count">{count}</span>
    </button>
  );
}

function ProjectCard({ project: p, onOpen, items, template, onUseTemplate }: { project: Project; onOpen: () => void; items: MenuItem[]; template: boolean; onUseTemplate: () => void }) {
  const first = p.slides.find((s) => slideText(s).trim()) ?? p.slides[0] ?? null;
  const filled = p.slides.filter((s) => slideText(s).trim()).length;
  return (
    <article className="pcard">
      <button type="button" className="pcard-thumb" onClick={onOpen} aria-label={`Abrir ${p.name}`}>
        <LazyMount style={{ width: '100%' }}>
          <SlideThumb slide={first} theme={p.theme} aspect={p.aspect} />
        </LazyMount>
        {filled === 0 && <span className="pcard-blank">Sem letra ainda</span>}
      </button>
      <div className="pcard-meta">
        <div className="pcard-titles">
          <h3 title={p.name}>{p.name}</h3>
          <p>{p.artist || 'Sem artista'}</p>
        </div>
        <Menu
          align="end"
          items={items}
          trigger={(isOpen, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={isOpen ? '1' : undefined} aria-label={`Mais ações para ${p.name}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle}>
              <LuEllipsis />
            </button>
          )}
        />
      </div>
      <div className="pcard-foot">
        <span>
          {filled} {filled === 1 ? 'trecho' : 'trechos'}
        </span>
        <span>{timeAgo(p.updatedAt)}</span>
        {p.category && <span className="chip">{p.category}</span>}
        {template ? (
          <Button size="sm" className="pcard-go" onClick={onUseTemplate}>
            Usar modelo
          </Button>
        ) : (
          <Button size="sm" className="pcard-go" icon={<LuMonitorPlay />} onClick={() => navigate(paths.present(p.id))} disabled={filled === 0} title={filled === 0 ? 'Adicione a letra para apresentar' : 'Abrir o modo de apresentação'}>
            Apresentar
          </Button>
        )}
      </div>
    </article>
  );
}
