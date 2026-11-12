import { useEffect, useState, type ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuInfo } from 'react-icons/lu';
import { createStore, useStore } from '../store/createStore';
import { Button } from './Button';
import { Modal } from './Modal';
import { tr } from '../core/i18n';

/* ------------------------------- toasts ------------------------------- */

interface ToastItem {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

const toasts = createStore<{ list: ToastItem[] }>({ list: [] });
let seq = 0;

export function toast(text: string, kind: ToastItem['kind'] = 'ok', ms = 3200) {
  const id = ++seq;
  toasts.set((s) => ({ list: [...s.list.slice(-3), { id, kind, text }] }));
  setTimeout(() => toasts.set((s) => ({ list: s.list.filter((t) => t.id !== id) })), kind === 'error' ? Math.max(ms, 6000) : ms);
}
export const toastError = (text: string) => toast(text, 'error');

/* ------------------------------ diálogos ------------------------------ */

interface ConfirmReq {
  type: 'confirm';
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}
interface PromptReq {
  type: 'prompt';
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
  resolve: (v: string | null) => void;
}
const dialogs = createStore<{ req: ConfirmReq | PromptReq | null }>({ req: null });

export function confirmDialog(opts: { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => dialogs.set({ req: { type: 'confirm', title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? tr('Confirmar'), danger: !!opts.danger, resolve } }));
}

export function promptDialog(opts: { title: string; label: string; value?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => dialogs.set({ req: { type: 'prompt', title: opts.title, label: opts.label, value: opts.value ?? '', confirmLabel: opts.confirmLabel ?? tr('Salvar'), resolve } }));
}

function PromptBody({ req, done }: { req: PromptReq; done: (v: string | null) => void }) {
  const [v, setV] = useState(req.value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        done(v.trim() || null);
      }}
    >
      <label className="field-label" htmlFor="prompt-input">
        {req.label}
      </label>
      <input id="prompt-input" className="input" autoFocus value={v} onChange={(e) => setV(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()} />
      <div className="modal-actions">
        <Button onClick={() => done(null)}>{tr('Cancelar')}</Button>
        <Button variant="primary" type="submit" disabled={!v.trim()}>
          {req.confirmLabel}
        </Button>
      </div>
    </form>
  );
}

export function DialogHost() {
  const req = useStore(dialogs, (s) => s.req);
  const list = useStore(toasts, (s) => s.list);
  const done = (v: boolean | string | null) => {
    if (!req) return;
    dialogs.set({ req: null });
    (req.resolve as (x: unknown) => void)(v);
  };
  return (
    <>
      <Modal open={!!req} onClose={() => req && done(req.type === 'confirm' ? false : null)} title={req?.title ?? ''} width={440}>
        {req?.type === 'confirm' && (
          <>
            {req.message && <div className="modal-text">{req.message}</div>}
            <div className="modal-actions">
              <Button onClick={() => done(false)}>{tr('Cancelar')}</Button>
              <Button variant={req.danger ? 'danger' : 'primary'} autoFocus onClick={() => done(true)}>
                {req.confirmLabel}
              </Button>
            </div>
          </>
        )}
        {req?.type === 'prompt' && <PromptBody req={req} done={done} />}
      </Modal>
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'ok' ? <LuCircleCheck /> : t.kind === 'error' ? <LuCircleAlert /> : <LuInfo />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Hook utilitário: executa `fn` quando a aba perde/ganha foco etc. não é necessário aqui. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
