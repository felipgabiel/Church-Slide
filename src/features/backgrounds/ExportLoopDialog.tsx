import { useEffect, useState } from 'react';
import { LuDownload, LuTriangleAlert, LuX } from 'react-icons/lu';
import { canEncodeVideo } from '../../core/export/encode';
import type { Quality } from '../../core/export/exportSong';
import { exportDesignVideo, loopFileName, loopVideoSize, type LoopVideoOptions } from '../../core/export/loopVideo';
import { cancelJob, clearJob, exportJobs, markSeen, startJob, useExportJob } from '../export/exportJob';
import { SupportCard, supportDue } from '../support/SupportCard';
import { toast } from '../../ui/toast';
import { useSetting } from '../../core/settings';
import { downloadBlob } from '../../core/storage/exchange';
import type { BackgroundDesign } from '../../core/types';
import { formatBytes } from '../../core/util';
import { Button } from '../../ui/Button';
import { Row, Segmented } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';
import { tr } from '../../core/i18n';

type Prefs = Pick<LoopVideoOptions, 'height' | 'fps' | 'quality' | 'repeats'>;
const DEFAULT_PREFS: Prefs = { height: 1080, fps: 30, quality: 'medium', repeats: 1 };

/** Exporta SÓ o fundo, sem letra, num MP4 que repete sem emenda (para usar de fundo no Holyrics). */
export function ExportLoopDialog({ design, onClose }: { design: BackgroundDesign | null; onClose: () => void }) {
  return (
    <Modal open={!!design} onClose={onClose} title={tr('Exportar fundo em vídeo')} description={tr('Só o fundo, sem letra, em MP4 que repete sem emenda.')} width={520}>
      {design && <ExportLoop design={design} />}
    </Modal>
  );
}

function ExportLoop({ design }: { design: BackgroundDesign }) {
  const [prefs, setPrefs] = useSetting<Prefs>('loop-export', DEFAULT_PREFS);
  const p = { ...DEFAULT_PREFS, ...prefs };
  const set = (patch: Partial<Prefs>) => setPrefs({ ...p, ...patch });
  // roda como trabalho em segundo plano (exportJob): fechar o diálogo não cancela
  const job = useExportJob();
  const mine = job && job.kind === 'loop' && job.ownerId === design.id ? job : null;
  const otherRunning = !!job && job.status === 'running' && !mine;
  const phase: 'idle' | 'running' | 'done' = mine?.status === 'running' ? 'running' : mine?.status === 'done' ? 'done' : 'idle';
  const progress = mine?.progress?.fraction ?? 0;
  const error = mine?.status === 'error' ? mine.error : null;
  const file = phase === 'done' ? mine?.files[0] ?? null : null;
  const [url, setUrl] = useState<string | null>(null);
  const [showSupport, setShowSupport] = useState(supportDue);
  const supported = canEncodeVideo();
  const size = loopVideoSize(p.height);
  const seconds = design.loopSec * p.repeats;

  useEffect(() => {
    exportJobs.set({ dialog: 'loop' });
    return () => exportJobs.set({ dialog: null });
  }, []);
  useEffect(() => {
    if (!file) return setUrl(null);
    markSeen();
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const start = () => {
    const snapshot = structuredClone(design);
    const ok = startJob({ kind: 'loop', ownerId: design.id, title: design.name }, async (r) => {
      const blob = await exportDesignVideo(snapshot, { ...p, signal: r.signal, onProgress: (fraction) => r.progress({ index: 0, total: 1, name: snapshot.name, fraction }) });
      return [{ name: loopFileName(snapshot), blob }];
    });
    if (!ok) toast(tr('Já há vídeos sendo gerados. Espere terminar ou cancele.'), 'info');
  };

  return (
    <div className="xd">
      {!supported && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden />{' '}{tr('Este navegador não consegue gerar vídeo. Abra o Church Slide no Google Chrome ou no Microsoft Edge.')}
        </p>
      )}
      <fieldset className="xd-opts" disabled={phase === 'running'}>
        <Row label={tr('Resolução')} hint={`${size.width} × ${size.height}`}>
          <Segmented<string> size="sm" label={tr('Resolução')} value={String(p.height)} onChange={(v) => set({ height: Number(v) as Prefs['height'] })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} />
        </Row>
        <Row label={tr('Quadros por segundo')}>
          <Segmented<string> size="sm" label={tr('Quadros por segundo')} value={String(p.fps)} onChange={(v) => set({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
        </Row>
        <Row label={tr('Qualidade')}>
          <Segmented<Quality> size="sm" label={tr('Qualidade')} value={p.quality} onChange={(v) => set({ quality: v })} options={[{ value: 'low', label: tr('Leve') }, { value: 'medium', label: tr('Média') }, { value: 'high', label: tr('Alta') }]} />
        </Row>
        <Row label={tr('Duração')} hint={tr('O Holyrics repete o vídeo sozinho; 1 volta basta')}>
          <Segmented<string>
            size="sm"
            label={tr('Duração')}
            value={String(p.repeats)}
            onChange={(v) => set({ repeats: Number(v) })}
            options={[1, 2, 5].map((n) => ({ value: String(n), label: `${design.loopSec * n} s` }))}
          />
        </Row>
      </fieldset>

      {phase === 'running' && (
        <div className="xd-progress" role="status" aria-live="polite">
          <div className="xd-bar">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <span>{tr('Gerando “')}{design.name}”… {Math.round(progress * 100)}%</span>
        </div>
      )}
      {file && url && (
        <div className="xd-preview">
          <video src={url} controls autoPlay loop muted playsInline aria-label={tr('Prévia de {0}', design.name)} />
          <small>
            {file.name} · {formatBytes(file.blob.size)}
          </small>
        </div>
      )}
      {otherRunning && job && (
        <p className="xd-warn" role="status">
          <LuTriangleAlert aria-hidden />{' '}{tr('Já há vídeos sendo gerados (“')}{job.title}{tr('”). Espere terminar ou cancele.')}
        </p>
      )}
      {phase === 'done' && showSupport && <SupportCard onDismiss={() => setShowSupport(false)} />}
      {error && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> {error}
        </p>
      )}

      <div className="xd-foot">
        {phase === 'idle' && (
          <>
            <span className="xd-est">{seconds}{' '}{tr('s de vídeo · sem letra')}</span>
            <Button variant="primary" icon={<LuDownload />} disabled={!supported || otherRunning} onClick={start}>
              {tr('Gerar vídeo')}
            </Button>
          </>
        )}
        {phase === 'running' && (
          <>
            <span className="xd-est">{tr('Pode fechar esta janela: o vídeo segue sendo gerado.')}</span>
            <Button icon={<LuX />} onClick={() => cancelJob()}>
              {tr('Cancelar')}
            </Button>
          </>
        )}
        {phase === 'done' && file && (
          <>
            <Button onClick={() => clearJob()}>{tr('Refazer')}</Button>
            <Button variant="primary" icon={<LuDownload />} onClick={() => downloadBlob(file.blob, file.name)}>
              {tr('Baixar vídeo')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
