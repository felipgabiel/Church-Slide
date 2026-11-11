import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuChevronDown } from 'react-icons/lu';

interface Opt {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

/** Lê <option>/<optgroup> escritos como filhos (as telas continuam escrevendo o JSX de sempre). */
function readOptions(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child: unknown) => {
    if (!isValidElement(child)) return;
    const el = child as unknown as { type: unknown; props: { value?: string | number; label?: string; disabled?: boolean; children?: ReactNode } };
    if (el.type === 'optgroup') readOptions(el.props.children, el.props.label, out);
    else if (el.type === 'option') {
      const text = Children.toArray(el.props.children).join('');
      out.push({ value: String(el.props.value ?? text), label: text, disabled: el.props.disabled, group });
    } else readOptions(el.props.children, group, out);
  });
  return out;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  label?: string;
  className?: string;
  /** estilo de cada opção (ex.: cada fonte escrita com ela mesma) */
  optionStyle?: (value: string) => CSSProperties | undefined;
}

/**
 * Menu suspenso próprio (no lugar do <select> do sistema, que não segue o tema nem mostra prévia):
 * grupos com título, marca na opção escolhida, prévia opcional (fontes), teclado completo
 * (setas, Home/End, Enter, Esc, digitar a letra inicial) e leitores de tela (combobox + listbox).
 */
export function Select({ value, onChange, children, label, className = '', optionStyle }: Props) {
  const opts = useMemo(() => readOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);
  const id = useId();
  const typed = useRef({ text: '', at: 0 });

  const current = opts.find((o) => o.value === value);
  const enabled = (i: number) => i >= 0 && i < opts.length && !opts[i].disabled;

  const openList = () => {
    setActive(Math.max(0, opts.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    setPos(null);
    if (focus) btn.current?.focus();
  };
  const choose = (i: number) => {
    if (!enabled(i)) return;
    if (opts[i].value !== value) onChange(opts[i].value);
    close();
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < opts.length; i += dir) if (enabled(i)) return i;
    return from;
  };

  // posição: embaixo do botão; se não couber, em cima; nunca sai da janela
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    // camada superior do navegador ("popover"): fica por cima até de diálogos abertos (<dialog> modal),
    // que senão cobririam a lista — era por isso que o menu "Por estrofe" do Novo louvor não aparecia
    const el = list.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    try {
      el?.showPopover?.();
    } catch {
      /* navegador sem popover: segue como elemento fixo comum */
    }
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const maxH = Math.min(340, Math.max(140, up ? above : below));
    const width = Math.max(r.width, 180);
    setPos({ left: Math.min(r.left, window.innerWidth - width - 8), top: up ? r.top - 4 - Math.min(maxH, list.current?.scrollHeight ?? maxH) : r.bottom + 4, width, maxH });
  }, [open]);

  // mantém a opção ativa à vista
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, pos]);

  // fecha ao clicar fora, rolar a página ou redimensionar
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const away = (e: Event) => {
      if (e.type === 'scroll' && list.current?.contains(e.target as Node)) return;
      close(false);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', away);
    window.addEventListener('scroll', away, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', away);
      window.removeEventListener('scroll', away, true);
    };
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'ArrowDown') setActive((a) => step(a, 1));
    else if (e.key === 'ArrowUp') setActive((a) => step(a, -1));
    else if (e.key === 'Home') setActive(step(-1, 1));
    else if (e.key === 'End') setActive(step(opts.length, -1));
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') {
      e.stopPropagation(); // não fecha o diálogo em volta
      close();
    } else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1) {
      // digitar a letra inicial pula para a opção
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 700 ? '' : typed.current.text) + e.key.toLowerCase(), at: now };
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const hit = opts.findIndex((o, i) => enabled(i) && norm(o.label).startsWith(norm(typed.current.text)));
      if (hit >= 0) setActive(hit);
      else return;
    } else return;
    e.preventDefault();
  };

  // agrupa para desenhar títulos
  const rendered: ReactNode[] = [];
  let lastGroup: string | undefined;
  opts.forEach((o, i) => {
    if (o.group !== lastGroup && o.group) rendered.push(<div key={`g${i}`} className="sel-group" role="presentation">{o.group}</div>);
    lastGroup = o.group;
    rendered.push(
      <div
        key={o.value + i}
        id={`${id}-${i}`}
        data-i={i}
        role="option"
        aria-selected={o.value === value}
        aria-disabled={o.disabled || undefined}
        className="sel-opt"
        data-active={i === active ? '1' : undefined}
        onPointerMove={() => enabled(i) && setActive(i)}
        onClick={() => choose(i)}
      >
        <span style={optionStyle?.(o.value)}>{o.label}</span>
        {o.value === value && <LuCheck aria-hidden />}
      </div>,
    );
  });

  return (
    <span className={`select ${className}`}>
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        className="sel-btn"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        <span style={current ? optionStyle?.(current.value) : undefined}>{current?.label ?? value}</span>
        <LuChevronDown aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            {...{ popover: 'manual' }}
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            className="sel-list"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth: pos?.width, maxHeight: pos?.maxH, visibility: pos ? 'visible' : 'hidden' }}
            onKeyDown={onKey}
          >
            {rendered}
          </div>,
          // dentro de um diálogo modal, tudo fora dele fica "inerte" (não recebe clique): a lista mora no próprio diálogo
          btn.current?.closest('dialog') ?? document.body,
        )}
    </span>
  );
}
