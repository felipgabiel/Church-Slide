import type { Project, Slide } from '../types';

/**
 * Navegação pela sequência do culto (vários louvores em fila).
 * Funções puras: o operador só decide *para onde* ir; quem desenha é o palco.
 */

export interface SongRef {
  id: string;
  project: Project | null;
}

export interface Pos {
  songId: string;
  /** índice no array completo de trechos do louvor */
  index: number;
}

/** Um trecho só entra na apresentação se tiver algum texto visível (trechos vazios são pulados). */
export const slideHasText = (s: Slide): boolean => s.layers.some((l) => l.visible && l.text.trim() !== '');

export function playableIndices(p: Project | null | undefined): number[] {
  if (!p) return [];
  const out: number[] = [];
  p.slides.forEach((s, i) => {
    if (slideHasText(s)) out.push(i);
  });
  return out;
}

export function firstPos(songs: SongRef[], songId: string): Pos | null {
  const song = songs.find((s) => s.id === songId);
  const first = playableIndices(song?.project)[0];
  return first === undefined ? null : { songId, index: first };
}

/** Primeiro trecho do próximo louvor que tenha conteúdo. */
export function nextSongPos(songs: SongRef[], songId: string): Pos | null {
  const cur = songs.findIndex((s) => s.id === songId);
  for (let k = cur + 1; k < songs.length && cur >= 0; k++) {
    const f = firstPos(songs, songs[k].id);
    if (f) return f;
  }
  return null;
}

export function prevSongPos(songs: SongRef[], songId: string): Pos | null {
  const cur = songs.findIndex((s) => s.id === songId);
  for (let k = cur - 1; k >= 0; k--) {
    const f = firstPos(songs, songs[k].id);
    if (f) return f;
  }
  return null;
}

/** Próximo trecho; ao fim do louvor, continua no primeiro trecho do seguinte (sem passar por tela preta). */
export function nextPos(songs: SongRef[], pos: Pos): Pos | null {
  const cur = songs.findIndex((s) => s.id === pos.songId);
  if (cur < 0) return null;
  const next = playableIndices(songs[cur].project).find((i) => i > pos.index);
  if (next !== undefined) return { songId: pos.songId, index: next };
  return nextSongPos(songs, pos.songId);
}

/** Trecho anterior; no início do louvor, volta ao último trecho do louvor anterior. */
export function prevPos(songs: SongRef[], pos: Pos): Pos | null {
  const cur = songs.findIndex((s) => s.id === pos.songId);
  if (cur < 0) return null;
  const idxs = playableIndices(songs[cur].project);
  const before = [...idxs].reverse().find((i) => i < pos.index);
  if (before !== undefined) return { songId: pos.songId, index: before };
  for (let k = cur - 1; k >= 0; k--) {
    const list = playableIndices(songs[k].project);
    const last = list[list.length - 1];
    if (last !== undefined) return { songId: songs[k].id, index: last };
  }
  return null;
}

export function lastPos(songs: SongRef[], songId: string): Pos | null {
  const list = playableIndices(songs.find((s) => s.id === songId)?.project);
  const last = list[list.length - 1];
  return last === undefined ? null : { songId, index: last };
}

/** Corrige uma posição que deixou de existir (trecho apagado/esvaziado no editor). */
export function clampPos(songs: SongRef[], pos: Pos): Pos | null {
  const song = songs.find((s) => s.id === pos.songId);
  const list = playableIndices(song?.project);
  if (!list.length) return null;
  if (list.includes(pos.index)) return pos;
  const after = list.find((i) => i > pos.index);
  return { songId: pos.songId, index: after ?? list[list.length - 1] };
}
