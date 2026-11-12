import { LuArchiveRestore, LuTrash2 } from 'react-icons/lu';
import { purgeProject, restoreProject } from '../../core/storage/projects';
import type { Project } from '../../core/types';
import { timeAgo } from '../../core/util';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { LazyMount } from '../../ui/LazyMount';
import { SlideThumb } from '../../render/SlideThumb';
import { slideText } from '../../core/defaults';
import { confirmDialog, toast, toastError } from '../../ui/toast';

export function TrashDialog({ open, onClose, items, onChanged }: { open: boolean; onClose: () => void; items: Project[]; onChanged: () => void }) {
  const restore = async (p: Project) => {
    try {
      await restoreProject(p.id);
      toast(`“${p.name}” voltou para a biblioteca`);
      onChanged();
    } catch {
      toastError('Não foi possível restaurar o projeto.');
    }
  };
  const purge = async (p: Project) => {
    if (!(await confirmDialog({ title: 'Excluir definitivamente?', message: `“${p.name}” será apagado e não poderá ser recuperado.`, confirmLabel: 'Excluir', danger: true }))) return;
    await purgeProject(p.id);
    onChanged();
  };
  const empty = async () => {
    if (!(await confirmDialog({ title: 'Esvaziar a lixeira?', message: `${items.length} ${items.length === 1 ? 'projeto será apagado' : 'projetos serão apagados'} para sempre.`, confirmLabel: 'Esvaziar', danger: true }))) return;
    await Promise.all(items.map((p) => purgeProject(p.id)));
    onChanged();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lixeira"
      description="Projetos excluídos ficam aqui até você esvaziar a lixeira."
      width={560}
      footer={
        <>
          <Button variant="danger" onClick={empty} disabled={!items.length}>
            Esvaziar lixeira
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      {items.length === 0 ? (
        <div className="empty">
          <p>A lixeira está vazia.</p>
        </div>
      ) : (
        <ul className="trash-list">
          {items.map((p) => (
            <li key={p.id}>
              <LazyMount className="trash-thumb">
                <SlideThumb slide={p.slides.find((sl) => slideText(sl).trim()) ?? p.slides[0] ?? null} theme={p.theme} aspect={p.aspect} />
              </LazyMount>
              <div>
                <strong>{p.name}</strong>
                <span>
                  {p.artist ? `${p.artist} · ` : ''}
                  {p.slides.length} {p.slides.length === 1 ? 'trecho' : 'trechos'} · excluído {timeAgo(p.deletedAt ?? p.updatedAt)}
                </span>
              </div>
              <Button size="sm" icon={<LuArchiveRestore />} onClick={() => restore(p)}>
                Restaurar
              </Button>
              <Button size="sm" variant="ghost" icon={<LuTrash2 />} onClick={() => purge(p)} aria-label={`Excluir ${p.name} definitivamente`} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
