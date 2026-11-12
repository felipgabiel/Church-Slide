import { ExportAbort } from '../../core/export/encode';
import { createStore, useStore } from '../../store/createStore';

/**
 * Exportação de vídeos que continua em segundo plano: roda fora do diálogo (fechar não cancela),
 * fora da tela atual (dá para voltar à biblioteca) e com a aba escondida. Uma por vez.
 */
export interface JobFile {
  name: string;
  blob: Blob;
  /** trecho de origem (vídeos do louvor) */
  slideId?: string;
}

export interface JobProgress {
  index: number;
  total: number;
  name: string;
  fraction: number;
}

export interface ExportJobState {
  id: number;
  kind: 'song' | 'loop';
  /** louvor ou fundo de onde veio */
  ownerId: string;
  title: string;
  status: 'running' | 'done' | 'error';
  progress: JobProgress | null;
  files: JobFile[];
  error: string | null;
  /** nome do .zip (louvor) */
  zipName?: string;
  /** a pessoa já viu o resultado (some o aviso flutuante) */
  seen: boolean;
}

export const exportJobs = createStore<{ job: ExportJobState | null; dialog: 'song' | 'loop' | null }>({ job: null, dialog: null });
export const useExportJob = () => useStore(exportJobs, (s) => s.job);

let controller: AbortController | null = null;
let seq = 0;
const baseTitle = typeof document !== 'undefined' ? document.title : '';

const patch = (p: Partial<ExportJobState>) => {
  const job = exportJobs.get().job;
  if (job) exportJobs.set({ job: { ...job, ...p } });
};

export interface JobRunner {
  signal: AbortSignal;
  progress: (p: JobProgress) => void;
  file: (f: JobFile) => void;
}

/** Começa um trabalho. Devolve false se já houver outro rodando. */
export function startJob(meta: Pick<ExportJobState, 'kind' | 'ownerId' | 'title' | 'zipName'>, run: (r: JobRunner) => Promise<JobFile[]>): boolean {
  if (exportJobs.get().job?.status === 'running') return false;
  const ac = new AbortController();
  controller = ac;
  const id = ++seq;
  exportJobs.set({ job: { id, ...meta, status: 'running', progress: null, files: [], error: null, seen: false } });
  const mine = () => exportJobs.get().job?.id === id;
  void run({
    signal: ac.signal,
    progress: (p) => mine() && patch({ progress: p }),
    file: (f) => {
      const job = exportJobs.get().job;
      if (job?.id === id) patch({ files: [...job.files, f] });
    },
  })
    .then((files) => {
      if (!mine()) return;
      patch({ status: 'done', files, progress: null, seen: exportJobs.get().dialog === meta.kind });
      if (document.hidden) document.title = `✓ Vídeos prontos · ${baseTitle}`;
    })
    .catch((err) => {
      if (!mine()) return;
      if (err instanceof ExportAbort) exportJobs.set({ job: null });
      else {
        console.error(err);
        patch({ status: 'error', progress: null, error: err instanceof Error ? err.message : 'Não foi possível gerar os vídeos.' });
      }
    })
    .finally(() => {
      if (controller === ac) controller = null;
    });
  return true;
}

export function cancelJob() {
  controller?.abort();
}

export function clearJob() {
  if (exportJobs.get().job?.status !== 'running') exportJobs.set({ job: null });
}

export function markSeen() {
  const job = exportJobs.get().job;
  if (job && job.status !== 'running' && !job.seen) patch({ seen: true });
}

if (typeof window !== 'undefined') {
  // fechar a aba no meio da exportação perde o trabalho: o navegador pergunta antes
  window.addEventListener('beforeunload', (e) => {
    if (exportJobs.get().job?.status === 'running') {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.title !== baseTitle && baseTitle) document.title = baseTitle;
  });
}
