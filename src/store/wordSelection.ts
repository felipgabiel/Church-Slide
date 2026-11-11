import type { WordTarget } from '../core/words';
import { createStore, useStore } from './createStore';

/**
 * Palavras selecionadas no editor (chave "idDaCamada:posição").
 * Fica fora do histórico de desfazer: selecionar não é uma edição.
 */
export const wordSel = createStore<{ keys: string[] }>({ keys: [] });

export const useWordSelection = () => useStore(wordSel, (s) => s.keys);

export const wordKey = (layerId: string, index: number) => `${layerId}:${index}`;

export function parseKey(key: string): WordTarget | null {
  const i = key.lastIndexOf(':');
  const index = Number(key.slice(i + 1));
  return i > 0 && Number.isInteger(index) ? { layerId: key.slice(0, i), index } : null;
}

export const wordSelection = {
  set(keys: string[]) {
    wordSel.set({ keys });
  },
  clear() {
    if (wordSel.get().keys.length) wordSel.set({ keys: [] });
  },
  /** Clique simples troca a seleção; com Shift/Ctrl soma ou tira. */
  click(key: string, additive: boolean) {
    const cur = wordSel.get().keys;
    if (!additive) return wordSel.set({ keys: [key] });
    wordSel.set({ keys: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
  },
};
