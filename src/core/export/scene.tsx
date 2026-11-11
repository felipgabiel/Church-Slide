import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { TextLayerView } from '../../render/TextLayerView';
import { layerColorPlan, layerNeedsLetters } from '../../render/colorRun';
import { partOf, type ColorWordPlan } from '../anim/colorfx';
import { collectOverrides, type UnitOverride } from '../anim/engine';
import { resolveAnimation } from '../defaults';
import type { AnimationConfig, ColorFx, Project, Slide, TextStyle } from '../types';
import { hasWordAnim } from '../words';

/**
 * Mede a cena de um trecho usando o MESMO componente de texto do editor (TextLayerView),
 * montado fora da tela no tamanho exato do vídeo. Assim a quebra de linha, o ajuste automático
 * de tamanho, o tamanho/fonte por palavra e o espaçamento saem idênticos ao que se vê no editor.
 * O resultado é só dados (posições, fontes, cores), que o renderizador em canvas desenha.
 */

export interface WordBox {
  /** texto já com maiúsculas/minúsculas aplicadas */
  text: string;
  /** caixa do conteúdo (em px do vídeo): topo = topo da área da fonte */
  x: number;
  y: number;
  w: number;
  h: number;
  /** atalho de fonte do canvas (ex.: "normal 900 120px Inter, sans-serif") */
  font: string;
  letterSpacing: number;
  color: string;
  /** índice da unidade animada a que a palavra pertence */
  unit: number;
  layer: number;
  /** troca de cor desta palavra (própria ou a do trecho); ausente = cor fixa */
  fx?: ColorFx;
  /** posição da palavra no efeito ("tudo junto" = 0, "por palavra" = nº da palavra) */
  part: number;
  /** modo "por letra": posição e texto de cada letra */
  chars?: { text: string; x: number; part: number }[];
  /** quantas partes o efeito tem nesta camada (para saber quando termina) */
  parts: number;
}

export interface UnitBox {
  /** centro da unidade (origem das transformações de escala) */
  cx: number;
  cy: number;
}

export interface Scene {
  width: number;
  height: number;
  words: WordBox[];
  units: UnitBox[];
  /** animação própria por unidade (palavras com ajuste individual) */
  overrides: (UnitOverride | undefined)[];
  cfg: AnimationConfig;
  layers: TextStyle[];
}

function mount(project: Project, slide: Slide, width: number, height: number, unit: AnimationConfig['unit']) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;visibility:hidden;contain:strict`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <div className="stage" style={{ width, height }}>
        <div className="text-frame">
          {slide.layers
            .filter((l) => l.visible)
            .map((l) => (
              <TextLayerView key={l.id} layer={l} unit={unit} float={0} letters={layerNeedsLetters(l)} />
            ))}
        </div>
      </div>,
    ),
  );
  void project;
  return {
    host,
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}

export async function measureScene(project: Project, slide: Slide, width: number, height: number): Promise<Scene> {
  const cfg = resolveAnimation(slide, project.theme);
  // mesma regra do palco ao vivo: palavra com animação própria força "uma unidade por palavra"
  const unit = hasWordAnim(slide.layers) ? 'word' : cfg.unit;

  // 1ª montagem: descobre quais fontes são usadas e espera carregarem (senão a medida sai errada)
  let m = mount(project, slide, width, height, unit);
  const fonts = new Set<string>();
  m.host.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
    const cs = getComputedStyle(el);
    fonts.add(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
  });
  m.dispose();
  await Promise.all([...fonts].map((f) => document.fonts.load(f, 'AaÁçÕ').catch(() => [])));
  await document.fonts.ready;

  // 2ª montagem, já com as fontes prontas
  m = mount(project, slide, width, height, unit);
  try {
    const stage = m.host.querySelector('.stage') as HTMLElement;
    const origin = stage.getBoundingClientRect();
    const unitEls = Array.from(m.host.querySelectorAll<HTMLElement>('[data-unit]'));
    const units: UnitBox[] = unitEls.map((u) => {
      const r = u.getBoundingClientRect();
      return { cx: r.left - origin.left + r.width / 2, cy: r.top - origin.top + r.height / 2 };
    });
    const layerEls = Array.from(m.host.querySelectorAll<HTMLElement>('[data-layer]'));
    const visible = slide.layers.filter((l) => l.visible);
    const words: WordBox[] = [];
    // troca de cor: só as palavras marcadas, com a mesma conta de grupos do palco
    const plans = new Map<string, Map<number, ColorWordPlan>>();
    for (const l of visible) plans.set(l.id, layerColorPlan(l));
    m.host.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
      const cs = getComputedStyle(el);
      // retângulo do TEXTO (área de conteúdo da fonte), independente de min-height/line-height do contêiner
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getClientRects()[0] ?? el.getBoundingClientRect();
      let text = el.textContent ?? '';
      if (cs.textTransform === 'uppercase') text = text.toUpperCase();
      else if (cs.textTransform === 'lowercase') text = text.toLowerCase();
      const unitEl = el.closest('[data-unit]') ?? el;
      const layerEl = el.closest('[data-layer]') as HTMLElement | null;
      const plan = plans.get(el.dataset.lid ?? '')?.get(Number(el.dataset.w));
      const fx = plan?.fx;
      const upper = cs.textTransform === 'uppercase';
      const lower = cs.textTransform === 'lowercase';
      const chars =
        fx?.mode === 'letter'
          ? Array.from(el.querySelectorAll<HTMLElement>('.ch')).map((c, k) => {
              const rr = c.getBoundingClientRect();
              const raw = c.textContent ?? '';
              return { text: upper ? raw.toUpperCase() : lower ? raw.toLowerCase() : raw, x: rr.left - origin.left, part: partOf(plan!, k) };
            })
          : undefined;
      words.push({
        text,
        x: r.left - origin.left,
        y: r.top - origin.top,
        w: r.width,
        h: r.height,
        font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
        letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
        color: cs.color,
        unit: Math.max(0, unitEls.indexOf(unitEl as HTMLElement)),
        layer: Math.max(0, layerEl ? layerEls.indexOf(layerEl) : 0),
        ...(fx ? { fx } : {}),
        part: plan ? partOf(plan) : 0,
        ...(chars ? { chars } : {}),
        parts: plan?.parts ?? 0,
      });
    });
    return { width, height, words, units, overrides: collectOverrides(unitEls), cfg, layers: visible.map((l) => l.style) };
  } finally {
    m.dispose();
  }
}
