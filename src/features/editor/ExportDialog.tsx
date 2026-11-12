import { useEffect, useMemo, useState } from 'react';
import { SupportCard, supportDue } from '../support/SupportCard';
import { LuCheck, LuDownload, LuFolderDown, LuFiles, LuMinimize2, LuPlay, LuTriangleAlert, LuX } from 'react-icons/lu';
import { cancelJob, clearJob, exportJobs, markSeen, startJob, useExportJob, type JobProgress } from '../export/exportJob';
import { slideText } from '../../core/defaults';
import { canEncodeVideo } from '../../core/export/encode';
import {
  bitrateFor,
  DEFAULT_SETTINGS,
  exportableSlides,
  exportClips,
  videoSize,
  zipClips,
  zipFileName,
  type ClipResult,
  type ExportSettings,
  type Quality,
} from '../../core/export/exportSong';
import { useSetting } from '../../core/settings';
import { downloadBlob } from '../../core/storage/exchange';
import { formatBytes } from '../../core/util';
import { editorStore, flushSave } from '../../store/editor';
import { Button } from '../../ui/Button';
import { Row, Segmented, Slider } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { toast, toastError } from '../../ui/toast';
import { tr } from '../../core/i18n';

type Prefs = Omit<ExportSettings, 'slideIds'>;
type Phase = 'idle' | 'running' | 'done';

const preview = (text: string) => text.replace(/\s+/g, ' ').trim();

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={tr('Exportar vídeos')} description={tr('Um vídeo por trecho: a animação de entrada e depois a letra parada, com o fundo animado.')} width={640}>
      {open && <ExportBody onClose={onClose} />}
    </Modal>
  );
}

function ExportBody({ onClose }: { onClose: () => void }) {
  const project = editorStore.get().project!;
  const slides = useMemo(() => exportableSlides(project), [project]);
  const [saved, setSaved] = useSetting<Prefs>('export', DEFAULT_SETTINGS);
  const prefs: Prefs = { ...DEFAULT_SETTINGS, ...saved };
  const [selected, setSelected] = useState<Set<string>>(() => new Set(slides.map((s) => s.id)));
  // a exportação vive fora do diálogo (exportJob): fechar não cancela, e ao reabrir mostra onde parou
  const job = useExportJob();
  const mine = job && job.kind === 'song' && job.ownerId === project.id ? job : null;
  const otherRunning = !!job && job.status === 'running' && !mine;
  const phase: Phase = mine?.status === 'running' ? 'running' : mine?.status === 'done' ? 'done' : 'idle';
  const progress = mine?.progress ?? null;
  const clips = (mine?.files ?? []) as ClipResult[];
  const error = mine?.status === 'error' ? mine.error : null;
  // convite opcional de apoio (Pix): só depois de gerar, nunca dentro do vídeo; some por uns dias após "Agora não"
  const [showSupport, setShowSupport] = useState(supportDue);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const supported = canEncodeVideo();
  const hasFolder = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  useEffect(() => {
    exportJobs.set({ dialog: 'song' });
    return () => exportJobs.set({ dialog: null });
  }, []);
  useEffect(() => {
    if (phase === 'done') markSeen();
  }, [phase]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const set = (patch: Partial<Prefs>) => setSaved({ ...prefs, ...patch });
  const size = videoSize(project, prefs.height);
  const chosen = slides.filter((s) => selected.has(s.id));
  const perClipSec = prefs.holdSec + 1.5; // entrada ≈ 1,5 s (estimativa; o valor real depende da animação)
  const estBytes = (bitrateFor(size.width, size.height, prefs.fps, prefs.quality) / 8) * perClipSec * chosen.length;

  const start = async () => {
    setPreviewUrl(null);
    await flushSave();
    const current = editorStore.get().project!;
    const settings = { ...prefs, slideIds: chosen.map((s) => s.id) };
    const ok = startJob({ kind: 'song', ownerId: current.id, title: current.name, zipName: zipFileName(current) }, async (r) => {
      let at: JobProgress = { index: 0, total: settings.slideIds.length, name: '', fraction: 0 };
      return exportClips(current, settings, {
        signal: r.signal,
        onClipStart: (index, total, name) => r.progress((at = { index, total, name, fraction: 0 })),
        onProgress: (fraction) => r.progress((at = { ...at, fraction })),
        onClip: (c) => r.file(c),
      });
    });
    if (!ok) toast(tr('Já há vídeos sendo gerados. Espere terminar ou cancele.'), 'info');
  };

  const downloadZip = async () => {
    try {
      downloadBlob(await zipClips(clips), mine?.zipName ?? zipFileName(editorStore.get().project!));
    } catch (err) {
      console.error(err);
      toastError(tr('Não foi possível montar o arquivo ZIP.'));
    }
  };

  const downloadSeparate = async () => {
    for (const c of clips) {
      downloadBlob(c.blob, c.name);
      await new Promise((r) => setTimeout(r, 350)); // navegadores descartam downloads simultâneos demais
    }
    toast(tr('Se algum vídeo não baixou, permita "vários downloads" neste site.'), 'info');
  };

  const saveToFolder = async () => {
    try {
      const dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
      for (const c of clips) {
        const w = await (await dir.getFileHandle(c.name, { create: true })).createWritable();
        await w.write(c.blob);
        await w.close();
      }
      toast(tr('{0} vídeos salvos na pasta escolhida.', clips.length));
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toastError(tr('Não foi possível salvar na pasta.'));
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!slides.length) {
    return (
      <>
        <p className="xd-empty">{tr('Este louvor ainda não tem trechos com letra.')}</p>
        <div className="modal-actions">
          <Button onClick={onClose}>{tr('Fechar')}</Button>
        </div>
      </>
    );
  }

  const running = phase === 'running';
  return (
    <div className="xd">
      {!supported && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden />{' '}{tr('Este navegador não consegue gerar vídeo. Abra o Church Slide no Google Chrome ou no Microsoft Edge.')}
        </p>
      )}

      <fieldset className="xd-opts" disabled={running}>
        <Row label={tr('Resolução')} hint={`${size.width} × ${size.height}`}>
          <Segmented<string> size="sm" label={tr('Resolução')} value={String(prefs.height)} onChange={(v) => set({ height: Number(v) })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} />
        </Row>
        <Row label={tr('Quadros por segundo')}>
          <Segmented<string> size="sm" label={tr('Quadros por segundo')} value={String(prefs.fps)} onChange={(v) => set({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
        </Row>
        <Row label={tr('Qualidade')}>
          <Segmented<Quality> size="sm" label={tr('Qualidade')} value={prefs.quality} onChange={(v) => set({ quality: v })} options={[{ value: 'low', label: tr('Leve') }, { value: 'medium', label: tr('Média') }, { value: 'high', label: tr('Alta') }]} />
        </Row>
        <Slider label={tr('Tempo com a letra parada')} value={prefs.holdSec} min={1} max={30} step={0.5} unit=" s" reset={5} onChange={(v) => set({ holdSec: v })} />
      </fieldset>

      <div className="xd-list-head">
        <strong>
          {tr('Trechos (')}{chosen.length}{' '}{tr('de')}{' '}{slides.length})
        </strong>
        <span>
          <button type="button" className="xd-link" disabled={running} onClick={() => setSelected(new Set(slides.map((s) => s.id)))}>
            {tr('Todos')}
          </button>
          {' · '}
          <button type="button" className="xd-link" disabled={running} onClick={() => setSelected(new Set())}>
            {tr('Nenhum')}
          </button>
        </span>
      </div>
      <ul className="xd-list" aria-label={tr('Trechos a exportar')}>
        {slides.map((s, i) => {
          const clip = clips.find((c) => c.slideId === s.id);
          const current = running && progress?.index !== undefined && chosen[progress.index]?.id === s.id;
          return (
            <li key={s.id} data-state={clip ? 'done' : current ? 'now' : undefined}>
              <label>
                <input type="checkbox" checked={selected.has(s.id)} disabled={running || phase === 'done'} onChange={() => toggle(s.id)} />
                <span className="xd-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="xd-t">{preview(slideText(s)) || s.label}</span>
              </label>
              {clip && (
                <span className="xd-row-actions">
                  <span className="xd-size">{formatBytes(clip.blob.size)}</span>
                  <button
                    type="button"
                    className="xd-icon"
                    aria-label={tr('Ver o vídeo {0}', clip.name)}
                    onClick={() => {
                      setPreviewUrl(URL.createObjectURL(clip.blob));
                      setPreviewName(clip.name);
                    }}
                  >
                    <LuPlay />
                  </button>
                  <button type="button" className="xd-icon" aria-label={tr('Baixar {0}', clip.name)} onClick={() => downloadBlob(clip.blob, clip.name)}>
                    <LuDownload />
                  </button>
                </span>
              )}
              {current && <span className="xd-now">{Math.round((progress?.fraction ?? 0) * 100)}%</span>}
              {clip && !current && <LuCheck className="xd-ok" aria-hidden />}
            </li>
          );
        })}
      </ul>

      {previewUrl && (
        <div className="xd-preview">
          <video src={previewUrl} controls autoPlay loop muted playsInline aria-label={tr('Prévia de {0}', previewName)} />
          <small>{previewName}</small>
        </div>
      )}

      {running && progress && (
        <div className="xd-progress" role="status" aria-live="polite">
          <div className="xd-bar">
            <i style={{ width: `${((progress.index + progress.fraction) / progress.total) * 100}%` }} />
          </div>
          <span>
            {tr('Gerando')}{' '}{progress.index + 1}{' '}{tr('de')}{' '}{progress.total}: {progress.name}
          </span>
        </div>
      )}
      {error && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> {error}
        </p>
      )}

      {otherRunning && job && (
        <p className="xd-warn" role="status">
          <LuTriangleAlert aria-hidden />{' '}{tr('Já há vídeos sendo gerados (“')}{job.title}{tr('”). Este começa quando aquele terminar ou for cancelado.')}
        </p>
      )}

      {phase === 'done' && showSupport && <SupportCard onDismiss={() => setShowSupport(false)} />}

      <div className="xd-foot">
        {phase === 'idle' && (
          <>
            <span className="xd-est">
              {chosen.length} {chosen.length === 1 ? tr('vídeo') : tr('vídeos')} · ≈ {formatBytes(estBytes)}{' '}{tr('no total')}
            </span>
            <Button variant="primary" icon={<LuFiles />} disabled={!supported || chosen.length === 0 || otherRunning} onClick={() => void start()}>
              {tr('Gerar')}{' '}{chosen.length} {chosen.length === 1 ? tr('vídeo') : tr('vídeos')}
            </Button>
          </>
        )}
        {running && (
          <>
            <span className="xd-est">{tr('Pode fechar esta janela e continuar editando: os vídeos seguem sendo gerados.')}</span>
            <span className="xd-dl">
              <Button icon={<LuX />} onClick={() => cancelJob()}>
                {tr('Cancelar')}
              </Button>
              <Button variant="primary" icon={<LuMinimize2 />} onClick={onClose}>
                {tr('Continuar em segundo plano')}
              </Button>
            </span>
          </>
        )}
        {phase === 'done' && (
          <>
            <Button onClick={() => clearJob()}>{tr('Refazer')}</Button>
            <span className="xd-dl">
              {hasFolder && (
                <Button icon={<LuFolderDown />} onClick={() => void saveToFolder()}>
                  {tr('Salvar numa pasta')}
                </Button>
              )}
              <Button icon={<LuFiles />} onClick={() => void downloadSeparate()}>
                {tr('Baixar separados')}
              </Button>
              <Button variant="primary" icon={<LuDownload />} onClick={() => void downloadZip()}>
                {tr('Baixar tudo (.zip)')}
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
