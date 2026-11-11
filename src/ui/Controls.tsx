import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LuChevronRight } from 'react-icons/lu';
import { useSetting } from '../core/settings';
import { clamp } from '../core/util';
import { SwatchButton } from './ColorPicker';

/* ----------------------------- Slider ----------------------------- */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** valor ao dar duplo clique no rótulo */
  reset?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function decimals(step: number) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function Slider({ label, value, min, max, step = 1, unit = '', reset, onChange, disabled }: SliderProps) {
  const dec = decimals(step);
  const [text, setText] = useState(value.toFixed(dec));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value.toFixed(dec));
  }, [value, dec]);

  const commit = () => {
    focused.current = false;
    const n = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n)) onChange(clamp(Math.round(n / step) * step, min, max));
    else setText(value.toFixed(dec));
  };
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;

  return (
    <div className="slider" data-disabled={disabled ? '1' : undefined}>
      <div className="slider-head">
        <label className="slider-label" onDoubleClick={() => reset !== undefined && onChange(reset)} title={reset !== undefined ? 'Duplo clique para restaurar o padrão' : undefined}>
          {label}
        </label>
        <span className="slider-num">
          <input
            className="slider-input"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            aria-label={label}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onChange={(e) => setText(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setText(value.toFixed(dec));
                e.currentTarget.blur();
              }
            }}
          />
          {unit && <span className="slider-unit">{unit}</span>}
        </span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={`${label} (controle deslizante)`}
        style={{ '--p': `${pct}%` }}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
      />
    </div>
  );
}

/* ----------------------------- Switch ----------------------------- */

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="switch" data-on={checked ? '1' : '0'} onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

export function ToggleRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="row">
      <span className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/* ---------------------------- Segmented ---------------------------- */

export interface SegOption<T extends string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', label }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; size?: 'sm' | 'md'; label?: string }) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title ?? o.label} data-on={o.value === value ? '1' : '0'} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------- Select ----------------------------- */

export { Select } from './Select';

/* ------------------------------ Color ------------------------------ */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <span className="color">
      <SwatchButton value={value} onChange={onChange} label={label} className="color-swatch" />
      <input
        className="color-text"
        value={text}
        spellCheck={false}
        aria-label={`${label} (hexadecimal)`}
        onChange={(e) => {
          setText(e.currentTarget.value);
          if (HEX.test(e.currentTarget.value)) onChange(e.currentTarget.value);
        }}
        onBlur={() => setText(value)}
      />
    </span>
  );
}

/* ------------------------------- Row ------------------------------- */

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row">
      <span className="row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <div className="row-ctl">{children}</div>
    </div>
  );
}

/* ----------------------------- Section ----------------------------- */

/**
 * Grupo recolhível do painel. Abrir/fechar fica lembrado por grupo (quem nunca usa "Sombra" não a vê aberta
 * toda vez). `hint`: explicação curta num "?" ao lado do título, em vez de um parágrafo ocupando o painel.
 */
export function Section({
  title,
  children,
  defaultOpen = true,
  toggle,
  actions,
  hint,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  actions?: ReactNode;
  hint?: string;
}) {
  const [saved, setSaved] = useSetting<boolean | null>(`sect:${title}`, null);
  const open = saved ?? defaultOpen;
  return (
    <section className="sect" data-open={open ? '1' : '0'}>
      <header className="sect-head">
        <button type="button" className="sect-title" aria-expanded={open} onClick={() => setSaved(!open)}>
          <LuChevronRight aria-hidden />
          {title}
        </button>
        {hint && (
          <span className="sect-hint" tabIndex={0} role="note" aria-label={hint}>
            ?
          </span>
        )}
        {actions}
        {toggle && (
          <Switch
            checked={toggle.checked}
            onChange={(v) => {
              toggle.onChange(v);
              if (v && !open) setSaved(true); // ligou: mostra os controles
            }}
            label={`Ativar ${title}`}
          />
        )}
      </header>
      {open && <div className="sect-body">{children}</div>}
    </section>
  );
}

/* ------------------------------ Search ------------------------------ */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
