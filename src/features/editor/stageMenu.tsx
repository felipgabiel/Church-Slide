import { flushSync } from 'react-dom';
import {
  LuPalette,
  LuAlignHorizontalJustifyCenter,
  LuAlignVerticalJustifyCenter,
  LuArrowDown,
  LuArrowUp,
  LuChevronsDown,
  LuChevronsUp,
  LuCopy,
  LuEyeOff,
  LuMove,
  LuPencil,
  LuPlus,
  LuSplit,
  LuTrash2,
} from 'react-icons/lu';
import { canMoveLayer, lineOfWord, wordAt as textWordAt } from '../../core/layers';
import { tokenizeText } from '../../core/words';
import type { Slide } from '../../core/types';
import { editor } from '../../store/editor';
import { wordKey, wordSel, wordSelection } from '../../store/wordSelection';
import { writeSetting } from '../../core/settings';
import type { ContextItem } from '../../ui/ContextMenu';
import { tr } from '../../core/i18n';

/** Posição (em % do palco) e tamanho (em % da altura) de um conjunto de elementos, medidos na tela. */
interface Measured {
  x: number;
  y: number;
  fontSize: number;
}

function measure(stage: HTMLElement, els: HTMLElement[], sizeFrom: HTMLElement): Measured | null {
  if (!els.length) return null;
  const p = stage.getBoundingClientRect();
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of els) {
    const q = el.getBoundingClientRect();
    l = Math.min(l, q.left);
    t = Math.min(t, q.top);
    r = Math.max(r, q.right);
    b = Math.max(b, q.bottom);
  }
  if (!(p.width > 0 && p.height > 0)) return null;
  const px = parseFloat(getComputedStyle(sizeFrom).fontSize);
  return {
    x: (((l + r) / 2 - p.left) / p.width) * 100,
    y: (((t + b) / 2 - p.top) / p.height) * 100,
    fontSize: Math.round((px / p.height) * 100 * 100) / 100,
  };
}

const lastFrame = (stage: HTMLElement) => {
  const frames = stage.querySelectorAll('.text-frame');
  return frames[frames.length - 1] ?? null;
};

const wordEl = (stage: HTMLElement, layerId: string, index: number) =>
  lastFrame(stage)?.querySelector<HTMLElement>(`[data-lid="${CSS.escape(layerId)}"][data-w="${index}"]`) ?? null;

function lineEls(stage: HTMLElement, layerId: string, text: string, lineIdx: number): { els: HTMLElement[]; block: HTMLElement } | null {
  const line = tokenizeText(text)[lineIdx];
  if (!line || !line.count) return null;
  const els: HTMLElement[] = [];
  for (let i = 0; i < line.count; i++) {
    const el = wordEl(stage, layerId, line.first + i);
    if (el) els.push(el);
  }
  const block = els[0]?.closest<HTMLElement>('.ln');
  return els.length && block ? { els, block } : null;
}

/**
 * Tira a palavra/linha do texto e a deixa solta, exatamente onde estava. A posição e o tamanho vêm da tela;
 * depois de criada, a camada é medida de novo e corrigida, tudo no mesmo "desfazer".
 */
export function detachFromStage(stage: HTMLElement, slide: Slide, layerId: string, kind: 'word' | 'line' | 'words', index: number, indices?: number[]): boolean {
  const layer = slide.layers.find((l) => l.id === layerId);
  if (!layer) return false;
  let m: Measured | null = null;
  let target: { x: number; y: number } | null = null;
  if (kind === 'word') {
    const el = wordEl(stage, layerId, index);
    m = el ? measure(stage, [el], el) : null;
  } else if (kind === 'words') {
    // a frase marcada: posição de todas juntas; tamanho da maior palavra (as outras ficam proporcionais)
    const els = (indices ?? [index]).map((i) => wordEl(stage, layerId, i)).filter((e): e is HTMLElement => !!e);
    const biggest = els.reduce<HTMLElement | null>((a, e) => (!a || parseFloat(getComputedStyle(e).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? e : a), null);
    m = biggest ? measure(stage, els, biggest) : null;
  } else {
    const found = lineEls(stage, layerId, layer.text, index);
    m = found ? measure(stage, found.els, found.block) : null;
  }
  if (!m) return false;
  target = { x: m.x, y: m.y };
  let id: string | null = null;
  flushSync(() => {
    id = editor.detach({ layerId, kind, index, indices }, m!);
  });
  if (!id) return false;
  const el = Array.from(stage.querySelectorAll<HTMLElement>(`[data-layer="${id}"]`)).pop();
  if (el) {
    const p = stage.getBoundingClientRect();
    const q = el.getBoundingClientRect();
    const dx = target.x - (((q.left + q.right) / 2 - p.left) / p.width) * 100;
    const dy = target.y - (((q.top + q.bottom) / 2 - p.top) / p.height) * 100;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) editor.nudgeLayer(id, dx, dy, `detach:${id}`);
  }
  return true;
}

interface MenuArgs {
  stage: HTMLElement;
  slide: Slide;
  /** palavra sob o ponteiro, se houver */
  word: { layerId: string; index: number } | null;
  /** camada sob o ponteiro (ou a selecionada) */
  layerId: string | null;
  /** posição do clique em % do palco */
  at: { x: number; y: number };
  toast: (msg: string) => void;
}

/** Monta os itens do menu de clique direito conforme o que está sob o ponteiro. */
export function buildStageMenu({ stage, slide, word, layerId, at, toast }: MenuArgs): ContextItem[] {
  const items: ContextItem[] = [];
  const layer = slide.layers.find((l) => l.id === (word?.layerId ?? layerId));

  if (word && layer) {
    const text = textWordAt(layer.text, word.index);
    const line = lineOfWord(layer.text, word.index);
    const shown = text.length > 18 ? `${text.slice(0, 17)}…` : text;
    items.push({ heading: tr('Palavra “{0}”', shown) });
    // várias palavras marcadas nesta camada (Shift + clique) e o clique foi numa delas: solta a frase inteira
    const marked = wordSel
      .get()
      .keys.filter((k) => k.slice(0, k.lastIndexOf(':')) === layer.id)
      .map((k) => Number(k.slice(k.lastIndexOf(':') + 1)));
    if (marked.length > 1 && marked.includes(word.index)) {
      items.push({
        label: tr('Soltar as {0} palavras juntas', marked.length),
        icon: <LuMove />,
        hint: tr('a frase marcada'),
        onClick: () => {
          if (!detachFromStage(stage, slide, layer.id, 'words', word.index, marked)) toast(tr('Não foi possível soltar as palavras.'));
        },
      });
    }
    items.push({
      label: marked.length > 1 && marked.includes(word.index) ? tr('Soltar só esta palavra') : tr('Soltar para mover'),
      icon: <LuMove />,
      hint: tr('arraste depois'),
      onClick: () => {
        if (!detachFromStage(stage, slide, layer.id, 'word', word.index)) toast(tr('Não foi possível soltar a palavra.'));
      },
    });
    items.push({
      label: tr('Editar esta palavra'),
      icon: <LuPencil />,
      onClick: () => {
        wordSelection.set([wordKey(layer.id, word.index)]);
        writeSetting('right-tab', 'words');
      },
    });
    items.push({
      label: tr('Troca de cor…'),
      icon: <LuPalette />,
      hint: tr('marcadas'),
      onClick: () => {
        // clicou numa palavra que já está marcada: vale para todas as marcadas; senão, só para esta
        const key = wordKey(layer.id, word.index);
        if (!wordSel.get().keys.includes(key)) wordSelection.set([key]);
        writeSetting('right-tab', 'animation');
      },
    });
    items.push({ label: tr('Duplicar palavra'), icon: <LuCopy />, onClick: () => editor.duplicateWord(layer.id, word.index) });
    items.push({ label: tr('Excluir palavra'), icon: <LuTrash2 />, danger: true, onClick: () => editor.removeWord(layer.id, word.index) });
    items.push({ divider: true });
    items.push({ heading: tr('Linha inteira') });
    items.push({
      label: tr('Soltar linha para mover'),
      icon: <LuSplit />,
      onClick: () => {
        if (!detachFromStage(stage, slide, layer.id, 'line', line)) toast(tr('Não foi possível soltar a linha.'));
      },
    });
    items.push({ label: tr('Duplicar linha'), icon: <LuCopy />, onClick: () => editor.duplicateLine(layer.id, line) });
    items.push({ label: tr('Excluir linha'), icon: <LuTrash2 />, danger: true, onClick: () => editor.removeLine(layer.id, line) });
  }

  if (layer) {
    if (items.length) items.push({ divider: true });
    items.push({ heading: tr('Camada “{0}”', layer.name) });
    const ls = slide.layers;
    items.push({ label: tr('Trazer para frente'), icon: <LuChevronsUp />, disabled: !canMoveLayer(ls, layer.id, 'front'), onClick: () => editor.moveLayer(layer.id, 'front') });
    items.push({ label: tr('Subir uma camada'), icon: <LuArrowUp />, disabled: !canMoveLayer(ls, layer.id, 'up'), onClick: () => editor.moveLayer(layer.id, 'up') });
    items.push({ label: tr('Descer uma camada'), icon: <LuArrowDown />, disabled: !canMoveLayer(ls, layer.id, 'down'), onClick: () => editor.moveLayer(layer.id, 'down') });
    items.push({ label: tr('Enviar para trás'), icon: <LuChevronsDown />, disabled: !canMoveLayer(ls, layer.id, 'back'), onClick: () => editor.moveLayer(layer.id, 'back') });
    items.push({ divider: true });
    items.push({ label: tr('Centralizar na horizontal'), icon: <LuAlignHorizontalJustifyCenter />, onClick: () => { editor.selectLayer(layer.id); editor.patchStyle({ x: 50 }); } });
    items.push({ label: tr('Centralizar na vertical'), icon: <LuAlignVerticalJustifyCenter />, onClick: () => { editor.selectLayer(layer.id); editor.patchStyle({ y: 50 }); } });
    items.push({ divider: true });
    items.push({ label: tr('Duplicar camada'), icon: <LuCopy />, onClick: () => editor.duplicateLayer(layer.id) });
    items.push({ label: tr('Ocultar camada'), icon: <LuEyeOff />, onClick: () => editor.toggleLayer(layer.id) });
    items.push({ label: tr('Excluir camada'), icon: <LuTrash2 />, danger: true, disabled: ls.length <= 1, hint: ls.length <= 1 ? tr('a única') : undefined, onClick: () => editor.removeLayer(layer.id) });
  }

  if (items.length) items.push({ divider: true });
  items.push({ label: tr('Adicionar texto aqui'), icon: <LuPlus />, onClick: () => editor.addLayer('free', tr('Novo texto'), at) });
  return items;
}
