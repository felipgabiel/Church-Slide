/**
 * Muxer MP4 mínimo (uma trilha de vídeo H.264, sem áudio, sem reordenação de quadros).
 * Grava "moov" ANTES de "mdat" (faststart): abre rápido em qualquer player e no Holyrics.
 * Taxa de quadros constante: timescale = fps × 1000, cada amostra dura 1000 ticks.
 */

const u8 = (...n: number[]) => new Uint8Array(n);
const u16 = (v: number) => u8((v >>> 8) & 255, v & 255);
const u32 = (v: number) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const str = (s: string) => u8(...[...s].map((c) => c.charCodeAt(0)));
const zeros = (n: number) => new Uint8Array(n);

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = cat(...payload);
  return cat(u32(8 + body.length), str(type), body);
}

const fullBox = (type: string, version: number, flags: number, ...payload: Uint8Array[]) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payload);

const MATRIX = cat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));

export interface Mp4Options {
  width: number;
  height: number;
  fps: number;
  /** registro `avcC` (decoderConfig.description do WebCodecs, formato "avc") */
  avcC: Uint8Array;
}

interface Sample {
  data: Uint8Array;
  key: boolean;
}

export class Mp4Muxer {
  private samples: Sample[] = [];
  constructor(private o: Mp4Options) {
    if (o.width % 2 || o.height % 2) throw new Error('H.264 exige largura e altura pares.');
  }

  addSample(data: Uint8Array, key: boolean) {
    this.samples.push({ data, key });
  }

  get count() {
    return this.samples.length;
  }

  private moov(mdatOffset: number): Uint8Array {
    const { width, height, fps, avcC } = this.o;
    const timescale = Math.round(fps * 1000);
    const n = this.samples.length;
    const duration = n * 1000;

    const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2));
    const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16));
    const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
    const hdlr = fullBox('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), u8(0));
    const vmhd = fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0));
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));

    const avc1 = box(
      'avc1',
      zeros(6),
      u16(1),
      zeros(16),
      u16(width),
      u16(height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      zeros(32),
      u16(0x0018),
      u16(0xffff),
      box('avcC', avcC),
    );
    const stsd = fullBox('stsd', 0, 0, u32(1), avc1);
    const stts = fullBox('stts', 0, 0, u32(1), u32(n), u32(1000));
    const keys = this.samples.flatMap((s, i) => (s.key ? [i + 1] : []));
    const stss = fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32));
    const stsz = fullBox('stsz', 0, 0, u32(0), u32(n), ...this.samples.map((s) => u32(s.data.length)));
    const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));
    const stco = fullBox('stco', 0, 0, u32(1), u32(mdatOffset));
    const stbl = box('stbl', stsd, stts, stss, stsz, stsc, stco);
    const minf = box('minf', vmhd, dinf, stbl);
    const mdia = box('mdia', mdhd, hdlr, minf);
    const trak = box('trak', tkhd, mdia);
    return box('moov', mvhd, trak);
  }

  finish(): Blob {
    if (!this.samples.length) throw new Error('Nenhum quadro foi codificado.');
    const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    // o tamanho do moov não depende do deslocamento: mede com 0 e refaz com o valor certo
    const moovSize = this.moov(0).length;
    const mdatOffset = ftyp.length + moovSize + 8;
    const moov = this.moov(mdatOffset);
    const mdatSize = this.samples.reduce((n, s) => n + s.data.length, 0);
    if (mdatSize + mdatOffset > 0xffffffff) throw new Error('O vídeo passaria de 4 GB.');
    return new Blob([ftyp as BlobPart, moov as BlobPart, u32(8 + mdatSize) as BlobPart, str('mdat') as BlobPart, ...this.samples.map((s) => s.data as BlobPart)], { type: 'video/mp4' });
  }
}
