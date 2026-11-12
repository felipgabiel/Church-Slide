import { useEffect, useMemo, useState } from 'react';
import { LuPlus, LuRotateCcw, LuX } from 'react-icons/lu';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  assignKey,
  keyLabel,
  removeKey,
  resetBindings,
  saveBindings,
  sanitizeBindings,
  type AssignResult,
  type BindableAction,
} from '../../core/present/shortcuts';
import { useSetting } from '../../core/settings';
import { Button } from '../../ui/Button';
import { tr } from '../../core/i18n';

/**
 * Editor de atalhos da apresentação.
 * As teclas ficam em localStorage (mesma origem do telão), então a janela do público
 * e a do operador passam a obedecer às mesmas teclas assim que você muda.
 */
export function ShortcutsEditor() {
  const [raw] = useSetting<unknown>('shortcuts', null);
  const bindings = useMemo(() => sanitizeBindings(raw), [raw]);
  const [capturing, setCapturing] = useState<BindableAction | null>(null);
  const [note, setNote] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const apply = (r: AssignResult, okText?: (r: Extract<AssignResult, { ok: true }>) => string | null) => {
    if (!r.ok) {
      setNote({ kind: 'error', text: r.reason });
      return false;
    }
    saveBindings(r.bindings);
    const t = okText?.(r) ?? null;
    setNote(t ? { kind: 'info', text: t } : null);
    return true;
  };

  // captura a próxima tecla pressionada (fase de captura: ninguém mais a recebe)
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; // espera a tecla "de verdade"
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        setNote(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        setNote({ kind: 'error', text: tr('Combinações com Ctrl, Alt ou ⌘ não são suportadas. Use uma tecla simples.') });
        return;
      }
      const action = capturing;
      const ok = apply(assignKey(bindings, action, e.key), (r) => (r.stolenFrom ? tr('“{0}” deixou de ser “{1}” e agora é “{2}”.', keyLabel(e.key), ACTION_LABELS[r.stolenFrom], ACTION_LABELS[action]) : null));
      if (ok) setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, bindings]); // eslint-disable-line react-hooks/exhaustive-deps

  const custom = JSON.stringify(raw ?? null) !== 'null';

  return (
    <div className="sce">
      <ul className="sce-list">
        {ACTION_ORDER.map((a) => (
          <li key={a} className="sce-row" data-capturing={capturing === a ? '1' : undefined}>
            <span className="sce-label">{ACTION_LABELS[a]}</span>
            <span className="sce-keys">
              {bindings[a].map((k) => (
                <span key={k} className="sce-chip">
                  <kbd className="kbd">{keyLabel(k)}</kbd>
                  <button type="button" aria-label={tr('Remover a tecla {0} de {1}', keyLabel(k), ACTION_LABELS[a])} onClick={() => apply(removeKey(bindings, a, k))}>
                    <LuX aria-hidden />
                  </button>
                </span>
              ))}
              {bindings[a].length === 0 && capturing !== a && <span className="sce-none">{tr('sem tecla')}</span>}
              {capturing === a ? (
                <span className="sce-wait" role="status">
                  {tr('Pressione uma tecla…')}{' '}<small>{tr('(Esc cancela)')}</small>
                </span>
              ) : (
                <button type="button" className="sce-add" aria-label={tr('Adicionar tecla para {0}', ACTION_LABELS[a])} onClick={() => { setNote(null); setCapturing(a); }}>
                  <LuPlus aria-hidden />
                </button>
              )}
            </span>
          </li>
        ))}
        <li className="sce-row sce-fixed">
          <span className="sce-label">{tr('Ir direto ao trecho')}</span>
          <span className="sce-keys">
            <kbd className="kbd">1</kbd>
            <span className="sce-none">a</span>
            <kbd className="kbd">9</kbd>
            <span className="sce-none">{tr('fixo')}</span>
          </span>
        </li>
      </ul>

      <p className="sce-note" data-kind={note?.kind ?? 'none'} role="status" aria-live="polite">
        {note?.text ?? ' '}
      </p>

      <div className="sce-foot">
        <Button
          size="sm"
          icon={<LuRotateCcw />}
          disabled={!custom}
          onClick={() => {
            resetBindings();
            setCapturing(null);
            setNote({ kind: 'info', text: tr('Atalhos restaurados ao padrão.') });
          }}
        >
          {tr('Restaurar padrão')}
        </Button>
        <span className="op-keys-note">{tr('Os atalhos valem também com a janela do telão em foco.')}</span>
      </div>
    </div>
  );
}
