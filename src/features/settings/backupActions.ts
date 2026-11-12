import { tr } from '../../core/i18n';
import { writeSetting } from '../../core/settings';
import { backupFileName, buildBackup, LAST_BACKUP_SETTING, restoreBackup } from '../../core/storage/backup';
import { downloadBlob } from '../../core/storage/exchange';
import { formatBytes } from '../../core/util';
import { confirmDialog, toast, toastError } from '../../ui/toast';

/** Gera e baixa o backup de tudo; guarda a data para lembrar a pessoa depois. */
export async function downloadBackup(onProgress?: (f: number) => void): Promise<boolean> {
  try {
    const { blob, summary } = await buildBackup(onProgress);
    downloadBlob(blob, backupFileName());
    writeSetting(LAST_BACKUP_SETTING, Date.now());
    toast(tr('Backup baixado: {0} louvores, {1} fundos e {2} arquivos ({3}). Guarde num pendrive ou na nuvem.', summary.projects, summary.designs, summary.media, formatBytes(summary.bytes)), 'ok');
    return true;
  } catch (err) {
    console.error(err);
    toastError(err instanceof Error && err.message ? err.message : tr('Não foi possível gerar o backup.'));
    return false;
  }
}

/** Pergunta, restaura (mescla) e oferece recarregar para tudo aparecer. */
export async function restoreFromFile(file: File, onProgress?: (f: number) => void): Promise<boolean> {
  const ok = await confirmDialog({
    title: tr('Restaurar este backup?'),
    message: tr('O que falta neste computador será trazido do arquivo. Louvores e fundos que existem nos dois ficam com a versão editada por último. Nada é apagado.'),
    confirmLabel: tr('Restaurar'),
  });
  if (!ok) return false;
  try {
    const r = await restoreBackup(file, onProgress);
    const again = await confirmDialog({
      title: tr('Backup restaurado'),
      message: tr('{0} louvores novos e {1} atualizados, {2} fundos novos e {3} atualizados, {4} arquivos de mídia. Recarregue a página para ver tudo.', r.projectsAdded, r.projectsUpdated, r.designsAdded, r.designsUpdated, r.media),
      confirmLabel: tr('Recarregar a página'),
    });
    if (again) location.reload();
    return true;
  } catch (err) {
    console.error(err);
    toastError(err instanceof Error && err.message ? err.message : tr('Não foi possível restaurar o backup.'));
    return false;
  }
}
