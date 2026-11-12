import { applyPreset, getPreset } from '../core/anim/presets';
import { newLayer, newSlide, normalizeProject, resolveAnimation, resolveBackground } from '../core/defaults';
import { uid } from '../core/ids';
import { designBackground } from '../core/design/apply';
import { splitLyrics } from '../core/split';
import { getProject, saveProject, writeSnapshot } from '../core/storage/projects';
import type {
  AnimationConfig,
  Aspect,
  Background,
  BackgroundDesign,
  DeepPartial,
  LayerRole,
  Project,
  Slide,
  SplitMode,
  TextLayer,
  TextStyle,
  Theme,
} from '../core/types';
import { applyImpactToLayer, DEFAULT_IMPACT } from '../core/impact';
import { getThemePreset } from '../core/themes';
import { clearWord, patchWord, pruneWords, wordCount, type WordPatch, type WordTarget } from '../core/words';
import {
  copyLayer,
  detachedLayer,
  duplicateLine as duplicateLineIn,
  duplicateWord as duplicateWordIn,
  readLine,
  readWord,
  removeLine as removeLineIn,
  removeWord as removeWordIn,
  readWords,
  removeWords as removeWordsIn,
  reorderLayers,
  type LayerMove,
} from '../core/layers';
import { clamp, clone, deepMerge, move } from '../core/util';
import { parseKey, wordSel, wordSelection } from './wordSelection';
import { createStore, useStore } from './createStore';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type EditScope = 'slide' | 'all';

export interface EditorState {
  project: Project | null;
  loading: boolean;
  loadError: string | null;
  slideId: string | null;
  layerId: string | null;
  /** outras camadas de texto selecionadas junto (Ctrl + clique): estilo e arraste valem para todas */
  extraLayerIds: string[];
  scope: EditScope;
  past: Project[];
  future: Project[];
  status: SaveStatus;
  saveError: string | null;
  lastSaved: number | null;
  /** Incrementado para reexecutar a animação na prévia. */
  replayKey: number;
}

const initial: EditorState = {
  project: null,
  loading: false,
  loadError: null,
  slideId: null,
  layerId: null,
  extraLayerIds: [],
  scope: 'slide',
  past: [],
  future: [],
  status: 'idle',
  saveError: null,
  lastSaved: null,
  replayKey: 0,
};

export const editorStore = createStore<EditorState>(initial);
export const useEditor = <T>(selector: (s: EditorState) => T, isEqual?: (a: T, b: T) => boolean): T => useStore(editorStore, selector, isEqual);

const HISTORY_LIMIT = 100;
const SAVE_DELAY = 400;
const BACKUP_EVERY = 2 * 60 * 1000;

let lastCoalesce: { key: string; at: number } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve();
let lastBackup = 0;

/* ------------------------------ persistência ------------------------------ */

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY);
}

export function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  saveChain = saveChain.then(async () => {
    const s = editorStore.get();
    const snapshot = s.project;
    if (!snapshot || (s.status !== 'dirty' && s.status !== 'saving' && s.status !== 'error')) return;
    editorStore.set({ status: 'saving' });
    try {
      const saved = await saveProject(snapshot);
      const now = Date.now();
      if (now - lastBackup > BACKUP_EVERY) {
        lastBackup = now;
        void writeSnapshot(snapshot).catch(() => undefined);
      }
      const stillSame = editorStore.get().project === snapshot;
      editorStore.set({ status: stillSame ? 'saved' : 'dirty', lastSaved: saved.updatedAt, saveError: null });
      if (!stillSame) scheduleSave();
    } catch (err) {
      console.error('[save] falha', err);
      editorStore.set({ status: 'error', saveError: err instanceof Error ? err.message : 'Falha ao salvar' });
    }
  });
  return saveChain;
}

if (typeof window !== 'undefined') {
  const flushNow = () => void flushSave();
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', (e) => {
    const st = editorStore.get().status;
    if (st === 'error') {
      e.preventDefault();
      e.returnValue = '';
    } else flushNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}

/* --------------------------------- núcleo --------------------------------- */

function fixSelection(project: Project, slideId: string | null, layerId: string | null) {
  const slide = project.slides.find((s) => s.id === slideId) ?? project.slides[0] ?? null;
  const layer = slide?.layers.find((l) => l.id === layerId) ?? slide?.layers[0] ?? null;
  const extras = editorStore.get().extraLayerIds.filter((id) => id !== layer?.id && !!slide?.layers.some((l) => l.id === id));
  return { slideId: slide?.id ?? null, layerId: layer?.id ?? null, extraLayerIds: extras };
}

/** Ids de todas as camadas selecionadas no trecho atual (a principal primeiro). */
function selectedIds(): string[] {
  const { layerId, extraLayerIds } = editorStore.get();
  return layerId ? [layerId, ...extraLayerIds.filter((x) => x !== layerId)] : [];
}

/**
 * Reaproveita as referências de trechos/tema que não mudaram. Assim miniaturas
 * e painéis memoizados não re-renderizam quando só um trecho foi alterado.
 */
function shareUnchanged(prev: Project, next: Project) {
  const prevSlides = new Map(prev.slides.map((s) => [s.id, s]));
  next.slides = next.slides.map((s) => {
    const p = prevSlides.get(s.id);
    return p && JSON.stringify(p) === JSON.stringify(s) ? p : s;
  });
  if (JSON.stringify(prev.theme) === JSON.stringify(next.theme)) next.theme = prev.theme;
}

function mutate(fn: (draft: Project) => void, opts: { coalesce?: string; select?: (draft: Project) => { slideId?: string; layerId?: string } } = {}) {
  const s = editorStore.get();
  if (!s.project) return;
  const draft = clone(s.project);
  fn(draft);
  shareUnchanged(s.project, draft);
  const now = Date.now();
  const merge = !!opts.coalesce && !!lastCoalesce && lastCoalesce.key === opts.coalesce && now - lastCoalesce.at < 800;
  lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
  const past = merge ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), s.project];
  const picked = opts.select?.(draft);
  const sel = fixSelection(draft, picked?.slideId ?? s.slideId, picked?.layerId ?? s.layerId);
  editorStore.set({ project: draft, past, future: [], status: 'dirty', ...sel });
  scheduleSave();
}

function currentSlide(draft: Project): Slide | undefined {
  const id = editorStore.get().slideId;
  return draft.slides.find((s) => s.id === id);
}

function currentLayer(draft: Project): TextLayer | undefined {
  const slide = currentSlide(draft);
  const lid = editorStore.get().layerId;
  return slide?.layers.find((l) => l.id === lid) ?? slide?.layers[0];
}

/* ---------------------------------- ações --------------------------------- */

export const editor = {
  async open(id: string) {
    await flushSave();
    lastCoalesce = null;
    editorStore.set({ ...initial, loading: true, scope: editorStore.get().scope });
    try {
      const project = await getProject(id);
      if (!project) {
        editorStore.set({ loading: false, loadError: 'Projeto não encontrado. Ele pode ter sido excluído.' });
        return;
      }
      lastBackup = Date.now();
      void writeSnapshot(project).catch(() => undefined);
      const sel = fixSelection(project, null, null);
      editorStore.set({ project, loading: false, loadError: null, status: 'saved', lastSaved: project.updatedAt, ...sel });
    } catch (err) {
      editorStore.set({ loading: false, loadError: err instanceof Error ? err.message : 'Não foi possível abrir o projeto.' });
    }
  },

  async close() {
    await flushSave();
    editorStore.set({ ...initial });
  },

  /** Substitui o projeto aberto (ex.: após restaurar um backup). */
  replaceProject(project: Project) {
    lastCoalesce = null;
    editorStore.set({ project: normalizeProject(project), past: [], future: [], status: 'dirty', ...fixSelection(project, null, null) });
    scheduleSave();
  },

  undo() {
    const s = editorStore.get();
    if (!s.project || !s.past.length) return;
    const prev = s.past[s.past.length - 1];
    lastCoalesce = null;
    editorStore.set({
      project: prev,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future].slice(0, HISTORY_LIMIT),
      status: 'dirty',
      ...fixSelection(prev, s.slideId, s.layerId),
    });
    scheduleSave();
  },

  redo() {
    const s = editorStore.get();
    if (!s.project || !s.future.length) return;
    const next = s.future[0];
    lastCoalesce = null;
    editorStore.set({
      project: next,
      past: [...s.past, s.project].slice(-HISTORY_LIMIT),
      future: s.future.slice(1),
      status: 'dirty',
      ...fixSelection(next, s.slideId, s.layerId),
    });
    scheduleSave();
  },

  setScope(scope: EditScope) {
    editorStore.set({ scope });
  },

  selectSlide(id: string) {
    const { project, slideId, layerId } = editorStore.get();
    if (!project) return;
    const slide = project.slides.find((s) => s.id === id);
    if (!slide) return;
    // mantém o mesmo tipo de camada selecionado (ex.: continuar editando o "Título")
    const curRole = project.slides.find((s) => s.id === slideId)?.layers.find((l) => l.id === layerId)?.role;
    const layer = slide.layers.find((l) => l.role === curRole) ?? slide.layers[0];
    editorStore.set({ slideId: id, layerId: layer.id, extraLayerIds: [] });
  },

  /**
   * Seleciona uma camada. Com `add` (Ctrl + clique), soma à seleção: a clicada vira a principal (é a que o
   * painel mostra) e as outras continuam juntas; Ctrl + clique numa que já estava junto tira ela da seleção.
   */
  selectLayer(id: string, add = false) {
    const { layerId, extraLayerIds } = editorStore.get();
    if (!add) return editorStore.set({ layerId: id, extraLayerIds: [] });
    if (id === layerId) return;
    if (extraLayerIds.includes(id)) return editorStore.set({ extraLayerIds: extraLayerIds.filter((x) => x !== id) });
    editorStore.set({ layerId: id, extraLayerIds: [...extraLayerIds, ...(layerId ? [layerId] : [])].filter((x, i, a) => x !== id && a.indexOf(x) === i) });
  },

  /** Torna principal uma camada que já está na seleção múltipla (sem desfazer o grupo). */
  focusLayer(id: string) {
    const { layerId, extraLayerIds } = editorStore.get();
    if (id === layerId || !extraLayerIds.includes(id)) return;
    editorStore.set({ layerId: id, extraLayerIds: [...extraLayerIds.filter((x) => x !== id), ...(layerId ? [layerId] : [])] });
  },

  /** Posição de várias camadas de uma vez (arrastar a seleção múltipla). Vale só para o trecho atual. */
  moveLayers(pos: Record<string, { x: number; y: number }>) {
    mutate(
      (d) => {
        const slide = currentSlide(d);
        for (const l of slide?.layers ?? []) {
          const p = pos[l.id];
          if (p) {
            l.style.x = p.x;
            l.style.y = p.y;
          }
        }
      },
      { coalesce: `move:${Object.keys(pos).sort().join(',')}` },
    );
  },

  replay() {
    editorStore.set((s) => ({ replayKey: s.replayKey + 1 }));
  },

  /* ---- trechos ---- */

  setLayerText(slideId: string, layerId: string, text: string) {
    mutate(
      (d) => {
        const layer = d.slides.find((s) => s.id === slideId)?.layers.find((l) => l.id === layerId);
        if (layer) {
          layer.text = text;
          pruneWords(layer);
        }
      },
      { coalesce: `text:${layerId}` },
    );
  },

  /* ---- palavras ---- */

  patchWords(targets: WordTarget[], patch: WordPatch) {
    if (!targets.length) return;
    mutate(
      (d) => {
        const slide = currentSlide(d);
        for (const t of targets) {
          const layer = slide?.layers.find((l) => l.id === t.layerId);
          if (layer) patchWord(layer, t.index, patch);
        }
      },
      { coalesce: `words:${targets.map((t) => `${t.layerId}.${t.index}`).join('|')}:${Object.keys(patch.style ?? {}).join(',')}:${patch.anim === undefined ? '' : 'a'}${patch.colorFx === undefined ? '' : 'c'}` },
    );
  },

  clearWords(targets: WordTarget[]) {
    mutate((d) => {
      const slide = currentSlide(d);
      for (const t of targets) {
        const layer = slide?.layers.find((l) => l.id === t.layerId);
        if (layer) clearWord(layer, t.index);
      }
    });
  },

  /** Layout "Impacto" só neste trecho (reescreve quebras de linha e ajustes por palavra da letra). */
  applyImpactToSlide() {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.role === 'lyrics');
      if (layer) applyImpactToLayer(layer, DEFAULT_IMPACT);
    });
  },

  /** Layout "Impacto" em TODOS os trechos do louvor (uma só entrada no desfazer). */
  applyImpactToAll() {
    mutate((d) => {
      for (const s of d.slides) for (const l of s.layers) if (l.role === 'lyrics') applyImpactToLayer(l, DEFAULT_IMPACT);
    });
  },

  /** Remove todos os ajustes por palavra (do trecho ou do louvor inteiro). */
  clearWordStyles(scope: 'slide' | 'all') {
    mutate((d) => {
      const slides = scope === 'all' ? d.slides : [currentSlide(d)].filter((x): x is Slide => !!x);
      for (const s of slides) for (const l of s.layers) delete l.words;
    });
  },

  /** Tema Impacto + layout automático em TODOS os trechos. */
  applyImpactAll() {
    const preset = getThemePreset('impacto');
    if (!preset) return;
    mutate((d) => {
      d.theme = clone(preset.theme);
      d.autoLayout = 'impact';
      for (const s of d.slides) {
        s.background = null;
        s.animation = null;
        for (const l of s.layers) {
          if (l.role === 'lyrics') {
            l.style = clone(preset.theme.text);
            applyImpactToLayer(l, DEFAULT_IMPACT);
          } else l.style = { ...l.style, fontFamily: preset.theme.text.fontFamily, color: preset.theme.text.color, shadow: clone(preset.theme.text.shadow), glow: clone(preset.theme.text.glow) };
        }
      }
    });
  },

  addSlide(afterId?: string | null, text = '') {
    const id = uid('s');
    mutate(
      (d) => {
        const slide = { ...newSlide(text, d.theme), id };
        const idx = d.slides.findIndex((s) => s.id === (afterId ?? editorStore.get().slideId));
        d.slides.splice(idx >= 0 ? idx + 1 : d.slides.length, 0, slide);
      },
      { select: () => ({ slideId: id }) },
    );
  },

  duplicateSlide(id: string) {
    const newId = uid('s');
    mutate(
      (d) => {
        const idx = d.slides.findIndex((s) => s.id === id);
        if (idx < 0) return;
        const copy = clone(d.slides[idx]);
        copy.id = newId;
        copy.layers = copy.layers.map((l) => ({ ...l, id: uid('l') }));
        d.slides.splice(idx + 1, 0, copy);
      },
      { select: () => ({ slideId: newId }) },
    );
  },

  deleteSlide(id: string) {
    const project = editorStore.get().project;
    if (!project) return;
    const idx = project.slides.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const nextId = project.slides[idx + 1]?.id ?? project.slides[idx - 1]?.id;
    mutate(
      (d) => {
        // mantém sempre ao menos um trecho: se for o último, apenas o esvazia
        if (d.slides.length <= 1) d.slides = [newSlide('', d.theme)];
        else d.slides.splice(idx, 1);
      },
      { select: (d) => ({ slideId: nextId ?? d.slides[0]?.id }) },
    );
  },

  moveSlide(from: number, to: number) {
    mutate((d) => {
      d.slides = move(d.slides, from, to);
    });
  },

  /**
   * Divide o texto da camada em `pos` (posição do cursor): o que vem depois vira um novo trecho
   * logo abaixo, com o mesmo estilo/fundo/animação. Retorna false se não houver o que dividir.
   */
  splitSlideAt(slideId: string, layerId: string, pos: number): boolean {
    const project = editorStore.get().project;
    const slide = project?.slides.find((s) => s.id === slideId);
    const layer = slide?.layers.find((l) => l.id === layerId);
    if (!project || !slide || !layer) return false;
    const before = layer.text.slice(0, pos).replace(/\s+$/, '');
    const after = layer.text.slice(pos).replace(/^\s+/, '');
    if (!before || !after) return false;
    const newId = uid('s');
    mutate(
      (d) => {
        const idx = d.slides.findIndex((s) => s.id === slideId);
        if (idx < 0) return;
        const src = d.slides[idx];
        const copy = clone(src);
        copy.id = newId;
        copy.label = '';
        copy.layers = copy.layers.map((l) => ({ ...l, id: uid('l') }));
        const srcLayer = src.layers.find((l) => l.id === layerId);
        const copyLayer = copy.layers[src.layers.findIndex((l) => l.id === layerId)];
        if (srcLayer) srcLayer.text = before;
        if (copyLayer) copyLayer.text = after;
        // camadas que não são a letra (título, crédito) ficam só no trecho original
        copy.layers = copy.layers.filter((l) => l === copyLayer || l.role === 'free');
        d.slides.splice(idx + 1, 0, copy);
      },
      { select: () => ({ slideId: newId }) },
    );
    return true;
  },

  /** Junta o trecho com o seguinte (o texto do seguinte vai para baixo, em novas linhas). */
  mergeWithNext(slideId: string): boolean {
    const project = editorStore.get().project;
    const idx = project?.slides.findIndex((s) => s.id === slideId) ?? -1;
    if (!project || idx < 0 || idx >= project.slides.length - 1) return false;
    mutate(
      (d) => {
        const a = d.slides[idx];
        const b = d.slides[idx + 1];
        const la = a.layers.find((l) => l.role === 'lyrics') ?? a.layers[0];
        const lb = b.layers.find((l) => l.role === 'lyrics') ?? b.layers[0];
        if (la && lb) la.text = [la.text.trimEnd(), lb.text.trimStart()].filter(Boolean).join('\n');
        d.slides.splice(idx + 1, 1);
      },
      { select: () => ({ slideId }) },
    );
    return true;
  },

  setSlideMeta(id: string, patch: Partial<Pick<Slide, 'label' | 'duration' | 'notes'>>) {
    mutate(
      (d) => {
        const s = d.slides.find((x) => x.id === id);
        if (s) Object.assign(s, patch);
      },
      { coalesce: `meta:${id}:${Object.keys(patch).join(',')}` },
    );
  },

  /* ---- camadas ---- */

  addLayer(role: LayerRole, text = '', at?: { x: number; y: number }): string {
    const id = uid('l');
    mutate(
      (d) => {
        const slide = currentSlide(d);
        if (!slide) return;
        const layer = newLayer(role, text, d.theme.text);
        layer.id = id;
        if (at) {
          layer.style.x = Math.round(clamp(at.x, 0, 100) * 10) / 10;
          layer.style.y = Math.round(clamp(at.y, 0, 100) * 10) / 10;
        }
        slide.layers.push(layer);
      },
      { select: () => ({ layerId: id, extraLayerIds: [] }) },
    );
    return id;
  },

  /** Texto livre novo, no terço de baixo do slide, já aberto para digitar no palco. */
  addFreeText() {
    const id = editor.addLayer('free', 'Novo texto', { x: 50, y: 80 });
    window.dispatchEvent(new CustomEvent('cs:edit-layer', { detail: id }));
    return id;
  },

  removeLayer(id: string) {
    mutate((d) => {
      const slide = currentSlide(d);
      if (!slide || slide.layers.length <= 1) return;
      slide.layers = slide.layers.filter((l) => l.id !== id);
    });
  },

  /** Sobe/desce a camada na pilha (o último da lista fica na frente). */
  moveLayer(id: string, how: LayerMove) {
    mutate((d) => {
      const slide = currentSlide(d);
      if (slide) slide.layers = reorderLayers(slide.layers, id, how);
    });
  },

  duplicateLayer(id: string) {
    const nid = uid('l');
    mutate(
      (d) => {
        const slide = currentSlide(d);
        const i = slide?.layers.findIndex((l) => l.id === id) ?? -1;
        if (!slide || i < 0) return;
        slide.layers.splice(i + 1, 0, copyLayer(slide.layers[i], nid));
      },
      { select: () => ({ layerId: nid }) },
    );
  },

  /** Desloca uma camada (em % do palco). `key` junta vários ajustes num único "desfazer". */
  nudgeLayer(id: string, dx: number, dy: number, key?: string) {
    mutate(
      (d) => {
        const layer = currentSlide(d)?.layers.find((l) => l.id === id);
        if (!layer) return;
        layer.style.x = Math.round(clamp(layer.style.x + dx, 0, 100) * 10) / 10;
        layer.style.y = Math.round(clamp(layer.style.y + dy, 0, 100) * 10) / 10;
      },
      key ? { coalesce: key } : {},
    );
  },

  /**
   * Tira uma palavra ou linha do texto e a transforma numa camada própria, no mesmo lugar e com o mesmo
   * tamanho (medidos na tela por quem chama). Depois é só arrastar. Devolve o id da camada nova.
   */
  detach(src: { layerId: string; kind: 'word' | 'line' | 'words'; index: number; indices?: number[] }, geom: { x: number; y: number; fontSize: number }): string | null {
    const nid = uid('l');
    let ok = false;
    mutate(
      (d) => {
        const slide = currentSlide(d);
        const from = slide?.layers.find((l) => l.id === src.layerId);
        if (!slide || !from) return;
        const many = src.kind === 'words' ? src.indices ?? [src.index] : null;
        const cut = many ? readWords(from, many) : src.kind === 'word' ? readWord(from, src.index) : readLine(from, src.index);
        if (!cut) return;
        const layer = detachedLayer(from, cut, geom, nid);
        if (many) removeWordsIn(from, many);
        else if (src.kind === 'word') removeWordIn(from, src.index);
        else removeLineIn(from, src.index);
        slide.layers.splice(slide.layers.findIndex((l) => l.id === from.id) + 1, 0, layer);
        ok = true;
      },
      { select: () => ({ layerId: nid }), coalesce: `detach:${nid}` },
    );
    if (ok) wordSelection.clear();
    return ok ? nid : null;
  },

  duplicateWord(layerId: string, index: number) {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.id === layerId);
      if (layer) duplicateWordIn(layer, index);
    });
    wordSelection.clear();
  },

  duplicateLine(layerId: string, lineIdx: number) {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.id === layerId);
      if (layer) duplicateLineIn(layer, lineIdx);
    });
    wordSelection.clear();
  },

  removeWord(layerId: string, index: number) {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.id === layerId);
      if (layer) removeWordIn(layer, index);
    });
    wordSelection.clear();
  },

  removeLine(layerId: string, lineIdx: number) {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.id === layerId);
      if (layer) removeLineIn(layer, lineIdx);
    });
    wordSelection.clear();
  },

  toggleLayer(id: string) {
    mutate((d) => {
      const layer = currentSlide(d)?.layers.find((l) => l.id === id);
      if (layer) layer.visible = !layer.visible;
    });
  },

  /* ---- estilo (respeita o escopo "este trecho" / "todos") ---- */

  patchStyle(patch: DeepPartial<TextStyle>) {
    const scope = editorStore.get().scope;
    mutate(
      (d) => {
        const layer = currentLayer(d);
        if (!layer) return;
        const slide = currentSlide(d);
        const ids = selectedIds();
        const group = (slide?.layers ?? []).filter((l) => ids.includes(l.id));
        // seleção múltipla: posição anda junto (mesmo deslocamento), o resto vale igual para todas
        const dx = patch.x !== undefined ? patch.x - layer.style.x : 0;
        const dy = patch.y !== undefined ? patch.y - layer.style.y : 0;
        const forLayer = (l: TextLayer): DeepPartial<TextStyle> =>
          l === layer || (patch.x === undefined && patch.y === undefined)
            ? patch
            : { ...patch, ...(patch.x !== undefined ? { x: Math.round((l.style.x + dx) * 10) / 10 } : {}), ...(patch.y !== undefined ? { y: Math.round((l.style.y + dy) * 10) / 10 } : {}) };
        if (scope === 'slide') {
          for (const l of group.length ? group : [layer]) l.style = deepMerge(l.style, forLayer(l));
          return;
        }
        const roles = new Set((group.length ? group : [layer]).map((l) => l.role));
        for (const s of d.slides) for (const l of s.layers) if (roles.has(l.role)) l.style = deepMerge(l.style, patch);
        if (roles.has('lyrics')) d.theme.text = deepMerge(d.theme.text, patch);
      },
      { coalesce: `style:${scope}:${editorStore.get().layerId}:${Object.keys(patch).join(',')}` },
    );
  },

  /** Volta o estilo de texto da camada ao padrão do tema (ou de todas as do mesmo tipo, no escopo "todos"). */
  resetStyle() {
    const scope = editorStore.get().scope;
    mutate((d) => {
      const layer = currentLayer(d);
      if (!layer) return;
      const base = clone(d.theme.text);
      const apply = (l: TextLayer) => {
        const fresh = newLayer(l.role, l.text, base);
        l.style = fresh.style;
      };
      if (scope === 'slide') apply(layer);
      else for (const s of d.slides) for (const l of s.layers) if (l.role === layer.role) apply(l);
    });
  },

  patchBackground(patch: DeepPartial<Background>) {
    const scope = editorStore.get().scope;
    mutate(
      (d) => {
        if (scope === 'all') {
          d.theme.background = deepMerge(d.theme.background, patch);
          d.slides.forEach((s) => (s.background = null));
          return;
        }
        const slide = currentSlide(d);
        if (slide) slide.background = deepMerge(resolveBackground(slide, d.theme), patch);
      },
      { coalesce: `bg:${scope}:${editorStore.get().slideId}:${Object.keys(patch).join(',')}` },
    );
  },

  /** Substitui o fundo inteiro (usado pelos presets da biblioteca). */
  /** Troca TODAS as cópias de um fundo do Estúdio no louvor (tema e trechos) pela versão nova, mantendo os ajustes. */
  replaceDesignCopies(design: BackgroundDesign) {
    mutate((d) => {
      const swap = (bg: Background) => (bg.kind === 'design' && bg.design?.id === design.id ? designBackground(design, bg) : bg);
      d.theme.background = swap(d.theme.background);
      for (const s of d.slides) if (s.background) s.background = swap(s.background);
    });
  },

  setBackground(bg: Background) {
    const scope = editorStore.get().scope;
    mutate((d) => {
      if (scope === 'all') {
        d.theme.background = clone(bg);
        d.slides.forEach((s) => (s.background = null));
      } else {
        const slide = currentSlide(d);
        if (slide) slide.background = clone(bg);
      }
    });
  },

  patchAnimation(patch: DeepPartial<AnimationConfig>) {
    const scope = editorStore.get().scope;
    mutate(
      (d) => {
        if (scope === 'all') {
          d.theme.animation = deepMerge(d.theme.animation, patch);
          d.slides.forEach((s) => (s.animation = null));
          return;
        }
        const slide = currentSlide(d);
        if (slide) slide.animation = deepMerge(resolveAnimation(slide, d.theme), patch);
      },
      { coalesce: `anim:${scope}:${editorStore.get().slideId}:${Object.keys(patch).join(',')}` },
    );
  },

  /**
   * Aplica um estilo de animação. Se o estilo tem troca de cor, ela vai para as palavras MARCADAS do trecho;
   * sem nenhuma marcada, para todas as palavras do trecho (ou de todos os trechos, no escopo "Todos").
   * Devolve quantas palavras receberam a troca de cor (0 se o estilo não tem cor).
   */
  setAnimationPreset(presetId: string): { colored: number; onSelection: boolean } {
    const scope = editorStore.get().scope;
    const color = getPreset(presetId)?.color;
    const sel = wordSel.get().keys.map(parseKey).filter((t): t is WordTarget => !!t);
    let colored = 0;
    let onSelection = false;
    mutate((d) => {
      if (scope === 'all') {
        d.theme.animation = applyPreset(presetId, d.theme.animation);
        d.slides.forEach((s) => (s.animation = null));
      } else {
        const slide = currentSlide(d);
        if (slide) slide.animation = applyPreset(presetId, resolveAnimation(slide, d.theme));
      }
      if (!color) return;
      const slide = currentSlide(d);
      const marked = slide ? sel.filter((t) => slide.layers.some((l) => l.id === t.layerId && t.index < wordCount(l.text))) : [];
      if (marked.length && slide) {
        onSelection = true;
        for (const t of marked) {
          const layer = slide.layers.find((l) => l.id === t.layerId)!;
          patchWord(layer, t.index, { colorFx: clone(color) });
          colored++;
        }
        return;
      }
      for (const s of scope === 'all' ? d.slides : slide ? [slide] : []) {
        for (const layer of s.layers) {
          const n = wordCount(layer.text);
          for (let i = 0; i < n; i++) patchWord(layer, i, { colorFx: clone(color) });
          colored += n;
        }
      }
    });
    editor.replay();
    return { colored, onSelection };
  },

  /** Tira a troca de cor de TODAS as palavras do trecho atual (ou de todos, no escopo "Todos"). */
  clearColorFx() {
    const scope = editorStore.get().scope;
    mutate((d) => {
      const slide = currentSlide(d);
      for (const s of scope === 'all' ? d.slides : slide ? [slide] : [])
        for (const layer of s.layers) for (const k of Object.keys(layer.words ?? {})) patchWord(layer, Number(k), { colorFx: null });
    });
  },

  /** Faz o trecho voltar a usar o fundo/animação do tema. */
  clearOverride(kind: 'background' | 'animation') {
    mutate((d) => {
      const slide = currentSlide(d);
      if (slide) slide[kind] = null;
    });
  },

  /* ---- projeto ---- */

  setProjectMeta(patch: Partial<Pick<Project, 'name' | 'artist' | 'category'>> & { aspect?: Aspect }) {
    mutate(
      (d) => {
        Object.assign(d, patch);
      },
      { coalesce: `pmeta:${Object.keys(patch).join(',')}` },
    );
  },

  applyLyrics(text: string, mode: SplitMode, how: 'replace' | 'append', maxLines = 4) {
    mutate(
      (d) => {
        const parts = splitLyrics(text, { mode, maxLines });
        const slides = parts.map((p) => newSlide(p.text, d.theme, p.label));
        if (d.autoLayout === 'impact') for (const sl of slides) for (const l of sl.layers) if (l.role === 'lyrics') applyImpactToLayer(l, DEFAULT_IMPACT);
        if (how === 'replace') {
          d.slides = slides.length ? slides : [newSlide('', d.theme)];
          d.lyrics = text;
        } else if (slides.length) {
          // se o projeto só tem o trecho vazio inicial, substitui
          const onlyEmpty = d.slides.length === 1 && d.slides[0].layers.every((l) => !l.text.trim());
          d.slides = onlyEmpty ? slides : [...d.slides, ...slides];
          d.lyrics = d.lyrics ? `${d.lyrics}\n\n${text}` : text;
        }
        d.splitMode = mode;
      },
      { select: (d) => ({ slideId: d.slides[0]?.id }) },
    );
  },

  applyTheme(theme: Theme) {
    mutate((d) => {
      d.theme = clone(theme);
      for (const s of d.slides) {
        s.background = null;
        s.animation = null;
        for (const l of s.layers) {
          if (l.role === 'lyrics') l.style = clone(theme.text);
          else l.style = { ...l.style, fontFamily: theme.text.fontFamily, color: theme.text.color, shadow: clone(theme.text.shadow), glow: clone(theme.text.glow) };
        }
      }
    });
  },
};

export function useActiveSlide(): Slide | null {
  return useEditor((s) => s.project?.slides.find((x) => x.id === s.slideId) ?? null);
}

/** Camadas selecionadas (principal + Ctrl + clique). */
export function useSelectedLayerIds(): string[] {
  const layerId = useEditor((s) => s.layerId);
  const extra = useEditor((s) => s.extraLayerIds);
  return layerId ? [layerId, ...extra.filter((x) => x !== layerId)] : [];
}

export function useActiveLayer(): TextLayer | null {
  return useEditor((s) => {
    const slide = s.project?.slides.find((x) => x.id === s.slideId);
    return slide?.layers.find((l) => l.id === s.layerId) ?? slide?.layers[0] ?? null;
  });
}
