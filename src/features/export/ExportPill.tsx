import { LuCheck, LuDownload, LuLoaderCircle, LuTriangleAlert, LuX } from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { zipClips, type ClipResult } from '../../core/export/exportSong';
import { downloadBlob } from '../../core/storage/exchange';
import { useStore } from '../../store/createStore';
import { toastError } from '../../ui/toast';
import { cancelJob, clearJob, exportJobs, markSeen } from './exportJob';
import { tr } from '../../core/i18n';

/**
 * Aviso flutuante da exportação em segundo plano: aparece quando o diálogo está fechado.
 * Mostra o progresso em qualquer tela e, no fim, deixa baixar dali mesmo.
 */
export function ExportPill() {
  const job = useStore(exportJobs, (s) => s.job);
  const dialog = useStore(exportJobs, (s) => s.dialog);
  if (!job || dialog === job.kind || (job.status === 'done' && job.seen)) return null;

  const pct = job.progress ? Math.round(((job.progress.index + job.progress.fraction) / Math.max(1, job.progress.total)) * 100) : 0;
  const open = () => {
    if (job.kind === 'song') {
      navigate(paths.edit(job.ownerId));
      // o editor abre o diálogo de exportação quando estiver pronto
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('cs:open-export')), 60);
    } else navigate(paths.studio(job.ownerId));
  };
  const download = async () => {
    try {
      if (job.kind === 'song') downloadBlob(await zipClips(job.files as ClipResult[]), job.zipName ?? 'videos.zip');
      else if (job.files[0]) downloadBlob(job.files[0].blob, job.files[0].name);
      markSeen();
    } catch {
      toastError(tr('Não foi possível baixar.'));
    }
  };

  return (
    <div className="xpill" role="status" aria-live="polite" data-state={job.status}>
      <span className="xpill-ico" aria-hidden>
        {job.status === 'running' ? <LuLoaderCircle className="spin" /> : job.status === 'done' ? <LuCheck /> : <LuTriangleAlert />}
      </span>
      <div className="xpill-body">
        <b>
          {job.status === 'running'
            ? job.kind === 'song'
              ? tr('Gerando vídeos de “{0}”', job.title)
              : tr('Gerando o fundo “{0}”', job.title)
            : job.status === 'done'
              ? job.kind === 'song'
                ? `${job.files.length} ${job.files.length === 1 ? tr('vídeo pronto') : tr('vídeos prontos')}: “${job.title}”`
                : tr('Vídeo do fundo pronto: “{0}”', job.title)
              : tr('Não deu para gerar “{0}”', job.title)}
        </b>
        {job.status === 'running' && (
          <>
            <span className="xpill-bar">
              <i style={{ width: `${pct}%` }} />
            </span>
            <small>{job.progress ? tr('{0} de {1} · {2}%', job.progress.index + 1, job.progress.total, pct) : tr('Preparando…')}</small>
          </>
        )}
        {job.status === 'error' && <small>{job.error}</small>}
      </div>
      <div className="xpill-actions">
        {job.status === 'done' && (
          <button type="button" className="xpill-main" onClick={() => void download()}>
            <LuDownload aria-hidden /> {job.kind === 'song' ? tr('Baixar .zip') : tr('Baixar')}
          </button>
        )}
        {job.status !== 'error' && (
          <button type="button" className="xpill-link" onClick={open}>
            {tr('Abrir')}
          </button>
        )}
        {job.status === 'running' ? (
          <button type="button" className="xpill-link" onClick={() => cancelJob()}>
            {tr('Cancelar')}
          </button>
        ) : (
          <button type="button" className="xpill-x" aria-label={tr('Fechar aviso')} onClick={() => (job.status === 'done' ? markSeen() : clearJob())}>
            <LuX />
          </button>
        )}
      </div>
    </div>
  );
}
