import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SupportCard } from '../support/SupportCard';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { SettingsButton } from '../settings/Settings';
import {
  LuArchive,
  LuClock3,
  LuHash,
  LuLayoutGrid,
  LuList,
  LuPlay,
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
  LuPalette,
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
import { Button, IconButton } from '../../ui/Button';
import { useSetting } from '../../core/settings';
import { hexToHsv, hsvToHex, normalizeHex } from '../../core/colorMath';
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
import { Gallery, startFromStarter } from '../backgrounds/Gallery';
import { useDesigns } from '../backgrounds/useDesigns';
import { STARTERS } from '../../core/design/starters';
import { tr } from '../../core/i18n';

type Filter = { kind: 'all' } | { kind: 'templates' } | { kind: 'category'; name: string } | { kind: 'none' };
type Sort = 'recent' | 'name';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Library({ section = 'songs' }: { section?: 'songs' | 'backgrounds' }) {
  const designs = useDesigns();
  const inBg = section === 'backgrounds';
  const { projects, loading, error, reload } = useProjects();
  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState<Filter>({ kind: 'all' });
  // na seção Fundos, clicar em Louvores/Modelos/categorias volta para a lista de louvores
  const setFilter = (f: Filter) => {
    setFilterState(f);
    if (inBg) navigate(paths.library);
  };
  const [sort, setSort] = useState<Sort>('recent');
  const [newOpen, setNewOpen] = useState(false);
  const [newTheme, setNewTheme] = useState('impacto');
  const [trashOpen, setTrashOpen] = useState(false);
  const [info, setInfo] = useState<Project | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [view, setView] = useSetting<'list' | 'grid'>('lib-view', 'list');
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
        toast(tr('“{0}” importado', last.name));
      } catch (err) {
        toastError(err instanceof Error ? err.message : tr('Não foi possível importar {0}.', f.name));
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    await reload();
    if (last && files.length === 1) open(last);
  };

  const actionsFor = (p: Project): MenuItem[] => [
    { label: tr('Abrir no editor'), icon: <LuFolderOpen />, onClick: () => open(p) },
    { label: tr('Informações…'), icon: <LuPencil />, onClick: () => setInfo(p) },
    {
      label: tr('Duplicar'),
      icon: <LuCopy />,
      onClick: async () => {
        try {
          const c = await duplicateProject(p.id);
          toast(c ? tr('“{0}” criado', c.name) : tr('Projeto não encontrado'));
          await reload();
        } catch {
          toastError(tr('Não foi possível duplicar.'));
        }
      },
    },
    {
      label: tr('Salvar como modelo…'),
      icon: <LuLayoutTemplate />,
      disabled: p.isTemplate,
      onClick: async () => {
        const name = await promptDialog({ title: tr('Salvar como modelo'), label: tr('Nome do modelo'), value: `${p.name} (modelo)` });
        if (!name) return;
        await saveAsTemplate(p.id, name);
        toast(tr('Modelo salvo. Ele aparece ao criar um novo louvor.'));
        await reload();
      },
    },
    {
      label: tr('Exportar arquivo'),
      icon: <LuDownload />,
      hint: '.json',
      onClick: async () => {
        try {
          downloadBlob(await exportProject(p), exportFileName(p));
        } catch {
          toastError(tr('Não foi possível exportar o projeto.'));
        }
      },
    },
    {
      label: tr('Restaurar cópia de segurança…'),
      icon: <LuHistory />,
      onClick: async () => {
        const snap = await readSnapshot(p.id);
        if (!snap) return toast(tr('Este projeto ainda não tem cópia de segurança.'), 'info');
        const ok = await confirmDialog({
          title: tr('Restaurar cópia de segurança?'),
          message: tr('O projeto voltará ao estado salvo {0} ({1} trechos). As alterações feitas depois serão substituídas.', timeAgo(snap.savedAt), snap.project.slides.length),
          confirmLabel: tr('Restaurar'),
        });
        if (!ok) return;
        await restoreFromSnapshot(p.id);
        toast(tr('Cópia de segurança restaurada'));
        await reload();
      },
    },
    { divider: true },
    {
      label: tr('Mover para a lixeira'),
      icon: <LuTrash2 />,
      danger: true,
      onClick: async () => {
        await trashProject(p.id);
        toast(tr('“{0}” foi para a lixeira', p.name), 'info');
        await reload();
      },
    },
  ];

  const heading = filter.kind === 'templates' ? tr('Modelos') : filter.kind === 'category' ? filter.name : filter.kind === 'none' ? tr('Sem categoria') : tr('Todos os louvores');
  // tela de início (saudação + recentes) só na visão geral, sem busca
  const home = filter.kind === 'all' && !query.trim();
  const recent = useMemo(() => [...songs].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 4), [songs]);
  const totalSlides = useMemo(() => songs.reduce((n, p) => n + p.slides.filter((sl) => slideText(sl).trim()).length, 0), [songs]);
  // a luz do topo vem das cores do louvor mais recente (como a capa do disco no Spotify)
  const glow = useMemo(() => glowColors(recent.find((p) => vivid(glowColors(p))) ?? null).map(lift) as [string, string], [recent]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startNew = () => {
    setNewTheme('impacto');
    setNewOpen(true);
  };

  return (
    <div className="lib">
      <aside className="lib-side" aria-label={tr('Navegação')}>
        <div className="lib-brand">
          <Wordmark />
        </div>
        <nav className="lib-nav-group">
          <NavItem icon={<LuLibrary />} label={tr('Louvores')} count={songs.length} on={!inBg && filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })} />
          <NavItem icon={<LuLayoutTemplate />} label={tr('Modelos')} count={templates.length} on={!inBg && filter.kind === 'templates'} onClick={() => setFilter({ kind: 'templates' })} />
          <NavItem icon={<LuPalette />} label={tr('Fundos')} count={designs.items.length} on={inBg} onClick={() => navigate(paths.backgrounds)} />
        </nav>
        {(categories.length > 0 || uncategorized > 0) && (
          <nav className="lib-nav-group lib-cats" aria-label={tr('Categorias')}>
            <h3>{tr('Categorias')}</h3>
            {categories.map((c) => (
              <NavItem key={c} icon={<LuHash />} label={c} count={songs.filter((p) => p.category.trim() === c).length} on={!inBg && filter.kind === 'category' && filter.name === c} onClick={() => setFilter({ kind: 'category', name: c })} />
            ))}
            {uncategorized > 0 && categories.length > 0 && <NavItem icon={<LuHash />} label={tr('Sem categoria')} count={uncategorized} on={!inBg && filter.kind === 'none'} onClick={() => setFilter({ kind: 'none' })} />}
          </nav>
        )}
        <div className="lib-side-foot">
          <button type="button" className="lib-nav" onClick={() => setTrashOpen(true)}>
            <span className="lib-nav-ico">
              <LuArchive />
            </span>
            <span className="lib-nav-label">{tr('Lixeira')}</span>
            {trashed.length > 0 && <span className="lib-nav-count">{trashed.length}</span>}
          </button>
          <p className="lib-status" data-state={storageMode === 'memory' ? 'bad' : offline === 'ready' ? 'ok' : 'idle'}>
            <i aria-hidden />
            {storageMode === 'memory' ? tr('Armazenamento indisponível') : offline === 'ready' ? tr('Neste computador · funciona offline') : tr('Guardado neste computador')}
          </p>
        </div>
      </aside>

      <main className="lib-main" style={{ '--glow-a': glow[0], '--glow-b': glow[1] } as CSSProperties}>
        <div className="lib-atmos" aria-hidden />
        <header className="lib-bar">
          <label className="lib-search">
            <LuSearch aria-hidden />
            <input ref={searchRef} type="search" placeholder={inBg ? tr('Buscar nos meus fundos') : tr('Buscar louvor, artista ou trecho da letra')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} aria-label={inBg ? tr('Buscar fundos') : tr('Buscar louvores')} />
            {!query && <kbd aria-hidden>/</kbd>}
          </label>
          <div className="lib-bar-actions">
            <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(e) => void doImport(e.currentTarget.files)} />
            <SettingsButton />
            <ThemeToggle />
            {inBg ? (
              <Button variant="primary" icon={<LuPlus />} onClick={() => void startFromStarter(STARTERS[STARTERS.length - 1])}>
                {tr('Novo fundo')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" icon={<LuUpload />} onClick={() => fileRef.current?.click()}>
                  {tr('Importar')}
                </Button>
                <Button variant="primary" icon={<LuPlus />} onClick={startNew}>
                  {tr('Novo louvor')}
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="lib-content">
          {inBg && <Gallery query={query} />}
          {!inBg && storageMode === 'memory' && (
            <div className="lib-banner" role="alert">
              <LuWifiOff aria-hidden />
              {tr('Este navegador bloqueou o armazenamento local (navegação privada?). Os projetos só existem enquanto esta aba estiver aberta. Use “Exportar” para guardar uma cópia.')}
            </div>
          )}

          {!inBg && home && !loading && !error && (
            <section className="lib-hello" aria-label={tr('Início')}>
              <h1>{greeting()}</h1>
              <p>
                {songs.length === 0
                  ? tr('Cole a letra de um louvor e veja como ele fica no telão em poucos minutos.')
                  : tr('{0} {1} · {2} {3} para o telão', songs.length, songs.length === 1 ? tr('louvor') : tr('louvores'), totalSlides, totalSlides === 1 ? tr('trecho pronto') : tr('trechos prontos'))}
              </p>
            </section>
          )}

          {!inBg && home && recent.length > 0 && !error && (
            <section className="lib-recent" aria-labelledby="lib-recent-h">
              <h2 id="lib-recent-h">{tr('Continue de onde parou')}</h2>
              <div className="lib-recent-row">
                {recent.map((p) => (
                  <RecentCard key={p.id} project={p} onOpen={() => open(p)} />
                ))}
              </div>
            </section>
          )}

          {!inBg && (
          <section className="lib-all" aria-labelledby="lib-all-h">
            <div className="lib-head">
              <h2 id="lib-all-h">{query.trim() ? tr('Resultados') : heading}</h2>
              <span className="lib-count">{visible.length}</span>
              <div className="lib-tools">
                <div className="lib-sort">
                  <Select value={sort} onChange={(v) => setSort(v as Sort)} label={tr('Ordenar')}>
                    <option value="recent">{tr('Editados recentemente')}</option>
                    <option value="name">{tr('Nome (A–Z)')}</option>
                  </Select>
                </div>
                <div className="lib-view" role="group" aria-label={tr('Exibição')}>
                  <IconButton label={tr('Lista')} icon={<LuList />} size="sm" active={view === 'list'} onClick={() => setView('list')} />
                  <IconButton label={tr('Grade')} icon={<LuLayoutGrid />} size="sm" active={view === 'grid'} onClick={() => setView('grid')} />
                </div>
              </div>
            </div>

            {error && (
              <div className="empty">
                <h3>{tr('Não foi possível carregar os projetos')}</h3>
                <p>{error}</p>
                <Button onClick={() => void reload()}>{tr('Tentar novamente')}</Button>
              </div>
            )}

            {!error && loading && <div className="empty">{tr('Carregando…')}</div>}

            {!error && !loading && visible.length === 0 && (
              <div className="lib-empty">
                <LuMusic aria-hidden />
                {songs.length === 0 && filter.kind === 'all' && !query ? (
                  <>
                    <h3>{tr('Comece pelo primeiro louvor')}</h3>
                    <p>{tr('Cole a letra, escolha um visual e veja como fica no telão em poucos minutos.')}</p>
                    <Button variant="primary" size="lg" icon={<LuPlus />} onClick={() => setNewOpen(true)}>
                      {tr('Criar louvor')}
                    </Button>
                  </>
                ) : (
                  <>
                    <h3>{tr('Nada encontrado')}</h3>
                    <p>{query ? tr('Nenhum resultado para “{0}”.', query) : tr('Não há itens neste filtro.')}</p>
                    {query && <Button onClick={() => setQuery('')}>{tr('Limpar busca')}</Button>}
                  </>
                )}
              </div>
            )}

            {!error && visible.length > 0 && view === 'list' && (
              <table className="lib-table">
                <thead>
                  <tr>
                    <th className="c-n" scope="col">
                      #
                    </th>
                    <th scope="col">{tr('Título')}</th>
                    <th className="c-cat" scope="col">
                      {tr('Categoria')}
                    </th>
                    <th className="c-num" scope="col">
                      {tr('Trechos')}
                    </th>
                    <th className="c-when" scope="col">
                      <LuClock3 aria-label={tr('Editado')} />
                    </th>
                    <th className="c-act" scope="col">
                      <span className="sr-only">{tr('Ações')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, i) => (
                    <ProjectRow
                      key={p.id}
                      n={i + 1}
                      project={p}
                      onOpen={() => open(p)}
                      items={actionsFor(p)}
                      template={filter.kind === 'templates'}
                      onUseTemplate={() => {
                        setNewTheme(`tpl:${p.id}`);
                        setNewOpen(true);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}

            {!error && visible.length > 0 && view === 'grid' && (
              <div className="lib-grid">
                {visible.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onOpen={() => open(p)}
                    items={actionsFor(p)}
                    template={filter.kind === 'templates'}
                    onUseTemplate={() => {
                      setNewTheme(`tpl:${p.id}`);
                      setNewOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
          )}
        </div>
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
      <button type="button" className="support-fab" aria-label={tr('Apoiar o projeto')} title={tr('Apoiar o projeto')} onClick={() => setSupportOpen(true)}>
        <LuHeart aria-hidden />
      </button>
      <Modal open={supportOpen} onClose={() => setSupportOpen(false)} title={tr('Apoiar o projeto')} width={560}>
        <SupportCard />
      </Modal>
    </div>
  );
}

/** "Bom dia", "Boa tarde" ou "Boa noite", pelo relógio do computador. */
function greeting(d = new Date()): string {
  const h = d.getHours();
  return h >= 5 && h < 12 ? tr('Bom dia') : h >= 12 && h < 18 ? tr('Boa tarde') : tr('Boa noite');
}

/** Duas cores para a luz do topo: as do fundo do louvor mais recente (ou o teal da marca). */
function glowColors(p: Project | null): [string, string] {
  const fallback: [string, string] = ['#1f6f78', '#123a4a'];
  if (!p) return fallback;
  const bg = p.slides.find((sl) => sl.background)?.background ?? p.theme.background;
  const stops = [...(bg.gradient?.stops ?? [])].sort((x, y) => x.at - y.at).map((x) => x.color);
  if (bg.kind === 'solid') return [bg.color, bg.color];
  if (stops.length >= 2) return [stops[0], stops[stops.length - 1]];
  return stops.length ? [stops[0], bg.color] : fallback;
}

/** As cores têm cor de verdade? (fundo preto/cinza não dá luz nenhuma: aí usa o próximo recente ou o teal) */
function vivid([a, b]: [string, string]): boolean {
  const sat = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const bl = n & 255;
    const max = Math.max(r, g, bl);
    return max < 24 ? 0 : (max - Math.min(r, g, bl)) / max;
  };
  return Math.max(sat(a), sat(b)) > 0.35;
}

/** Fundos de louvor costumam ser escuros: a luz usa o mesmo tom, mas com brilho suficiente para aparecer. */
function lift(hex: string): string {
  const n = normalizeHex(hex);
  if (!n) return hex;
  const c = hexToHsv(n);
  return hsvToHex({ ...c, v: Math.max(c.v, 0.62), s: Math.min(1, c.s * 1.05) });
}

/** Miniatura do primeiro trecho com letra. */
function firstSlide(p: Project) {
  return p.slides.find((sl) => slideText(sl).trim()) ?? p.slides[0] ?? null;
}

function RecentCard({ project: p, onOpen }: { project: Project; onOpen: () => void }) {
  const filled = p.slides.filter((sl) => slideText(sl).trim()).length;
  return (
    <article className="rcard">
      <div className="rcard-media">
        <button type="button" className="rcard-thumb" onClick={onOpen} aria-label={tr('Abrir {0}', p.name)}>
          <LazyMount style={{ width: '100%' }}>
            <SlideThumb slide={firstSlide(p)} theme={p.theme} aspect={p.aspect} />
          </LazyMount>
        </button>
        {filled > 0 && (
          <button type="button" className="rcard-play" aria-label={tr('Apresentar {0}', p.name)} title={tr('Apresentar')} onClick={() => navigate(paths.present(p.id))}>
            <LuPlay aria-hidden />
          </button>
        )}
      </div>
      <button type="button" className="rcard-text" tabIndex={-1} onClick={onOpen}>
        <span className="rcard-title">{p.name}</span>
        <span className="rcard-sub">
          {p.artist || `${filled} ${filled === 1 ? tr('trecho') : tr('trechos')}`} · {timeAgo(p.updatedAt)}
        </span>
      </button>
    </article>
  );
}

function ProjectRow({ n, project: p, onOpen, items, template, onUseTemplate }: { n: number; project: Project; onOpen: () => void; items: MenuItem[]; template: boolean; onUseTemplate: () => void }) {
  const filled = p.slides.filter((sl) => slideText(sl).trim()).length;
  return (
    <tr className="lrow" onDoubleClick={onOpen}>
      <td className="c-n">{n}</td>
      <td className="c-title">
        <button type="button" className="lrow-open" onClick={onOpen} aria-label={tr('Abrir {0}', p.name)}>
          <span className="lrow-thumb">
            <LazyMount style={{ width: '100%' }}>
              <SlideThumb slide={firstSlide(p)} theme={p.theme} aspect={p.aspect} />
            </LazyMount>
          </span>
          <span className="lrow-names">
            <b>{p.name}</b>
            <span>{p.artist || tr('Sem artista')}</span>
          </span>
        </button>
      </td>
      <td className="c-cat">{p.category || <span className="muted">—</span>}</td>
      <td className="c-num">{filled}</td>
      <td className="c-when">{timeAgo(p.updatedAt)}</td>
      <td className="c-act">
        <span className="lrow-actions">
          {template ? (
            <Button size="sm" variant="ghost" className="lib-go" onClick={onUseTemplate}>
              {tr('Usar modelo')}
            </Button>
          ) : (
            <IconButton label={filled ? tr('Apresentar {0}', p.name) : tr('Adicione a letra para apresentar')} icon={<LuMonitorPlay />} size="sm" className="lib-go" disabled={!filled} onClick={() => navigate(paths.present(p.id))} />
          )}
          <Menu
            align="end"
            items={items}
            trigger={(isOpen, toggle) => (
              <button type="button" className="ibtn ibtn-sm" data-active={isOpen ? '1' : undefined} aria-label={tr('Mais ações para {0}', p.name)} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle}>
                <LuEllipsis />
              </button>
            )}
          />
        </span>
      </td>
    </tr>
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
      <button type="button" className="pcard-thumb" onClick={onOpen} aria-label={tr('Abrir {0}', p.name)}>
        <LazyMount style={{ width: '100%' }}>
          <SlideThumb slide={first} theme={p.theme} aspect={p.aspect} />
        </LazyMount>
        {filled === 0 && <span className="pcard-blank">{tr('Sem letra ainda')}</span>}
      </button>
      <div className="pcard-meta">
        <div className="pcard-titles">
          <h3 title={p.name}>{p.name}</h3>
          <p>{p.artist || tr('Sem artista')}</p>
        </div>
        <Menu
          align="end"
          items={items}
          trigger={(isOpen, toggle) => (
            <button type="button" className="ibtn ibtn-sm" data-active={isOpen ? '1' : undefined} aria-label={tr('Mais ações para {0}', p.name)} aria-haspopup="menu" aria-expanded={isOpen} onClick={toggle}>
              <LuEllipsis />
            </button>
          )}
        />
      </div>
      <div className="pcard-foot">
        <span>
          {filled} {filled === 1 ? tr('trecho') : tr('trechos')}
        </span>
        <span>{timeAgo(p.updatedAt)}</span>
        {p.category && <span className="chip">{p.category}</span>}
        {template ? (
          <Button size="sm" className="pcard-go lib-go" onClick={onUseTemplate}>
            {tr('Usar modelo')}
          </Button>
        ) : (
          <Button size="sm" className="pcard-go lib-go" icon={<LuMonitorPlay />} onClick={() => navigate(paths.present(p.id))} disabled={filled === 0} title={filled === 0 ? tr('Adicione a letra para apresentar') : tr('Abrir o modo de apresentação')}>
            {tr('Apresentar')}
          </Button>
        )}
      </div>
    </article>
  );
}
