import { en } from '../i18n/en';
import { es } from '../i18n/es';

/**
 * Idioma da interface. O texto-fonte é o português: `tr('Novo louvor')` devolve a tradução do idioma escolhido,
 * ou o próprio texto se não houver. `{0}`, `{1}`… são trocados pelos argumentos.
 * A escolha fica em `cs:lang`; trocar de idioma recarrega a página (os rótulos de módulo são lidos uma vez).
 */
export type Lang = 'pt-BR' | 'en' | 'es';

export const LANGS: { id: Lang; label: string; hint: string }[] = [
  { id: 'pt-BR', label: 'Português', hint: 'Brasil' },
  { id: 'en', label: 'English', hint: 'Inglês · Inglés' },
  { id: 'es', label: 'Español', hint: 'Espanhol · Spanish' },
];

const KEY = 'cs:lang';

function stored(): Lang | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v === 'pt-BR' || v === 'en' || v === 'es' ? v : null;
  } catch {
    return null;
  }
}

/** Sem escolha salva: o idioma do navegador, se for um dos três; senão português. */
function guess(): Lang {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'pt-BR';
  const n = (navigator.language || 'pt-BR').toLowerCase();
  if (n.startsWith('es')) return 'es';
  if (n.startsWith('en')) return 'en';
  return 'pt-BR';
}

export const LANG: Lang = stored() ?? guess();
/** A pessoa já escolheu o idioma (a tela de boas-vindas não aparece de novo). */
export const langChosen = (): boolean => stored() !== null;

const DICT: Record<string, string> | null = LANG === 'en' ? en : LANG === 'es' ? es : null;

export function tr(text: string, ...args: (string | number)[]): string {
  const s = (DICT && DICT[text]) || text;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? '')) : s;
}

/** Plural simples: `trn(n, 'trecho', 'trechos')` (as duas formas passam pela tradução). */
export function trn(n: number, one: string, many: string): string {
  return n === 1 ? tr(one) : tr(many);
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lang));
  } catch {
    /* ignore */
  }
}

/** Troca o idioma e recarrega para todos os textos virem no idioma novo. */
export function setLang(lang: Lang) {
  saveLang(lang);
  location.reload();
}
