import { useEffect, useRef, useState } from 'react';
import { LuDownload, LuTriangleAlert, LuX } from 'react-icons/lu';
import { canEncodeVideo, ExportAbort } from '../../core/export/encode';
import type { Quality } from '../../core/export/exportSong';
import { exportDesignVideo, loopFileName, loopVideoSize, type LoopVideoOptions } from '../../core/export/loopVideo';
import { useSetting } from '../../core/settings';
import { downloadBlob } from '../../core/storage/exchange';
import type { BackgroundDesign } from '../../core/types';
import { formatBytes } from '../../core/util';
import { Button } from '../../ui/Button';
import { Row, Segmented } from '../../ui/Controls';
import { Modal } from '../../ui/Modal';

type Prefs = Pick<LoopVideoOptions, 'height' | 'fps' | 'quality' | 'repeats'>;
const DEFAULTS: Prefs = { height: 1080, fps: 30, quality: 'medium', repeats: 1 };

/** Exporta SÓ o fundo, sem letra, num MP4 que repete sem emenda (para usar de fundo no Holyrics). */
export function ExportLoopDialog({ design, onClose }: { design: BackgroundDesign | null; onClose: () => void }) {
  return (
    <Modal open={!!design} onClose={onClose} title="Exportar fundo em vídeo" description="Só o fundo, sem letra, em MP4 que repete sem emenda." width={520}>
      {design && <ExportLoop design={design} />}
    </Modal>
  );
}

function ExportLoop({ design }: { design: BackgroundDesign }) {
  const [prefs, setPrefs] = useSetting<Prefs>('loop-export', DEFAULTS);
  const p = { ...DEFAULTS, ...prefs };
  const set = (patch: Partial<Prefs>) => setPrefs({ ...p, ...patch });
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const supported = canEncodeVideo();
  const size = loopVideoSize(p.height);
  const seconds = design.loopSec * p.repeats;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const start = async () => {
    setError(null);
    setPhase('running');
    setProgress(0);
    abort.current = new AbortController();
    try {
      const blob = await exportDesignVideo(design, { ...p, onProgress: setProgress, signal: abort.current.signal });
      setResult({ blob, url: URL.createObjectURL(blob) });
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      if (!(err instanceof ExportAbort)) setError(err instanceof Error ? err.message : 'Não foi possível gerar o vídeo.');
    }
  };

  return (
    <div className="xd">
      {!supported && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> Este navegador não consegue gerar vídeo. Abra o Church Slide no Google Chrome ou no Microsoft Edge.
        </p>
      )}
      <fieldset className="xd-opts" disabled={phase === 'running'}>
        <Row label="Resolução" hint={`${size.width} × ${size.height}`}>
          <Segmented<string> size="sm" label="Resolução" value={String(p.height)} onChange={(v) => set({ height: Number(v) as Prefs['height'] })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} />
        </Row>
        <Row label="Quadros por segundo">
          <Segmented<string> size="sm" label="Quadros por segundo" value={String(p.fps)} onChange={(v) => set({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
        </Row>
        <Row label="Qualidade">
          <Segmented<Quality> size="sm" label="Qualidade" value={p.quality} onChange={(v) => set({ quality: v })} options={[{ value: 'low', label: 'Leve' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }]} />
        </Row>
        <Row label="Duração" hint="O Holyrics repete o vídeo sozinho; 1 volta basta">
          <Segmented<string>
            size="sm"
            label="Duração"
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
          <span>Gerando “{design.name}”… {Math.round(progress * 100)}%</span>
        </div>
      )}
      {result && phase === 'done' && (
        <div className="xd-preview">
          <video src={result.url} controls autoPlay loop muted playsInline aria-label={`Prévia de ${design.name}`} />
          <small>
            {loopFileName(design)} · {formatBytes(result.blob.size)}
          </small>
        </div>
      )}
      {error && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> {error}
        </p>
      )}

      <div className="xd-foot">
        {phase === 'idle' && (
          <>
            <span className="xd-est">{seconds} s de vídeo · sem letra</span>
            <Button variant="primary" icon={<LuDownload />} disabled={!supported} onClick={() => void start()}>
              Gerar vídeo
            </Button>
          </>
        )}
        {phase === 'running' && (
          <>
            <span className="xd-est">Mantenha esta aba aberta até terminar.</span>
            <Button icon={<LuX />} onClick={() => abort.current?.abort()}>
              Cancelar
            </Button>
          </>
        )}
        {phase === 'done' && result && (
          <>
            <Button onClick={() => setPhase('idle')}>Refazer</Button>
            <Button variant="primary" icon={<LuDownload />} onClick={() => downloadBlob(result.blob, loopFileName(design))}>
              Baixar vídeo
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
