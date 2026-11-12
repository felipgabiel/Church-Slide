import { readSetting, writeSetting } from '../settings';
import { tr } from '../i18n';

export type PresentAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'blackout' }
  | { type: 'fullscreen' }
  | { type: 'exit' }
  | { type: 'nextSong' }
  | { type: 'prevSong' }
  | { type: 'jump'; index: number }
  | { type: 'replay' };

/** Ações que podem ter teclas personalizadas (1–9 "ir ao trecho" ficam fixas). */
export type BindableAction = Exclude<PresentAction['type'], 'jump'>;

/** Teclas por ação. Cada tecla é um `KeyboardEvent.key` normalizado (ver `normKey`). */
export type Bindings = Record<BindableAction, string[]>;

export const ACTION_LABELS: Record<BindableAction, string> = {
  next: tr('Próximo trecho'),
  prev: tr('Trecho anterior'),
  first: tr('Primeiro trecho'),
  last: tr('Último trecho'),
  nextSong: tr('Próximo louvor'),
  prevSong: tr('Louvor anterior'),
  blackout: tr('Tela preta'),
  fullscreen: tr('Tela cheia'),
  replay: tr('Repetir animação'),
  exit: tr('Sair da apresentação'),
};

/** Ordem de exibição na interface. */
export const ACTION_ORDER: BindableAction[] = ['next', 'prev', 'first', 'last', 'nextSong', 'prevSong', 'blackout', 'fullscreen', 'replay', 'exit'];

export const DEFAULT_BINDINGS: Bindings = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'],
  first: ['Home'],
  last: ['End'],
  nextSong: [']'],
  prevSong: ['['],
  blackout: ['b', '.'],
  fullscreen: ['f'],
  replay: ['r'],
  exit: ['Escape'],
};

/** Sem pelo menos uma tecla nestas ações o operador perderia o controle no meio do culto. */
const REQUIRED: BindableAction[] = ['next', 'prev'];

const SETTING_KEY = 'shortcuts';

/** Letras são tratadas sem diferenciar maiúscula/minúscula (Caps Lock não pode quebrar o atalho). */
export function normKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Teclas que não podem ser atribuídas: dígitos (ir ao trecho) e modificadores/teclas mortas. */
export function isReservedKey(key: string): boolean {
  return /^[0-9]$/.test(key) || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Unidentified', 'Tab', 'ContextMenu'].includes(key);
}

const KEY_NAMES: Record<string, string> = {
  ' ': tr('Espaço'),
  ArrowRight: '→',
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageDown: 'PgDn',
  PageUp: 'PgUp',
  Escape: 'Esc',
  Backspace: '⌫',
  Enter: 'Enter',
  Home: 'Home',
  End: 'End',
  Delete: 'Del',
};

export function keyLabel(key: string): string {
  return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** Lê um valor salvo e devolve apenas o que é válido, completando com o padrão. */
export function sanitizeBindings(raw: unknown): Bindings {
  const out = {} as Bindings;
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const used = new Set<string>();
  for (const action of ACTION_ORDER) {
    const v = src[action];
    let keys = Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.length > 0 && !isReservedKey(k)).map(normKey) : null;
    if (keys) keys = keys.filter((k, i) => keys!.indexOf(k) === i && !used.has(k));
    if (!keys || (keys.length === 0 && REQUIRED.includes(action))) keys = DEFAULT_BINDINGS[action].filter((k) => !used.has(k));
    keys.forEach((k) => used.add(k));
    out[action] = keys;
  }
  return out;
}

export function getBindings(): Bindings {
  return sanitizeBindings(readSetting<unknown>(SETTING_KEY, null));
}

export function saveBindings(b: Bindings) {
  writeSetting(SETTING_KEY, b);
}

export function resetBindings() {
  writeSetting(SETTING_KEY, null);
}

export type AssignResult = { ok: true; bindings: Bindings; stolenFrom?: BindableAction } | { ok: false; reason: string };

/** Atribui uma tecla a uma ação. Se outra ação já usava a tecla, ela é movida (e avisamos qual perdeu). */
export function assignKey(current: Bindings, action: BindableAction, rawKey: string): AssignResult {
  const key = normKey(rawKey);
  if (isReservedKey(key)) return { ok: false, reason: /^[0-9]$/.test(key) ? tr('Os números 1–9 já escolhem o trecho e não podem ser trocados.') : tr('Essa tecla não pode ser usada como atalho.') };
  if (current[action].includes(key)) return { ok: true, bindings: current };
  const next = Object.fromEntries(ACTION_ORDER.map((a) => [a, [...current[a]]])) as Bindings;
  let stolenFrom: BindableAction | undefined;
  for (const a of ACTION_ORDER) {
    if (a !== action && next[a].includes(key)) {
      if (REQUIRED.includes(a) && next[a].length === 1) return { ok: false, reason: tr('“{0}” é a única tecla de “{1}”. Dê outra tecla a essa ação antes.', keyLabel(key), ACTION_LABELS[a]) };
      next[a] = next[a].filter((k) => k !== key);
      stolenFrom = a;
    }
  }
  next[action].push(key);
  return { ok: true, bindings: next, stolenFrom };
}

export function removeKey(current: Bindings, action: BindableAction, key: string): AssignResult {
  if (REQUIRED.includes(action) && current[action].length <= 1) return { ok: false, reason: tr('“{0}” precisa ter ao menos uma tecla.', ACTION_LABELS[action]) };
  return { ok: true, bindings: { ...current, [action]: current[action].filter((k) => k !== key) } };
}

export interface ShortcutHelp {
  keys: string;
  label: string;
}

/** Lista para exibição, refletindo as teclas atuais. */
export function shortcutHelp(b: Bindings = getBindings()): ShortcutHelp[] {
  const rows = ACTION_ORDER.map((a) => ({ keys: b[a].map(keyLabel).join('  ') || '—', label: ACTION_LABELS[a] }));
  rows.splice(4, 0, { keys: '1 – 9', label: tr('Ir direto ao trecho') });
  return rows;
}

/** Converte um evento de teclado em ação (ou null se a tecla não for atalho). */
export function keyToAction(e: KeyboardEvent, bindings: Bindings = getBindings()): PresentAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return null;

  const key = normKey(e.key);
  if (/^[1-9]$/.test(key)) return { type: 'jump', index: Number(key) - 1 };
  for (const action of ACTION_ORDER) {
    if (bindings[action].includes(key)) return { type: action };
  }
  return null;
}
