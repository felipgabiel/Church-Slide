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
import { tr } from '../../core/i18n';

export function TrashDialog({ open, onClose, items, onChanged }: { open: boolean; onClose: () => void; items: Project[]; onChanged: () => void }) {
  const restore = async (p: Project) => {
    try {
      await restoreProject(p.id);
      toast(tr('“{0}” voltou para a biblioteca', p.name));
      onChanged();
    } catch {
      toastError(tr('Não foi possível restaurar o projeto.'));
    }
  };
  const purge = async (p: Project) => {
    if (!(await confirmDialog({ title: tr('Excluir definitivamente?'), message: tr('“{0}” será apagado e não poderá ser recuperado.', p.name), confirmLabel: tr('Excluir'), danger: true }))) return;
    await purgeProject(p.id);
    onChanged();
  };
  const empty = async () => {
    if (!(await confirmDialog({ title: tr('Esvaziar a lixeira?'), message: tr('{0} {1} para sempre.', items.length, items.length === 1 ? tr('projeto será apagado') : tr('projetos serão apagados')), confirmLabel: tr('Esvaziar'), danger: true }))) return;
    await Promise.all(items.map((p) => purgeProject(p.id)));
    onChanged();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('Lixeira')}
      description={tr('Projetos excluídos ficam aqui até você esvaziar a lixeira.')}
      width={560}
      footer={
        <>
          <Button variant="danger" onClick={empty} disabled={!items.length}>
            {tr('Esvaziar lixeira')}
          </Button>
          <Button onClick={onClose}>{tr('Fechar')}</Button>
        </>
      }
    >
      {items.length === 0 ? (
        <div className="empty">
          <p>{tr('A lixeira está vazia.')}</p>
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
                  {p.slides.length} {p.slides.length === 1 ? tr('trecho') : tr('trechos')}{' '}{tr('· excluído')}{' '}{timeAgo(p.deletedAt ?? p.updatedAt)}
                </span>
              </div>
              <Button size="sm" icon={<LuArchiveRestore />} onClick={() => restore(p)}>
                {tr('Restaurar')}
              </Button>
              <Button size="sm" variant="ghost" icon={<LuTrash2 />} onClick={() => purge(p)} aria-label={tr('Excluir {0} definitivamente', p.name)} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
