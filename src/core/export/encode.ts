import { Mp4Muxer } from './mp4';

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  /** bits por segundo */
  bitrate: number;
  /** desenha o quadro do instante `tMs` em `ctx` (já limpo) */
  renderFrame: (ctx: CanvasRenderingContext2D, tMs: number) => Promise<void> | void;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export class ExportAbort extends Error {
  constructor() {
    super('Exportação cancelada.');
    this.name = 'ExportAbort';
  }
}

/** Nível H.264 suficiente para a resolução × taxa de quadros pedidas. */
function levelHex(w: number, h: number, fps: number): string {
  const rate = w * h * fps;
  if (rate > 3840 * 2160 * 30) return '34'; // 5.2
  if (rate > 1920 * 1080 * 60) return '33'; // 5.1
  if (rate > 1920 * 1080 * 30) return '2A'; // 4.2
  return '28'; // 4.0
}

/**
 * Escolhe um perfil H.264 que este navegador codifica. O Baseline vem primeiro porque NÃO usa
 * quadros B (o muxer MP4 aqui grava os quadros na ordem em que foram codificados).
 */
async function pickCodec(o: EncodeOptions): Promise<VideoEncoderConfig> {
  const lv = levelHex(o.width, o.height, o.fps);
  for (const profile of ['42E0', '4D00', '6400']) {
    const config: VideoEncoderConfig = {
      codec: `avc1.${profile}${lv}`,
      width: o.width,
      height: o.height,
      bitrate: o.bitrate,
      framerate: o.fps,
      latencyMode: 'quality',
      avc: { format: 'avc' },
    };
    try {
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    } catch {
      /* tenta o próximo perfil */
    }
  }
  throw new Error('Este navegador não consegue gerar vídeo H.264. Use o Google Chrome ou o Microsoft Edge atualizados.');
}

export function canEncodeVideo(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Renderiza quadro a quadro (mais rápido que o tempo real) e devolve um MP4. */
export async function encodeMp4(o: EncodeOptions): Promise<Blob> {
  if (!canEncodeVideo()) throw new Error('Este navegador não suporta exportar vídeo. Use o Google Chrome ou o Microsoft Edge.');
  const config = await pickCodec(o);

  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const samples: { data: Uint8Array; key: boolean }[] = [];
  let avcC: Uint8Array | null = null;
  let lastTs = -1;
  let failure: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description;
      if (desc && !avcC) avcC = new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer.slice((desc as ArrayBufferView).byteOffset, (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength));
      if (chunk.timestamp < lastTs) failure = new Error('O codificador gerou quadros fora de ordem (quadros B), o que este exportador não suporta.');
      lastTs = chunk.timestamp;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key' });
    },
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(config);

  const frames = Math.max(1, Math.ceil((o.durationMs / 1000) * o.fps));
  const keyEvery = Math.max(1, Math.round(o.fps * 2));
  try {
    for (let i = 0; i < frames; i++) {
      if (o.signal?.aborted) throw new ExportAbort();
      if (failure) throw failure;
      const tMs = (i * 1000) / o.fps;
      ctx.clearRect(0, 0, o.width, o.height);
      await o.renderFrame(ctx, tMs);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2)); // não acumula quadros na memória
      if (i % 3 === 0) {
        o.onProgress?.(i / frames);
        await tick(); // deixa a interface respirar (barra de progresso, botão cancelar)
      }
    }
    await encoder.flush();
    if (failure) throw failure;
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }

  if (!avcC) throw new Error('O codificador não devolveu a configuração do vídeo.');
  const muxer = new Mp4Muxer({ width: o.width, height: o.height, fps: o.fps, avcC });
  for (const s of samples) muxer.addSample(s.data, s.key);
  o.onProgress?.(1);
  return muxer.finish();
}
