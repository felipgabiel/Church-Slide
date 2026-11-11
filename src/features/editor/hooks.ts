import { useCallback, useEffect, useRef, useState } from 'react';
import { editor } from '../../store/editor';
import { createStore, useStore } from '../../store/createStore';
import type { CustomFont } from '../../core/fonts';
import { listMedia, loadCustomFonts } from '../../core/storage/media';
import type { MediaRecord, Slide } from '../../core/types';
import { wordCount, type WordTarget } from '../../core/words';
import { parseKey } from '../../store/wordSelection';

/** Contador que sobe sempre que a biblioteca de mídia muda (upload/remoção). */
const mediaVersion = createStore<{ v: number }>({ v: 0 });
export const bumpMedia = () => mediaVersion.set((s) => ({ v: s.v + 1 }));

export function useMediaList(kinds: MediaRecord['kind'][]): { items: MediaRecord[]; loading: boolean } {
  const v = useStore(mediaVersion, (s) => s.v);
  const [state, setState] = useState<{ items: MediaRecord[]; loading: boolean }>({ items: [], loading: true });
  const key = kinds.join(',');
  useEffect(() => {
    let alive = true;
    listMedia()
      .then((all) => alive && setState({ items: all.filter((m) => kinds.includes(m.kind)), loading: false }))
      .catch(() => alive && setState({ items: [], loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);
  return state;
}

/** Fontes enviadas pelo usuário (registradas no navegador ao carregar). */
export function useCustomFonts() {
  const v = useStore(mediaVersion, (s) => s.v);
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  useEffect(() => {
    let alive = true;
    loadCustomFonts()
      .then((f) => alive && setFonts(f))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [v]);
  return fonts;
}

/** Repete a animação na prévia pouco depois do último ajuste (para ver o efeito de um slider). */
export function useDebouncedReplay(ms = 380) {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return useCallback(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => editor.replay(), ms);
  }, [ms]);
}

/** Palavras marcadas que ainda existem no trecho (a camada existe e a palavra ainda está no texto). */
export function selectedTargets(slide: Slide | null, keys: string[]): WordTarget[] {
  if (!slide) return [];
  return keys
    .map(parseKey)
    .filter((t): t is WordTarget => !!t)
    .filter((t) => {
      const l = slide.layers.find((x) => x.id === t.layerId);
      return !!l && t.index < wordCount(l.text);
    });
}
