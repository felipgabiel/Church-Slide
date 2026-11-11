import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuChevronLeft, LuFilm, LuRedo2, LuSparkles, LuUndo2 } from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { updateDesignInProject } from '../../core/design/apply';
import { copyDesign, MAX_LAYERS, newDesignLayer } from '../../core/design/model';
import { getProject } from '../../core/storage/projects';
import { getDesign, saveDesign } from '../../core/storage/designs';
import type { BackgroundDesign, DesignLayer, DesignLayerKind } from '../../core/types';
import { debounce } from '../../core/util';
import { Button, IconButton } from '../../ui/Button';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { toast, toastError } from '../../ui/toast';
import { ApplyDialog } from './ApplyDialog';
import { ExportLoopDialog } from './ExportLoopDialog';
import { StudioInspector } from './StudioInspector';
import { StudioLayers } from './StudioLayers';
import { StudioStage, type StudioClock } from './StudioStage';

export interface StudioApi {
  design: BackgroundDesign;
  selected: DesignLayer | null;
  select: (id: string | null) => void;
  /** altera uma cópia do fundo; `key` junta alterações seguidas (arrastar um controle) num passo só de desfazer */
  update: (fn: (d: BackgroundDesign) => void, key?: string) => void;
  patchLayer: (id: string, patch: Partial<DesignLayer>, key?: string) => void;
  addLayer: (kind: DesignLayerKind, patch?: Partial<DesignLayer>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  /** move a camada para a posição `to` da pilha (0 = a de baixo) */
  moveLayer: (id: string, to: number) => void;
}

const COALESCE_MS = 800;
const HISTORY = 100;

type Status = 'saved' | 'saving' | 'error';

export function Studio({ id, from }: { id: string; from?: string }) {
  const [design, setDesign] = useState<BackgroundDesign | null>(null);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('saved');
  const [fromName, setFromName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [, force] = useState(0);
  const past = useRef<BackgroundDesign[]>([]);
  const future = useRef<BackgroundDesign[]>([]);
  const last = useRef<{ key: string; at: number } | null>(null);
  const cur = useRef<BackgroundDesign | null>(null);
  cur.current = design;
  const clock = useRef<StudioClock | null>(null);

  // carregar
  useEffect(() => {
    let alive = true;
    void getDesign(id)
      .then((d) => {
        if (!alive) return;
        if (!d) setMissing(true);
        else {
          setDesign(d);
          setSelectedId(null);
        }
      })
      .catch(() => alive && setMissing(true));
    if (from) void getProject(from).then((p) => alive && setFromName(p?.name ?? null));
    return () => {
      alive = false;
    };
  }, [id, from]);

  // salvar sozinho (e na saída)
  const save = useMemo(
    () =>
      debounce((d: BackgroundDesign) => {
        void saveDesign(d)
          .then(() => setStatus('saved'))
          .catch(() => setStatus('error'));
      }, 450),
    [],
  );
  const dirty = useRef(false);
  dirty.current = status !== 'saved';
  useEffect(() => {
    const flush = () => {
      if (!cur.current || !dirty.current) return;
      save.cancel();
      void saveDesign(cur.current).catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush(); // saindo do estúdio: grava o que estiver pendente
    };
  }, [save]);

  const commit = useCallback(
    (next: BackgroundDesign, key?: string) => {
      const prev = cur.current;
      if (!prev) return;
      const now = performance.now();
      const merge = !!key && last.current?.key === key && now - last.current.at < COALESCE_MS;
      if (!merge) {
        past.current.push(prev);
        if (past.current.length > HISTORY) past.current.shift();
        future.current = [];
      }
      last.current = key ? { key, at: now } : null;
      cur.current = next;
      setDesign(next);
      setStatus('saving');
      save(next);
    },
    [save],
  );

  const api = useMemo<StudioApi | null>(() => {
    if (!design) return null;
    const update: StudioApi['update'] = (fn, key) => {
      const base = cur.current;
      if (!base) return;
      const next = structuredClone(base);
      fn(next);
      commit(next, key);
    };
    return {
      design,
      selected: design.layers.find((l) => l.id === selectedId) ?? null,
      select: setSelectedId,
      update,
      patchLayer: (lid, patch, key) =>
        update((d) => {
          const l = d.layers.find((x) => x.id === lid);
          if (l) Object.assign(l, patch);
        }, key ?? `layer:${lid}:${Object.keys(patch).join(',')}`),
      addLayer: (kind, patch) => {
        if ((cur.current?.layers.length ?? 0) >= MAX_LAYERS) return toast(`Use no máximo ${MAX_LAYERS} camadas por fundo.`, 'info');
        const layer = newDesignLayer(kind, patch);
        const sel = cur.current?.layers.findIndex((l) => l.id === selectedId) ?? -1;
        update((d) => {
          // entra logo acima da camada selecionada (ou no topo)
          d.layers.splice(sel >= 0 ? sel + 1 : d.layers.length, 0, layer);
        });
        setSelectedId(layer.id);
      },
      removeLayer: (lid) => {
        update((d) => {
          d.layers = d.layers.filter((l) => l.id !== lid);
        });
        if (selectedId === lid) setSelectedId(null);
      },
      duplicateLayer: (lid) => {
        const src = cur.current?.layers.find((l) => l.id === lid);
        if (!src) return;
        const copy = { ...structuredClone(src), id: newDesignLayer(src.kind).id, name: `${src.name} (cópia)` };
        update((d) => {
          const i = d.layers.findIndex((l) => l.id === lid);
          d.layers.splice(i + 1, 0, copy);
        });
        setSelectedId(copy.id);
      },
      moveLayer: (lid, to) =>
        update((d) => {
          const i = d.layers.findIndex((l) => l.id === lid);
          if (i < 0) return;
          const [l] = d.layers.splice(i, 1);
          d.layers.splice(Math.max(0, Math.min(d.layers.length, to)), 0, l);
        }),
    };
  }, [design, selectedId, commit]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !cur.current) return;
    future.current.push(cur.current);
    last.current = null;
    cur.current = prev;
    setDesign(prev);
    setStatus('saving');
    save(prev);
    force((n) => n + 1);
  }, [save]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !cur.current) return;
    past.current.push(cur.current);
    last.current = null;
    cur.current = next;
    setDesign(next);
    setStatus('saving');
    save(next);
    force((n) => n + 1);
  }, [save]);

  const back = useCallback(() => {
    if (from) navigate(paths.edit(from));
    else navigate(paths.backgrounds);
  }, [from]);

  // atalhos
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (document.querySelector('dialog[open]')) return;
      const a = apiRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (typing || !a) return;
      const sel = a.selected;
      if (mod && k === 'd' && sel) {
        e.preventDefault();
        a.duplicateLayer(sel.id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        a.removeLayer(sel.id);
      } else if (e.key === ' ') {
        e.preventDefault();
        clock.current?.toggle();
      } else if (k === 'f' && !mod) {
        e.preventDefault();
        clock.current?.fullscreen();
      } else if (e.key === 'Escape') {
        if (sel) a.select(null);
        else back();
      } else if (sel && !sel.locked && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        a.patchLayer(sel.id, { x: +(sel.x + dx).toFixed(2), y: +(sel.y + dy).toFixed(2) }, `nudge:${sel.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, back]);

  if (missing) {
    return (
      <div className="studio studio-missing">
        <div className="lib-empty">
          <h3>Este fundo não está mais aqui</h3>
          <p>Ele pode ter sido excluído, ou foi criado em outro navegador.</p>
          <Button variant="primary" onClick={() => navigate(paths.backgrounds)}>
            Ver meus fundos
          </Button>
        </div>
      </div>
    );
  }
  if (!design || !api) return <div className="studio studio-loading">Carregando…</div>;

  const applyHere = async () => {
    if (!from) return setApplying(true);
    try {
      save.cancel();
      const saved = await saveDesign(design);
      await updateDesignInProject(from, saved);
      toast(`Fundo aplicado em “${fromName ?? 'louvor'}”`);
      navigate(paths.edit(from));
    } catch {
      toastError('Não foi possível aplicar o fundo.');
    }
  };

  return (
    <div className="studio">
      <header className="tb studio-tb">
        <div className="tb-left">
          <Button variant="ghost" size="sm" icon={<LuChevronLeft />} onClick={back} title="Voltar (Esc)">
            {from ? (fromName ? `Voltar para “${fromName}”` : 'Voltar ao louvor') : 'Fundos'}
          </Button>
        </div>
        <div className="tb-center">
          <input
            className="tb-name"
            value={design.name}
            aria-label="Nome do fundo"
            spellCheck={false}
            onChange={(e) => {
              const v = e.currentTarget.value;
              api.update((d) => {
                d.name = v;
              }, 'name');
            }}
            onBlur={(e) => {
              if (!e.currentTarget.value.trim())
                api.update((d) => {
                  d.name = 'Fundo sem nome';
                });
            }}
          />
          <span className="studio-status" data-state={status} role="status">
            {status === 'saved' ? 'Salvo' : status === 'saving' ? 'Salvando…' : 'Não foi possível salvar'}
          </span>
        </div>
        <div className="tb-right">
          <IconButton label="Desfazer (Ctrl+Z)" icon={<LuUndo2 />} size="sm" disabled={!past.current.length} onClick={undo} />
          <IconButton label="Refazer (Ctrl+Shift+Z)" icon={<LuRedo2 />} size="sm" disabled={!future.current.length} onClick={redo} />
          <ThemeToggle />
          <Button variant="ghost" size="sm" icon={<LuFilm />} onClick={() => setExporting(true)} title="Exportar só o fundo, sem letra, em MP4">
            Exportar vídeo
          </Button>
          <Button variant="primary" size="sm" icon={<LuSparkles />} onClick={() => void applyHere()}>
            {from ? 'Aplicar neste louvor' : 'Usar num louvor'}
          </Button>
        </div>
      </header>

      {status === 'error' && (
        <div className="studio-alert" role="alert">
          Não foi possível salvar neste navegador. Exporte o fundo em vídeo para não perder o trabalho.
        </div>
      )}

      <aside className="studio-left" aria-label="Camadas">
        <StudioLayers api={api} />
      </aside>
      <main className="studio-center">
        <StudioStage api={api} clockRef={clock} />
      </main>
      <aside className="studio-right" aria-label="Ajustes">
        <StudioInspector api={api} />
      </aside>

      <ExportLoopDialog design={exporting ? design : null} onClose={() => setExporting(false)} />
      <ApplyDialog design={applying ? design : null} onClose={() => setApplying(false)} />
    </div>
  );
}

/** Duplica um fundo de "Meus fundos" e abre a cópia (usado pelo editor de letras). */
export async function openCopyInStudio(d: BackgroundDesign, from?: string) {
  const c = await saveDesign(copyDesign(d, { name: d.name }));
  navigate(paths.studio(c.id, from));
}
