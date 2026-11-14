import { useEffect, useRef, type ReactNode } from 'react';
import { LuX } from 'react-icons/lu';
import { IconButton } from './Button';
import { tr } from '../core/i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

/** Diálogo nativo (<dialog>): foco preso, Esc fecha, e cobre o resto da interface. */
export function Modal({ open, onClose, title, description, children, footer, width = 520, className = '' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const byProp = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      // fechado por quem usa o diálogo: o evento "close" (que chega depois) não deve chamar onClose de novo,
      // senão um diálogo aberto logo em seguida no mesmo lugar seria fechado junto
      byProp.current = true;
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      aria-label={title}
      onClose={() => {
        if (byProp.current) {
          byProp.current = false;
          return;
        }
        if (ref.current?.open) return; // já foi reaberto
        closeRef.current();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {open && (
        <div className="modal-box">
          <header className="modal-head">
            <div>
              <h2>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <IconButton label={tr('Fechar')} icon={<LuX />} size="sm" onClick={() => ref.current?.close()} />
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
