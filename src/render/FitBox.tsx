import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Encaixa um conteúdo com proporção fixa (ex.: 16:9) dentro do espaço disponível. */
export function FitBox({ ratio, children, padding = 0, className = '' }: { ratio: number; children: ReactNode; padding?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const calc = () => {
      const cw = Math.max(0, el.clientWidth - padding * 2);
      const ch = Math.max(0, el.clientHeight - padding * 2);
      let w = cw;
      let h = cw / ratio;
      if (h > ch) {
        h = ch;
        w = ch * ratio;
      }
      setSize((s) => (s.w === Math.floor(w) && s.h === Math.floor(h) ? s : { w: Math.floor(w), h: Math.floor(h) }));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, padding]);

  return (
    <div ref={outer} className={`fitbox ${className}`}>
      <div className="fitbox-inner" style={{ width: size.w, height: size.h }}>
        {size.w > 0 && children}
      </div>
    </div>
  );
}
