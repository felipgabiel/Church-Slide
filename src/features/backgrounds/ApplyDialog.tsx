import { useEffect, useMemo, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { applyDesignToProject } from '../../core/design/apply';
import { listProjects } from '../../core/storage/projects';
import type { BackgroundDesign, Project } from '../../core/types';
import { timeAgo } from '../../core/util';
import { SlideThumb } from '../../render/SlideThumb';
import { LazyMount } from '../../ui/LazyMount';
import { Modal } from '../../ui/Modal';
import { toast, toastError } from '../../ui/toast';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Usar num louvor": escolhe o louvor, aplica uma cópia do fundo em todos os trechos e abre o editor. */
export function ApplyDialog({ design, onClose }: { design: BackgroundDesign | null; onClose: () => void }) {
  const [items, setItems] = useState<Project[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!design) return;
    setQ('');
    void listProjects()
      .then((all) => setItems(all.filter((p) => !p.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt)))
      .catch(() => setItems([]));
  }, [design]);
  const visible = useMemo(() => (items ?? []).filter((p) => !q.trim() || norm(`${p.name} ${p.artist}`).includes(norm(q.trim()))), [items, q]);

  const apply = async (p: Project) => {
    if (!design || busy) return;
    setBusy(true);
    try {
      await applyDesignToProject(p.id, design);
      toast(`Fundo aplicado em “${p.name}”`);
      onClose();
      navigate(paths.edit(p.id));
    } catch {
      toastError('Não foi possível aplicar o fundo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!design} onClose={onClose} title="Usar num louvor" description="O fundo vai para todos os trechos do louvor escolhido. Cada louvor guarda a própria cópia." width={560}>
      <label className="apply-search">
        <LuSearch aria-hidden />
        <input type="search" placeholder="Buscar louvor" value={q} onChange={(e) => setQ(e.currentTarget.value)} aria-label="Buscar louvor" autoFocus />
      </label>
      <ul className="apply-list" aria-busy={busy}>
        {items === null && <li className="apply-empty">Carregando…</li>}
        {items && visible.length === 0 && <li className="apply-empty">{items.length ? 'Nenhum louvor encontrado.' : 'Você ainda não tem louvores. Crie um na biblioteca.'}</li>}
        {visible.map((p) => (
          <li key={p.id}>
            <button type="button" className="apply-item" disabled={busy} onClick={() => void apply(p)}>
              <span className="apply-thumb">
                <LazyMount style={{ width: '100%' }}>
                  <SlideThumb slide={p.slides[0] ?? null} theme={p.theme} aspect={p.aspect} />
                </LazyMount>
              </span>
              <span className="apply-names">
                <b>{p.name}</b>
                <span>
                  {p.isTemplate ? 'Modelo' : p.artist || 'Sem artista'} · {timeAgo(p.updatedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
