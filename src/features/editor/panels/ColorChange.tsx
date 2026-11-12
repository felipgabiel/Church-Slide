import { LuPlus, LuRotateCcw, LuX } from 'react-icons/lu';
import { DEFAULT_COLOR_FX, MAX_COLORS, colorStart } from '../../../core/anim/colorfx';
import { totalDuration } from '../../../core/anim/engine';
import { resolveAnimation } from '../../../core/defaults';
import type { ColorFx, ColorMode, Slide } from '../../../core/types';
import { wordAt } from '../../../core/layers';
import { hasWordAnim, overrideOf, tokenizeText, type WordTarget } from '../../../core/words';
import { editor, useActiveSlide, useEditor } from '../../../store/editor';
import { useWordSelection, wordKey, wordSelection } from '../../../store/wordSelection';
import { Button } from '../../../ui/Button';
import { SwatchButton } from '../../../ui/ColorPicker';
import { Row, Segmented, Slider, Switch } from '../../../ui/Controls';
import { selectedTargets, useDebouncedReplay } from '../hooks';
import { tr } from '../../../core/i18n';

/** Segundos com uma casa, no jeito brasileiro ("1,5 s"). */
export const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Quando a entrada do trecho termina (estimativa com a mesma conta do motor de animação). */
export function enterEndOf(slide: Slide, theme: Parameters<typeof resolveAnimation>[1]): number {
  const cfg = resolveAnimation(slide, theme);
  const lines = slide.layers.filter((l) => l.visible).flatMap((l) => tokenizeText(l.text).filter((x) => x.count > 0));
  const words = lines.reduce((n, l) => n + l.count, 0);
  const unit = hasWordAnim(slide.layers) ? 'word' : cfg.unit;
  const units = unit === 'word' ? words : unit === 'line' ? lines.length : slide.layers.filter((l) => l.visible).length;
  return totalDuration(cfg, 'enter', Math.max(1, units));
}

/** Prévia do caminho de cores: partida → cor 1 → cor 2 … */
export function ColorPath({ fx, base }: { fx: ColorFx; base: string }) {
  const stops = [fx.from ?? base, ...fx.colors, ...(fx.back ? [fx.from ?? base] : [])];
  return <span className="cfx-path" aria-hidden style={{ background: `linear-gradient(90deg, ${stops.map((c, i) => `${c} ${(i / (stops.length - 1)) * 100}%`).join(', ')})` }} />;
}

/**
 * Troca de cor das palavras MARCADAS. A seleção é a do palco (clique; Shift/Ctrl soma).
 * Todas as marcadas recebem a mesma configuração e formam um grupo; as outras palavras nunca mudam de cor.
 */
export function ColorChange() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const keys = useWordSelection();
  const replay = useDebouncedReplay();
  if (!slide) return null;

  const targets = selectedTargets(slide, keys);
  const fxOf = (t: WordTarget) => overrideOf(slide.layers.find((l) => l.id === t.layerId)!, t.index)?.colorFx;
  const withFx = targets.filter((t) => fxOf(t));
  const fx = withFx.length ? fxOf(withFx[0])! : null;
  const all = targets.length > 0 && withFx.length === targets.length;
  const enterEnd = enterEndOf(slide, theme);
  const base = slide.layers.find((l) => l.id === targets[0]?.layerId)?.style.color ?? theme.text.color;

  // quantas palavras do trecho trocam de cor (mostra mesmo sem seleção)
  const coloredKeys = slide.layers.flatMap((l) => Object.entries(l.words ?? {}).filter(([, w]) => w.colorFx).map(([k]) => wordKey(l.id, Number(k))));
  const allKeys = slide.layers.filter((l) => l.visible).flatMap((l) => tokenizeText(l.text).flatMap((ln) => ln.tokens.filter((t) => t.kind === 'word').map((t) => wordKey(l.id, t.index))));

  const apply = (next: ColorFx | null) => {
    editor.patchWords(targets, { colorFx: next });
    replay();
  };
  const set = (patch: Partial<ColorFx>) => fx && apply({ ...fx, ...patch });
  const setColor = (i: number, c: string) => fx && set({ colors: fx.colors.map((x, k) => (k === i ? c : x)) });

  const names = targets.slice(0, 4).map((t) => wordAt(slide.layers.find((l) => l.id === t.layerId)!.text, t.index));

  return (
    <div className="cfx">
      <div className="cfx-sel" data-empty={targets.length ? undefined : '1'}>
        {targets.length ? (
          <>
            <span>
              <b>{targets.length === 1 ? tr('1 palavra marcada') : tr('{0} palavras marcadas', targets.length)}</b>
              <em>
                {names.join(', ')}
                {targets.length > 4 ? '…' : ''}
              </em>
            </span>
            <button type="button" className="link" onClick={() => wordSelection.clear()}>
              {tr('Desmarcar')}
            </button>
          </>
        ) : (
          <span>{tr('Clique nas palavras do slide para marcar quais trocam de cor. Shift ou Ctrl soma mais palavras.')}</span>
        )}
      </div>
      <div className="cfx-quick">
        <button type="button" className="link" onClick={() => wordSelection.set(allKeys)} disabled={!allKeys.length}>
          {tr('Marcar todas do trecho')}
        </button>
        {coloredKeys.length > 0 && (
          <>
            <button type="button" className="link" onClick={() => wordSelection.set(coloredKeys)}>
              {tr('Marcar as que trocam de cor (')}{coloredKeys.length})
            </button>
            <button
              type="button"
              className="link link-danger"
              onClick={() => {
                editor.clearColorFx();
                replay();
              }}
            >
              {tr('Tirar de todas')}
            </button>
          </>
        )}
      </div>

      {targets.length > 0 && (
        <Row label={tr('Trocar a cor')} hint={withFx.length && !all ? tr('Só parte das marcadas troca') : undefined}>
          <Switch checked={all} label={tr('Trocar a cor das palavras marcadas')} onChange={(on) => apply(on ? { ...(fx ?? DEFAULT_COLOR_FX) } : null)} />
        </Row>
      )}

      {targets.length > 0 && fx && (
        <>
          <div className="cfx-colors">
            <span className="row-label">{tr('Cores')}</span>
            <div className="cfx-seq" role="list" aria-label={tr('Sequência de cores')}>
              {fx.from ? (
                <SwatchButton
                  value={fx.from}
                  onChange={(c) => set({ from: c })}
                  label={tr('Cor de partida')}
                  className="cfx-from"
                  footer={(close) => (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const { from: _drop, ...rest } = fx;
                        void _drop;
                        apply(rest);
                        close();
                      }}
                    >
                      {tr('Partir da cor do texto')}
                    </button>
                  )}
                />
              ) : (
                <button type="button" className="swatch cfx-from cfx-auto" style={{ background: base }} title={tr('Parte da cor do texto. Clique para escolher outra.')} aria-label={tr('Cor de partida: a do texto')} onClick={() => set({ from: base })} />
              )}
              {fx.colors.map((c, i) => (
                <span key={i} className="cfx-step" role="listitem">
                  <span className="cfx-arrow" aria-hidden />
                  <SwatchButton
                    value={c}
                    onChange={(v) => setColor(i, v)}
                    label={tr('Cor {0}', i + 1)}
                    footer={(close) =>
                      fx.colors.length > 1 ? (
                        <button
                          type="button"
                          className="link link-danger"
                          onClick={() => {
                            set({ colors: fx.colors.filter((_, k) => k !== i) });
                            close();
                          }}
                        >
                          <LuX />{' '}{tr('Remover esta cor')}
                        </button>
                      ) : null
                    }
                  />
                </span>
              ))}
              {fx.colors.length < MAX_COLORS && (
                <button type="button" className="cfx-add" aria-label={tr('Adicionar cor à sequência')} title={tr('Adicionar cor')} onClick={() => set({ colors: [...fx.colors, fx.colors[fx.colors.length - 1]] })}>
                  <LuPlus />
                </button>
              )}
            </div>
            <ColorPath fx={fx} base={base} />
          </div>

          <Slider
            label={tr('Começa em')}
            value={(fx.start ?? enterEnd + (fx.delay ?? 0)) / 1000}
            min={0}
            max={15}
            step={0.1}
            unit="s"
            reset={DEFAULT_COLOR_FX.start! / 1000}
            onChange={(v) => {
              const { delay: _old, ...rest } = fx;
              void _old;
              apply({ ...rest, start: Math.round(v * 1000) });
            }}
          />
          <p className="props-note">
            {tr('Contado de quando o trecho aparece. A entrada termina em')}{' '}{fmtSec(enterEnd)}
            {colorStart(fx, enterEnd) > (fx.start ?? 0) && fx.start !== undefined ? tr('; antes disso a cor espera, então começa em {0}.', fmtSec(colorStart(fx, enterEnd))) : '.'}
          </p>
          <Slider label={tr('Tempo da troca')} value={fx.duration / 1000} min={0.1} max={10} step={0.1} unit="s" reset={DEFAULT_COLOR_FX.duration / 1000} onChange={(v) => set({ duration: Math.round(v * 1000) })} />
          <Row label={tr('Como')}>
            <Segmented<ColorMode>
              size="sm"
              label={tr('Como a cor anda pelas palavras')}
              value={fx.mode}
              onChange={(mode) => set({ mode, stagger: mode === 'all' ? 0 : fx.stagger || (mode === 'letter' ? 55 : 260) })}
              options={[
                { value: 'all', label: tr('Juntas'), title: tr('Todas as palavras marcadas ao mesmo tempo') },
                { value: 'word', label: tr('Uma por vez'), title: tr('Uma palavra marcada depois da outra') },
                { value: 'letter', label: tr('Letra a letra'), title: tr('A cor corre pelas letras') },
              ]}
            />
          </Row>
          {fx.mode !== 'all' && (
            <Slider
              label={fx.mode === 'letter' ? tr('Intervalo entre letras') : tr('Intervalo entre palavras')}
              value={fx.stagger / 1000}
              min={0}
              max={1}
              step={0.01}
              unit="s"
              reset={fx.mode === 'letter' ? 0.055 : 0.26}
              onChange={(v) => set({ stagger: Math.round(v * 1000) })}
            />
          )}
          <Row label={tr('Voltar à cor original')} hint={tr('Brilho que passa')}>
            <Switch checked={!!fx.back} onChange={(back) => apply(back ? { ...fx, back: true } : (({ back: _b, ...r }) => (void _b, r))(fx))} label={tr('Voltar à cor original')} />
          </Row>
          <Button size="sm" variant="ghost" icon={<LuRotateCcw />} className="props-upload" onClick={() => editor.replay()}>
            {tr('Ver de novo')}
          </Button>
        </>
      )}
    </div>
  );
}
