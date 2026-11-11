import { clamp } from './util';

/**
 * Proporção automática entre linhas ("igualar largura").
 *
 * Ideia: num bloco como
 *     vem sobre mim        ← 3 palavras, letra pequena
 *     SENHOR               ← 1 palavra, letra grande
 * as duas linhas ocupam o MESMO comprimento: a que tem mais texto usa letra menor.
 *
 * Entrada: a largura natural (px) de cada linha com a escala 1, medida no navegador com a fonte real.
 * Saída: a escala de cada linha (1 = tamanho da camada). Matemática pura, sem IA, funciona offline.
 *
 * Quem define o comprimento (`alvo`):
 *  - Se as linhas têm tamanhos de fonte diferentes (ex.: palavra-chave gigante + resto pequeno), as linhas de
 *    MAIOR fonte são as "âncoras": o comprimento delas é o alvo. É o que mantém a hierarquia — a palavra
 *    grande continua grande e as linhas menores é que se ajustam a ela.
 *  - Se todas têm o mesmo tamanho de fonte, a linha mais estreita define o alvo e as outras encolhem.
 *
 * Regras de segurança:
 *  - Sem hierarquia (todas do mesmo tamanho) só ENCOLHE: nenhuma linha cresce além do tamanho da camada.
 *  - Com hierarquia, uma linha menor também pode CRESCER para alcançar o comprimento da palavra grande
 *    (como na referência, onde "vem sobre mim" e "SENHOR" têm o mesmo comprimento) — mas nunca passa de
 *    `MAX_RATIO` do tamanho da fonte grande, para a palavra-chave continuar mandando.
 *  - Nunca abaixo de `minScale` (senão uma linha enorme viraria letra miúda ilegível) e nunca mais larga
 *    que a caixa da camada (`blockWidth`).
 *  - Se TODAS as linhas forem mais largas que a caixa, o alvo é a própria caixa.
 *  - O alvo pode ter um piso (`minTarget`; no palco, 36% da caixa): com uma palavra-chave curta como "PAI",
 *    as outras linhas ficam mais largas que ela em vez de virar letra miúda.
 *  - Linhas vazias (largura 0) ficam com escala 1.
 */
/** Com hierarquia, a letra de uma linha menor nunca passa desta fração do tamanho da letra grande. */
export const MAX_RATIO = 0.62;

export interface EqualizeOptions {
  /** largura útil da camada, em px */
  blockWidth: number;
  /** 0–1: menor escala permitida */
  minScale: number;
  /** tamanho de fonte relativo de cada linha (1 = o da camada); por padrão todas iguais */
  bases?: number[];
  /**
   * Comprimento mínimo do alvo, em px. Uma palavra-chave muito curta ("PAI") não pode obrigar uma frase
   * longa a ficar do tamanho dela: o alvo nunca fica menor que isso. Ausente = sem piso.
   */
  minTarget?: number;
}

/** Fração da caixa usada como piso do alvo no palco (ver `minTarget`). */
export const MIN_TARGET_RATIO = 0.36;

/** Quais linhas definem o comprimento. Sem diferença de tamanho entre as linhas, todas são âncoras. */
export function anchorLines(naturals: number[], bases?: number[]): boolean[] {
  const filled = naturals.map((w) => Number.isFinite(w) && w > 0);
  if (!bases || bases.length !== naturals.length) return filled;
  const sizes = bases.filter((_, i) => filled[i]);
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  if (!(max - min > 1e-6)) return filled; // todas do mesmo tamanho
  return bases.map((b, i) => filled[i] && b >= max - 1e-6);
}

export function equalizeScales(naturals: number[], opts: EqualizeOptions): number[] {
  const filled = naturals.filter((w) => Number.isFinite(w) && w > 0);
  if (!filled.length || !(opts.blockWidth > 0)) return naturals.map(() => 1);
  const min = clamp(opts.minScale, 0.05, 1);
  const anchors = anchorLines(naturals, opts.bases);
  const anchorWidths = naturals.filter((w, i) => anchors[i] && Number.isFinite(w) && w > 0);
  const narrowest = Math.min(...(anchorWidths.length ? anchorWidths : filled));
  const floorTarget = Math.min(opts.minTarget ?? 0, Math.max(...filled));
  const target = Math.min(opts.blockWidth, Math.max(narrowest, floorTarget));
  const bases = opts.bases && opts.bases.length === naturals.length ? opts.bases : undefined;
  const maxBase = bases ? Math.max(...bases.filter((_, i) => anchors[i])) : 1;
  const hierarchy = !!bases && anchors.some((a, i) => !a && Number.isFinite(naturals[i]) && naturals[i] > 0);
  return naturals.map((w, i) => {
    if (!(Number.isFinite(w) && w > 0)) return 1;
    // teto: linhas âncora e sem hierarquia só encolhem; linhas menores podem crescer até MAX_RATIO da letra grande
    const up = hierarchy && !anchors[i] ? Math.max(1, (MAX_RATIO * maxBase) / (bases![i] || 1)) : 1;
    const hi = Math.min(up, opts.blockWidth / w); // nunca passa da caixa
    return clamp(target / w, Math.min(min, hi), hi);
  });
}
