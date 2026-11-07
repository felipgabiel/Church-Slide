import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Só monta o conteúdo quando entra (ou está perto de entrar) na área visível. */
export function LazyMount({ children, className = '', style }: { children: ReactNode; className?: string; style?: Record<string, string | number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} className={className} style={style}>
      {seen ? children : null}
    </div>
  );
}
