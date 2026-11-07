import type { Slide, SplitMode } from './types';
import { slideText } from './defaults';

export interface LyricPart {
  label: string;
  text: string;
}

export interface SplitOptions {
  mode: SplitMode;
  /** No modo "estrofe": estrofes maiores que isso são divididas em partes equilibradas. */
  maxLines?: number;
}

const LABEL_RE =
  /^\s*[[({]?\s*(verso|estrofe|refr[aã]o|pr[eé][\s-]?refr[aã]o|coro|ponte|bridge|intro(?:du[cç][aã]o)?|final|outro|interl[uú]dio|chorus|pre[\s-]?chorus|verse|tag|instrumental)\s*(\d*)\s*[\])}]?\s*[:.]?\s*$/i;

const SEPARATOR_RE = /^\s*(-{3,}|\*{3,}|\/{2,}|={3,})\s*$/;

/** Retorna o rótulo normalizado se a linha for um marcador de seção (ex.: "[Refrão]"). */
export function parseLabel(line: string): string | null {
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const pretty = word.charAt(0).toUpperCase() + word.slice(1);
  return m[2] ? `${pretty} ${m[2]}` : pretty;
}

interface Block {
  label: string;
  lines: string[];
}

/** Quebra o texto em blocos (separados por linha em branco, rótulo ou separador manual). */
function toBlocks(text: string, blankSplits: boolean): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks: Block[] = [];
  let cur: Block = { label: '', lines: [] };
  let pendingLabel = '';

  const flush = () => {
    // remove linhas em branco nas pontas
    while (cur.lines.length && cur.lines[0] === '') cur.lines.shift();
    while (cur.lines.length && cur.lines[cur.lines.length - 1] === '') cur.lines.pop();
    if (cur.lines.length) blocks.push(cur);
    cur = { label: pendingLabel, lines: [] };
    pendingLabel = '';
  };

  for (const line of lines) {
    if (SEPARATOR_RE.test(line)) {
      flush();
      continue;
    }
    const label = parseLabel(line);
    if (label) {
      flush();
      pendingLabel = label;
      cur.label = label;
      continue;
    }
    if (line.trim() === '') {
      if (blankSplits) flush();
      else cur.lines.push('');
      continue;
    }
    if (!cur.label && pendingLabel) cur.label = pendingLabel;
    cur.lines.push(line);
  }
  flush();
  return blocks;
}

function chunkBalanced(lines: string[], maxLines: number): string[][] {
  if (lines.length <= maxLines) return [lines];
  const parts = Math.ceil(lines.length / maxLines);
  const size = Math.ceil(lines.length / parts);
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size));
  return out;
}

/** Divide a letra de um louvor em trechos conforme o modo escolhido. */
export function splitLyrics(raw: string, opts: SplitOptions): LyricPart[] {
  const maxLines = Math.max(1, opts.maxLines ?? 4);
  const manual = opts.mode === 'manual';
  const blocks = toBlocks(raw, !manual);
  const parts: LyricPart[] = [];

  for (const b of blocks) {
    const lines = b.lines.filter((l, i, arr) => !(l === '' && (i === 0 || arr[i - 1] === ''))); // colapsa brancos duplicados
    if (opts.mode === 'line') {
      lines.filter((l) => l.trim()).forEach((l, i) => parts.push({ label: i === 0 ? b.label : '', text: l.trim() }));
    } else if (opts.mode === 'pairs') {
      const real = lines.filter((l) => l.trim());
      for (let i = 0; i < real.length; i += 2) {
        parts.push({ label: i === 0 ? b.label : '', text: real.slice(i, i + 2).join('\n') });
      }
    } else if (opts.mode === 'manual') {
      parts.push({ label: b.label, text: lines.join('\n') });
    } else {
      chunkBalanced(lines, maxLines).forEach((chunk, i) => parts.push({ label: i === 0 ? b.label : '', text: chunk.join('\n') }));
    }
  }
  return parts;
}

/** Reconstrói a letra a partir dos trechos (para reabrir no editor de letra completa). */
export function slidesToLyrics(slides: Slide[], mode: SplitMode): string {
  const sep = mode === 'manual' ? '\n---\n' : '\n\n';
  return slides
    .map((s) => {
      const text = slideText(s);
      return s.label ? `[${s.label}]\n${text}` : text;
    })
    .filter((t) => t.trim() !== '')
    .join(sep);
}

export const SPLIT_MODE_LABELS: Record<SplitMode, { title: string; hint: string }> = {
  stanza: { title: 'Por estrofe', hint: 'Uma estrofe (bloco separado por linha em branco) por trecho. Estrofes longas são divididas.' },
  line: { title: 'Por linha', hint: 'Cada linha vira um trecho.' },
  pairs: { title: 'De 2 em 2 linhas', hint: 'Duas linhas por trecho dentro de cada estrofe.' },
  manual: { title: 'Manual', hint: 'Só divide onde houver uma linha com --- . Linhas em branco ficam dentro do trecho.' },
};
