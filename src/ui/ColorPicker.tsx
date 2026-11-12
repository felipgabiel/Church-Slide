import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { hexToHsv, hsvToHex, normalizeHex, type HSV } from '../core/colorMath';
import { tr } from '../core/i18n';

/* ------------------------------ Popover ------------------------------ */

/** Caixinha flutuante presa a um elemento: abre embaixo (ou em cima, se não couber), fecha com Esc ou clique fora. */
export function Popover({ anchor, onClose, children, label }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      (el as HTMLDivElement & { showPopover?: () => void }).showPopover?.(); // por cima de diálogos abertos
    } catch {
      /* sem suporte: elemento fixo comum */
    }
    const a = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const below = a.bottom + 6 + h <= window.innerHeight - 8;
    setPos({
      left: Math.max(8, Math.min(a.left, window.innerWidth - w - 8)),
      top: below ? a.bottom + 6 : Math.max(8, a.top - h - 6),
    });
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.focus();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} {...{ popover: 'manual' }} className="popover" role="dialog" aria-label={label} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden' }}>
      {children}
    </div>,
    anchor.closest('dialog') ?? document.body, // fora de um diálogo modal nada recebe clique
  );
}

/* --------------------------- cores recentes --------------------------- */

const RECENT_KEY = 'cs:recent-colors';
const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((c) => typeof c === 'string' && normalizeHex(c)).slice(0, 12) : [];
  } catch {
    return [];
  }
};
export function rememberColor(hex: string) {
  const c = normalizeHex(hex);
  if (!c) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...loadRecent().filter((x) => x !== c)].slice(0, 12)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/* ---------------------------- ColorPicker ---------------------------- */

/** Pontos de partida, não um limite: qualquer cor sai do quadrado, da faixa de matiz ou do hexadecimal. */
const STARTERS = ['#ffffff', '#000000', '#f87171', '#fb923c', '#fbbf24', '#fde047', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6'];

function useDrag(onMove: (x: number, y: number) => void) {
  return (e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) =>
      onMove(Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)));
    el.setPointerCapture(e.pointerId);
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
}

/** Seletor de cor completo: saturação/brilho, matiz, hexadecimal e cores recentes. */
export function ColorPicker({ value, onChange, footer }: { value: string; onChange: (hex: string) => void; footer?: ReactNode }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(normalizeHex(value) ?? value);
  const recent = useRef(loadRecent());
  const last = useRef(value);
  // valor mudou por fora (ex.: desfazer): acompanha sem perder o matiz quando a cor é cinza
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const n = hexToHsv(value);
    setHsv((cur) => ({ ...n, h: n.s === 0 ? cur.h : n.h }));
    setText(normalizeHex(value) ?? value);
  }, [value]);
  const emit = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    setText(hex);
    onChange(hex);
  };
  const pick = (hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return;
    emit(hexToHsv(n));
  };
  useEffect(() => () => rememberColor(last.current), []);

  const sv = useDrag((x, y) => emit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => emit({ ...hsv, h: x * 360 }));
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const keyNudge = (e: RKeyboardEvent, axis: 's' | 'v' | 'h') => {
    const step = (e.shiftKey ? 10 : 1) * (axis === 'h' ? 1 : 0.01);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (axis === 'h') emit({ ...hsv, h: (hsv.h + dir * step + 360) % 360 });
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') emit({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + dir * step)) });
    else emit({ ...hsv, v: Math.min(1, Math.max(0, hsv.v + dir * step)) });
  };

  return (
    <div className="cp">
      <div
        className="cp-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        onPointerDown={sv}
        tabIndex={0}
        role="slider"
        aria-label={tr('Saturação e brilho (setas ajustam)')}
        aria-valuetext={hsvToHex(hsv)}
        onKeyDown={(e) => keyNudge(e, 's')}
      >
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <div className="cp-hue" onPointerDown={hue} tabIndex={0} role="slider" aria-label={tr('Matiz')} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} onKeyDown={(e) => keyNudge(e, 'h')}>
        <i style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="cp-row">
        <span className="cp-now" style={{ background: hsvToHex(hsv) }} aria-hidden />
        <input
          className="cp-hex"
          value={text}
          spellCheck={false}
          aria-label={tr('Cor em hexadecimal')}
          onChange={(e) => {
            setText(e.currentTarget.value);
            const n = normalizeHex(e.currentTarget.value);
            if (n) pick(n);
          }}
          onBlur={() => setText(hsvToHex(hsv))}
        />
      </div>
      <div className="cp-swatches" aria-label={tr('Cores rápidas')}>
        {[...recent.current, ...STARTERS.filter((c) => !recent.current.includes(c))].slice(0, 16).map((c) => (
          <button key={c} type="button" style={{ background: c }} title={c} aria-label={tr('Usar {0}', c)} onClick={() => pick(c)} />
        ))}
      </div>
      {footer}
    </div>
  );
}

/** Quadradinho de cor que abre o seletor. */
export function SwatchButton({ value, onChange, label, footer, className = '' }: { value: string; onChange: (hex: string) => void; label: string; footer?: (close: () => void) => ReactNode; className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button ref={btn} type="button" className={`swatch ${className}`} style={{ background: value }} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      {open && btn.current && (
        <Popover anchor={btn.current} onClose={close} label={label}>
          <ColorPicker value={value} onChange={onChange} footer={footer?.(close)} />
        </Popover>
      )}
    </>
  );
}
