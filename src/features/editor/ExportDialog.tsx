import { useEffect, useMemo, useRef, useState } from 'react';
import { SupportCard, supportDue } from '../support/SupportCard';
import { LuCheck, LuDownload, LuFolderDown, LuFiles, LuPlay, LuTriangleAlert, LuX } from 'react-icons/lu';
import { slideText } from '../../core/defaults';
import { canEncodeVideo, ExportAbort } from '../../core/export/encode';
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

type Prefs = Omit<ExportSettings, 'slideIds'>;
type Phase = 'idle' | 'running' | 'done';

interface Progress {
  index: number;
  total: number;
  name: string;
  fraction: number;
}

const preview = (text: string) => text.replace(/\s+/g, ' ').trim();

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Exportar vídeos" description="Um vídeo por trecho: a animação de entrada e depois a letra parada, com o fundo animado." width={640}>
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
  const [phase, setPhase] = useState<Phase>('idle');
  // convite opcional de apoio (Pix): só depois de gerar, nunca dentro do vídeo; some por semanas após "Agora não"
  const [showSupport, setShowSupport] = useState(supportDue);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [clips, setClips] = useState<ClipResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const abort = useRef<AbortController | null>(null);
  const supported = canEncodeVideo();
  const hasFolder = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  // fechar o diálogo durante a exportação cancela (não deixa trabalho invisível rodando)
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const set = (patch: Partial<Prefs>) => setSaved({ ...prefs, ...patch });
  const size = videoSize(project, prefs.height);
  const chosen = slides.filter((s) => selected.has(s.id));
  const perClipSec = prefs.holdSec + 1.5; // entrada ≈ 1,5 s (estimativa; o valor real depende da animação)
  const estBytes = (bitrateFor(size.width, size.height, prefs.fps, prefs.quality) / 8) * perClipSec * chosen.length;

  const start = async () => {
    setError(null);
    setClips([]);
    setPreviewUrl(null);
    setPhase('running');
    const ac = new AbortController();
    abort.current = ac;
    try {
      await flushSave();
      const done = await exportClips(editorStore.get().project!, { ...prefs, slideIds: chosen.map((s) => s.id) }, {
        signal: ac.signal,
        onClipStart: (index, total, name) => setProgress({ index, total, name, fraction: 0 }),
        onProgress: (fraction) => setProgress((p) => (p ? { ...p, fraction } : p)),
        onClip: (c) => setClips((cs) => [...cs, c]),
      });
      setClips(done);
      setPhase('done');
    } catch (err) {
      if (err instanceof ExportAbort) {
        setPhase('idle');
        toast('Exportação cancelada.', 'info');
      } else {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Não foi possível exportar.');
        setPhase('idle');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  const downloadZip = async () => {
    try {
      downloadBlob(await zipClips(clips), zipFileName(editorStore.get().project!));
    } catch (err) {
      console.error(err);
      toastError('Não foi possível montar o arquivo ZIP.');
    }
  };

  const downloadSeparate = async () => {
    for (const c of clips) {
      downloadBlob(c.blob, c.name);
      await new Promise((r) => setTimeout(r, 350)); // navegadores descartam downloads simultâneos demais
    }
    toast('Se algum vídeo não baixou, permita "vários downloads" neste site.', 'info');
  };

  const saveToFolder = async () => {
    try {
      const dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
      for (const c of clips) {
        const w = await (await dir.getFileHandle(c.name, { create: true })).createWritable();
        await w.write(c.blob);
        await w.close();
      }
      toast(`${clips.length} vídeos salvos na pasta escolhida.`);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toastError('Não foi possível salvar na pasta.');
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
        <p className="xd-empty">Este louvor ainda não tem trechos com letra.</p>
        <div className="modal-actions">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </>
    );
  }

  const running = phase === 'running';
  return (
    <div className="xd">
      {!supported && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> Este navegador não consegue gerar vídeo. Abra o Church Slide no Google Chrome ou no Microsoft Edge.
        </p>
      )}

      <fieldset className="xd-opts" disabled={running}>
        <Row label="Resolução" hint={`${size.width} × ${size.height}`}>
          <Segmented<string> size="sm" label="Resolução" value={String(prefs.height)} onChange={(v) => set({ height: Number(v) })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} />
        </Row>
        <Row label="Quadros por segundo">
          <Segmented<string> size="sm" label="Quadros por segundo" value={String(prefs.fps)} onChange={(v) => set({ fps: Number(v) as 30 | 60 })} options={[{ value: '30', label: '30' }, { value: '60', label: '60' }]} />
        </Row>
        <Row label="Qualidade">
          <Segmented<Quality> size="sm" label="Qualidade" value={prefs.quality} onChange={(v) => set({ quality: v })} options={[{ value: 'low', label: 'Leve' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' }]} />
        </Row>
        <Slider label="Tempo com a letra parada" value={prefs.holdSec} min={1} max={30} step={0.5} unit=" s" reset={5} onChange={(v) => set({ holdSec: v })} />
      </fieldset>

      <div className="xd-list-head">
        <strong>
          Trechos ({chosen.length} de {slides.length})
        </strong>
        <span>
          <button type="button" className="xd-link" disabled={running} onClick={() => setSelected(new Set(slides.map((s) => s.id)))}>
            Todos
          </button>
          {' · '}
          <button type="button" className="xd-link" disabled={running} onClick={() => setSelected(new Set())}>
            Nenhum
          </button>
        </span>
      </div>
      <ul className="xd-list" aria-label="Trechos a exportar">
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
                    aria-label={`Ver o vídeo ${clip.name}`}
                    onClick={() => {
                      setPreviewUrl(URL.createObjectURL(clip.blob));
                      setPreviewName(clip.name);
                    }}
                  >
                    <LuPlay />
                  </button>
                  <button type="button" className="xd-icon" aria-label={`Baixar ${clip.name}`} onClick={() => downloadBlob(clip.blob, clip.name)}>
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
          <video src={previewUrl} controls autoPlay loop muted playsInline aria-label={`Prévia de ${previewName}`} />
          <small>{previewName}</small>
        </div>
      )}

      {running && progress && (
        <div className="xd-progress" role="status" aria-live="polite">
          <div className="xd-bar">
            <i style={{ width: `${((progress.index + progress.fraction) / progress.total) * 100}%` }} />
          </div>
          <span>
            Gerando {progress.index + 1} de {progress.total}: {progress.name}
          </span>
        </div>
      )}
      {error && (
        <p className="xd-warn" role="alert">
          <LuTriangleAlert aria-hidden /> {error}
        </p>
      )}

      {phase === 'done' && showSupport && <SupportCard onDismiss={() => setShowSupport(false)} />}

      <div className="xd-foot">
        {phase === 'idle' && (
          <>
            <span className="xd-est">
              {chosen.length} {chosen.length === 1 ? 'vídeo' : 'vídeos'} · ≈ {formatBytes(estBytes)} no total
            </span>
            <Button variant="primary" icon={<LuFiles />} disabled={!supported || chosen.length === 0} onClick={() => void start()}>
              Gerar {chosen.length} {chosen.length === 1 ? 'vídeo' : 'vídeos'}
            </Button>
          </>
        )}
        {running && (
          <>
            <span className="xd-est">Mantenha esta aba aberta até terminar.</span>
            <Button icon={<LuX />} onClick={() => abort.current?.abort()}>
              Cancelar
            </Button>
          </>
        )}
        {phase === 'done' && (
          <>
            <Button onClick={() => { setPhase('idle'); setClips([]); }}>Refazer</Button>
            <span className="xd-dl">
              {hasFolder && (
                <Button icon={<LuFolderDown />} onClick={() => void saveToFolder()}>
                  Salvar numa pasta
                </Button>
              )}
              <Button icon={<LuFiles />} onClick={() => void downloadSeparate()}>
                Baixar separados
              </Button>
              <Button variant="primary" icon={<LuDownload />} onClick={() => void downloadZip()}>
                Baixar tudo (.zip)
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
