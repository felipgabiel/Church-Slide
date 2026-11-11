// Harness de fidelidade: expõe em `window.H` o renderizador de vídeo (canvas) e o DOM real do editor,
// para o runner compará-los no mesmo instante. Só para testes; não entra no app.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '../../src/styles/index.css';
import { BackgroundView } from '../../src/render/Background';
import { Stage } from '../../src/render/Stage';
import { BackgroundPainter } from '../../src/core/export/background';
import { createCompositor } from '../../src/core/export/compose';
import { measureScene } from '../../src/core/export/scene';
import { defaultBackground, newProject } from '../../src/core/defaults';
import { applyImpactToLayer } from '../../src/core/impact';
import { designBackground } from '../../src/core/design/apply';
import { STARTERS } from '../../src/core/design/starters';
import type { Background, Project } from '../../src/core/types';

const W = 1280;
const H = 720;

function host(): HTMLElement {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  el.id = 'ref';
  el.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;background:#000`;
  document.body.appendChild(el);
  return el;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function canvasOf(draw: (ctx: CanvasRenderingContext2D) => Promise<void> | void): Promise<string> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  await draw(ctx);
  return c.toDataURL('image/png');
}

(window as unknown as { H: unknown }).H = {
  /** DOM: fundo ao vivo, animações congeladas em t. Devolve o canvas equivalente. */
  async background(bg: Background, t: number) {
    const el = host();
    const root = createRoot(el);
    const design = bg.kind === 'design';
    flushSync(() => root.render(<div className="stage" style={{ width: W, height: H }}><div className="bg-layer"><BackgroundView bg={bg} mode="live" time={design ? t : undefined} /></div></div>));
    await frame();
    document.getAnimations().forEach((a) => {
      a.pause();
      a.currentTime = t * 1000;
    });
    await frame();
    const painter = await BackgroundPainter.create(bg, W, H);
    return canvasOf((ctx) => painter.draw(ctx, t));
  },

  /** Fundo do Estúdio (modelo de partida `id`) no instante t, com ajustes opcionais do louvor. */
  async design(id: string, t: number, adjust: Background['adjust'] | null) {
    const st = STARTERS.find((s) => s.id === id)!;
    const bg = designBackground(st.make());
    if (adjust) bg.adjust = adjust;
    return (this as unknown as { background: (b: Background, t: number) => Promise<string> }).background(bg, t);
  },

  /** DOM: texto estático (estado final) sobre preto. Devolve o canvas equivalente no fim da animação. */
  async text(opts: { text: string; impact?: boolean; patch?: (p: Project) => void }) {
    const p = newProject('t');
    p.theme.background = { ...defaultBackground(), kind: 'solid', color: '#000000' };
    p.slides[0].layers[0].text = opts.text;
    if (opts.impact) applyImpactToLayer(p.slides[0].layers[0]);
    opts.patch?.(p);
    const slide = p.slides[0];
    const el = host();
    const root = createRoot(el);
    flushSync(() => root.render(<Stage theme={p.theme} slide={slide} mode="static" />));
    await document.fonts.ready;
    await frame();
    const scene = await measureScene(p, slide, W, H);
    const comp = createCompositor(scene);
    const bg = p.theme.background;
    const painter = bg.kind === 'solid' && bg.color === '#000000' ? null : await BackgroundPainter.create(bg, W, H);
    return canvasOf(async (ctx) => {
      if (painter) await painter.draw(ctx, 0);
      comp.draw(ctx, comp.enterMs + 1000);
    });
  },
};
