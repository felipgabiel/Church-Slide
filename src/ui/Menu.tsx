import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label?: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  checked?: boolean;
  onClick?: () => void;
}

interface MenuProps {
  items: MenuItem[];
  trigger: (open: boolean, toggle: (e: MouseEvent<HTMLElement>) => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
}

/** Menu suspenso posicionado junto ao gatilho, fora de qualquer `overflow: hidden`. */
export function Menu({ items, trigger, align = 'start', width = 220 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 200;
    const up = r.bottom + h + 12 > window.innerHeight && r.top > h + 12;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, align === 'end' ? r.right - width : r.left));
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open, align, width, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || anchor.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        anchor.current?.querySelector('button')?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = Array.from(pop.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && pos) pop.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!pos]);

  return (
    <>
      <span ref={anchor} className="menu-anchor">
        {trigger(open, (e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((o) => !o);
        })}
      </span>
      {open &&
        createPortal(
          <div
            ref={pop}
            className="menu"
            role="menu"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, transform: pos?.up ? 'translateY(-100%)' : undefined, visibility: pos ? 'visible' : 'hidden' }}
          >
            {items.map((it, i) =>
              it.divider ? (
                <hr key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={it.danger ? 'danger' : ''}
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onClick?.();
                  }}
                >
                  <span className="menu-ico">{it.icon}</span>
                  <span className="menu-label">{it.label}</span>
                  {it.checked && <span className="menu-check">✓</span>}
                  {it.hint && <span className="menu-hint">{it.hint}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
