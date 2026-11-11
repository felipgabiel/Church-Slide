import type { AnimPhase, TextLayer, WordOverride } from './types';
import { patchWord, tokenizeText } from './words';

/**
 * Layout tipográfico automático "Impacto": uma palavra-chave GRANDE em maiúsculas e o
 * restante pequeno em minúsculas, como nos lyric videos de louvor
 * ("vem sobre mim" / "SENHOR"). Funções puras: recebem o texto e devolvem texto + ajustes.
 */

/** Nomes de Deus: têm prioridade máxima como palavra em destaque (sem acento, minúsculas). */
const NAMES = new Set([
  'senhor', 'deus', 'jesus', 'cristo', 'espirito', 'pai', 'rei', 'salvador', 'redentor', 'cordeiro', 'altissimo',
  'emanuel', 'messias', 'jeova', 'yahweh', 'adonai', 'elohim', 'abba', 'consolador',
]);
/** Outras palavras de peso em um louvor. */
const THEMES = new Set(['santo', 'aleluia', 'gloria', 'amor', 'fe', 'graca', 'paz', 'vida', 'hosana', 'maranata', 'leao']);

const keyScore = (w: string) => {
  const n = norm(w);
  return NAMES.has(n) ? 2 : THEMES.has(n) ? 1 : 0;
};

export interface ImpactOptions {
  /** tamanho das palavras pequenas em relação à grande (a grande usa o tamanho da camada) */
  smallScale: number;
  smallWeight: number;
  bigWeight: number;
  /** palavras pequenas em minúsculas (como na referência) */
  smallLower: boolean;
  /** palavras grandes em MAIÚSCULAS */
  bigUpper: boolean;
}

export const DEFAULT_IMPACT: ImpactOptions = { smallScale: 0.44, smallWeight: 700, bigWeight: 900, smallLower: true, bigUpper: true };

/** Efeito de entrada da palavra grande: "bate" na tela (maior → tamanho final) saindo do desfoque. */
export const IMPACT_ENTER: AnimPhase = { fade: true, slide: false, zoom: 'out', blur: true };

const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export interface ImpactResult {
  text: string;
  words: Record<string, WordOverride>;
}

/** Linhas pequenas com mais letras que isto são quebradas em partes parecidas (senão a "igualar largura" a deixaria minúscula). */
export const WRAP_CHARS = 26;

/**
 * Quebra uma sequência de palavras em linhas de comprimento parecido (em letras), com no máximo ~`maxChars`
 * cada. Só quebra entre palavras. Ex.: "Grande é o Senhor e muito digno de louvor" → "Grande é o Senhor e" / "muito digno de louvor".
 */
export function balanceWords(words: string[], maxChars = WRAP_CHARS): string[][] {
  const n = words.length;
  const width = (a: number, b: number) => words.slice(a, b).join(' ').length; // palavras [a, b)
  const total = width(0, n);
  const k = Math.min(n, Math.max(1, Math.ceil(total / maxChars)));
  if (k <= 1) return [words];
  // best[j][i] = menor "linha mais comprida" ao dividir as i primeiras palavras em j linhas
  const best: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= n; i++)
      for (let m = j - 1; m < i; m++) {
        const v = Math.max(best[j - 1][m], width(m, i));
        if (v < best[j][i]) {
          best[j][i] = v;
          cut[j][i] = m;
        }
      }
  const out: string[][] = [];
  for (let j = k, i = n; j >= 1; j--) {
    const m = cut[j][i];
    out.unshift(words.slice(m, i));
    i = m;
  }
  return out;
}

/** Quantas palavras no máximo uma linha tem para ser inteira "grande". */
const WHOLE_LINE_MAX = 3;

export function impactLayout(text: string, opts: ImpactOptions = DEFAULT_IMPACT): ImpactResult {
  const lines = tokenizeText(text).map((l) => ({ first: l.first, words: l.tokens.filter((t) => t.kind === 'word') }));
  const filled = lines.filter((l) => l.words.length > 0);
  if (filled.length === 0) return { text, words: {} };

  // 1. qual linha e qual(is) palavra(s) ficam grandes
  let bigLine = -1;
  let bigKey = -1; // posição da palavra-chave na linha
  let bestScore = 0;
  lines.forEach((l, i) =>
    l.words.forEach((w, j) => {
      const sc = keyScore(w.text);
      if (sc > 0 && sc >= bestScore) {
        bestScore = sc;
        bigLine = i;
        bigKey = j;
      }
    }),
  );
  if (bigLine < 0) {
    // sem palavra-chave: a linha mais curta (empate → a última)
    let best = -1;
    lines.forEach((l, i) => {
      if (l.words.length === 0) return;
      if (best < 0 || l.words.length <= lines[best].words.length) best = i;
    });
    bigLine = best;
    bigKey = lines[best].words.length - 1;
  }
  const whole = lines[bigLine].words.length <= WHOLE_LINE_MAX;

  // 2. reescreve o texto: a palavra-chave ganha a própria linha
  const out: string[] = [];
  const bigIdx = new Set<number>();
  lines.forEach((l, i) => {
    if (l.words.length === 0) {
      out.push('');
      return;
    }
    if (i !== bigLine) {
      for (const part of balanceWords(l.words.map((w) => w.text))) out.push(part.join(' '));
      return;
    }
    if (whole) {
      l.words.forEach((w) => bigIdx.add(w.index));
      out.push(l.words.map((w) => w.text).join(' '));
      return;
    }
    const before = l.words.slice(0, bigKey).map((w) => w.text);
    const after = l.words.slice(bigKey + 1).map((w) => w.text);
    if (before.length) for (const part of balanceWords(before)) out.push(part.join(' '));
    out.push(l.words[bigKey].text);
    bigIdx.add(l.words[bigKey].index);
    if (after.length) for (const part of balanceWords(after)) out.push(part.join(' '));
  });

  // 3. ajustes por palavra
  const total = lines.reduce((n, l) => n + l.words.length, 0);
  const holder = { words: undefined } as unknown as TextLayer;
  for (let idx = 0; idx < total; idx++) {
    if (bigIdx.has(idx)) {
      patchWord(holder, idx, {
        style: { weight: opts.bigWeight, ...(opts.bigUpper ? { textCase: 'upper' as const } : {}) },
        anim: { enter: IMPACT_ENTER, delay: 140, duration: 900, intensity: 70 },
      });
    } else {
      patchWord(holder, idx, {
        style: { scale: opts.smallScale, weight: opts.smallWeight, ...(opts.smallLower ? { textCase: 'lower' as const } : {}) },
      });
    }
  }
  return { text: out.join('\n'), words: holder.words ?? {} };
}

/** Aplica o layout a uma camada de letra. */
export function applyImpactToLayer(layer: TextLayer, opts: ImpactOptions = DEFAULT_IMPACT): void {
  const r = impactLayout(layer.text, opts);
  layer.text = r.text;
  if (Object.keys(r.words).length) layer.words = r.words;
  else delete layer.words;
  // proporção automática: a linha com mais palavras encolhe até ter o comprimento da palavra grande
  layer.style = { ...layer.style, equalize: true, autoWidth: false };
}
