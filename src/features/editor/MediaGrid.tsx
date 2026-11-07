import { useRef } from 'react';
import { LuFilm, LuImage, LuUpload, LuX } from 'react-icons/lu';
import { addMedia, deleteMedia, detectKind } from '../../core/storage/media';
import type { MediaRecord } from '../../core/types';
import { formatBytes } from '../../core/util';
import { useMediaUrl } from '../../render/useMedia';
import { Button } from '../../ui/Button';
import { confirmDialog, toast, toastError } from '../../ui/toast';
import { bumpMedia, useMediaList } from './hooks';

const BIG_VIDEO = 250 * 1024 * 1024;

/** Envia arquivos para a biblioteca. Retorna os registros criados (na ordem enviada). */
export async function uploadFiles(files: FileList | File[], allowed: MediaRecord['kind'][]): Promise<MediaRecord[]> {
  const out: MediaRecord[] = [];
  for (const file of Array.from(files)) {
    const kind = detectKind(file);
    if (!kind || !allowed.includes(kind)) {
      toastError(`“${file.name}” não é um formato aceito aqui.`);
      continue;
    }
    try {
      const rec = await addMedia(file);
      out.push(rec);
      if (kind === 'video' && file.size > BIG_VIDEO) {
        toast('Vídeo grande: em computadores mais simples prefira 1080p em H.264 (MP4) para evitar travamentos.', 'info', 6000);
      }
    } catch (err) {
      console.error(err);
      toastError(`Não foi possível guardar “${file.name}”. Verifique o espaço disponível.`);
    }
  }
  if (out.length) bumpMedia();
  return out;
}

function Thumb({ rec, selected, onPick }: { rec: MediaRecord; selected: boolean; onPick: (m: MediaRecord) => void }) {
  const { url } = useMediaUrl(rec.id, true);
  return (
    <div className="mg-item" data-on={selected ? '1' : '0'}>
      <button type="button" className="mg-pick" onClick={() => onPick(rec)} title={`${rec.name} · ${formatBytes(rec.size)}`} aria-pressed={selected}>
        {url ? <img src={url} alt="" draggable={false} /> : <span className="mg-ph">{rec.kind === 'video' ? <LuFilm /> : <LuImage />}</span>}
        {rec.kind === 'video' && (
          <span className="mg-badge">
            <LuFilm aria-hidden /> vídeo
          </span>
        )}
        <span className="mg-name">{rec.name}</span>
      </button>
      <button
        type="button"
        className="mg-del"
        aria-label={`Remover ${rec.name} da biblioteca`}
        title="Remover da biblioteca"
        onClick={async () => {
          const ok = await confirmDialog({
            title: 'Remover da biblioteca?',
            message: `“${rec.name}” será apagado deste computador. Trechos que usam esse arquivo passam a mostrar a cor de fundo.`,
            confirmLabel: 'Remover',
            danger: true,
          });
          if (!ok) return;
          await deleteMedia(rec.id);
          bumpMedia();
        }}
      >
        <LuX />
      </button>
    </div>
  );
}

interface Props {
  kinds?: ('image' | 'video')[];
  selectedId?: string | null;
  onPick: (m: MediaRecord) => void;
  /** Texto do botão de envio. */
  uploadLabel?: string;
}

/** Biblioteca de imagens e vídeos do usuário, com envio. */
export function MediaGrid({ kinds = ['image', 'video'], selectedId = null, onPick, uploadLabel = 'Enviar imagem ou vídeo' }: Props) {
  const { items, loading } = useMediaList(kinds);
  const input = useRef<HTMLInputElement>(null);
  const accept = kinds.includes('image') && kinds.includes('video') ? 'image/*,video/*' : kinds.includes('video') ? 'video/*' : 'image/*';

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const recs = await uploadFiles(files, kinds);
    if (input.current) input.current.value = '';
    if (recs[0]) onPick(recs[0]);
  };

  return (
    <div
      className="mg"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void onFiles(e.dataTransfer.files);
      }}
    >
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => void onFiles(e.currentTarget.files)} />
      <Button size="sm" icon={<LuUpload />} onClick={() => input.current?.click()} className="mg-up">
        {uploadLabel}
      </Button>
      {loading ? (
        <p className="mg-empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="mg-empty">Nada aqui ainda. Envie ou arraste arquivos para esta área. Eles ficam guardados neste computador e funcionam sem internet.</p>
      ) : (
        <div className="mg-grid">
          {items.map((m) => (
            <Thumb key={m.id} rec={m} selected={m.id === selectedId} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}
