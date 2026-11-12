import { LuEraser, LuMousePointerClick, LuLayoutTemplate } from 'react-icons/lu';
import { getFontOptions } from '../../../core/fonts';
import { IMPACT_ENTER } from '../../../core/impact';
import type { AnimPhase, TextCase, WordAnim, WordStyle } from '../../../core/types';
import { overrideOf, tokenizeText, type WordTarget } from '../../../core/words';
import { editor, useActiveSlide } from '../../../store/editor';
import { useWordSelection, wordKey, wordSelection } from '../../../store/wordSelection';
import { Button } from '../../../ui/Button';
import { ColorField, Row, Section, Segmented, Select, Slider, Switch } from '../../../ui/Controls';
import { selectedTargets, useCustomFonts, useDebouncedReplay } from '../hooks';
import { ColorChange } from './ColorChange';
import { tr } from '../../../core/i18n';

const WEIGHTS: { v: string; label: string }[] = [
  { v: '', label: tr('Igual ao texto') },
  { v: '300', label: tr('Fina (300)') },
  { v: '400', label: tr('Normal (400)') },
  { v: '500', label: tr('Média (500)') },
  { v: '600', label: tr('Seminegrito (600)') },
  { v: '700', label: tr('Negrito (700)') },
  { v: '800', label: tr('Extranegrito (800)') },
  { v: '900', label: tr('Preta (900)') },
];

const DEFAULT_ANIM: WordAnim = { enter: { fade: true, slide: true, zoom: 'none', blur: false }, delay: 0 };

/**
 * Edição de palavras avulsas: fonte, tamanho, peso, caixa, cor e uma animação de entrada
 * própria. Clique numa palavra da prévia (Shift/Ctrl soma) ou escolha na lista abaixo.
 */
export function WordsPanel() {
  const slide = useActiveSlide();
  const keys = useWordSelection();
  const fonts = useCustomFonts();
  const replay = useDebouncedReplay();

  if (!slide) return <p className="panel-empty">{tr('Nenhum trecho selecionado.')}</p>;

  // seleção válida: a camada existe neste trecho e a palavra ainda existe no texto
  const targets: WordTarget[] = selectedTargets(slide, keys);
  const first = targets[0];
  const layer = first ? slide.layers.find((l) => l.id === first.layerId) : undefined;
  const ov = layer && first ? overrideOf(layer, first.index) : undefined;
  const st: WordStyle = ov?.style ?? {};
  const anim = ov?.anim;

  const setStyle = (patch: { [K in keyof WordStyle]?: WordStyle[K] | null }) => editor.patchWords(targets, { style: patch });
  const setAnim = (next: WordAnim | null) => {
    editor.patchWords(targets, { anim: next });
    replay();
  };
  const setPhase = (p: Partial<AnimPhase>) => anim && setAnim({ ...anim, enter: { ...anim.enter, ...p } });

  const options = getFontOptions(fonts);
  const groups = [...new Set(options.map((o) => o.group))];
  const word = layer && first ? wordsAt(layer.text, first.index) : '';

  return (
    <div className="props">
      <Section title={tr('Estilo automático')} hint={tr('“Impacto”: uma palavra-chave grande em MAIÚSCULAS e o resto menor em minúsculas, como nos lyric videos. Reescreve as quebras de linha do texto.')}>
        <Button size="sm" icon={<LuLayoutTemplate />} className="props-upload" onClick={() => editor.applyImpactToSlide()}>
          {tr('Aplicar neste trecho')}
        </Button>
        <Button size="sm" variant="ghost" icon={<LuLayoutTemplate />} className="props-upload" onClick={() => editor.applyImpactToAll()}>
          {tr('Aplicar em todos os trechos')}
        </Button>
        <Button size="sm" variant="ghost" icon={<LuEraser />} className="props-upload" onClick={() => editor.clearWordStyles('slide')}>
          {tr('Limpar ajustes de palavras (este trecho)')}
        </Button>
      </Section>

      <Section title={tr('Palavras do trecho')}>
        {slide.layers
          .filter((l) => l.visible && l.text.trim())
          .map((l) => (
            <div key={l.id} className="wlist" aria-label={tr('Palavras de {0}', l.name)}>
              {tokenizeText(l.text).map((line, li) => (
                <div key={li} className="wlist-line">
                  {line.tokens
                    .filter((t) => t.kind === 'word')
                    .map((t) => {
                      const k = wordKey(l.id, t.index);
                      const edited = !!overrideOf(l, t.index);
                      return (
                        <button
                          key={k}
                          type="button"
                          className="wchip"
                          data-on={keys.includes(k) ? '1' : '0'}
                          data-edited={edited ? '1' : '0'}
                          aria-pressed={keys.includes(k)}
                          title={edited ? tr('Esta palavra tem ajustes próprios') : undefined}
                          onClick={(e) => wordSelection.click(k, e.shiftKey || e.ctrlKey || e.metaKey)}
                        >
                          {t.text}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          ))}
        {targets.length === 0 && (
          <p className="props-note">
            <LuMousePointerClick aria-hidden />{' '}{tr('Clique numa palavra aqui ou na prévia para editá-la. Shift ou Ctrl soma várias.')}
          </p>
        )}
      </Section>

      {targets.length > 0 && layer && (
        <>
          <p className="wsel" role="status">
            <span>{targets.length === 1 ? <>{tr('Editando')}{' '}<b>“{word}”</b></> : <>{tr('Editando')}{' '}<b>{targets.length}{' '}{tr('palavras')}</b></>}</span>
            <Button size="sm" variant="ghost" onClick={() => wordSelection.clear()}>
              {tr('Desmarcar')}
            </Button>
          </p>

          <Section title={tr('Fonte da palavra')}>
            <Row label={tr('Família')}>
              <Select value={st.fontFamily ?? ''} onChange={(v) => setStyle({ fontFamily: v === '' ? null : v })} label={tr('Fonte da palavra')} optionStyle={(v) => (v ? { fontFamily: v } : undefined)}>
                <option value="">{tr('Igual ao texto')}</option>
                {groups.map((g) => (
                  <optgroup key={g} label={tr(g)}>
                    {options
                      .filter((o) => o.group === g)
                      .map((o) => (
                        <option key={o.value + o.label} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Row>
            <Slider label={tr('Tamanho')} value={st.scale ?? 1} min={0.2} max={4} step={0.05} unit="×" reset={1} onChange={(v) => setStyle({ scale: v === 1 ? null : v })} />
            <Row label={tr('Peso')}>
              <Select value={st.weight === undefined ? '' : String(st.weight)} onChange={(v) => setStyle({ weight: v === '' ? null : Number(v) })} label={tr('Peso da fonte')}>
                {WEIGHTS.map((w) => (
                  <option key={w.v} value={w.v}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label={tr('Caixa')}>
              <Segmented<TextCase | 'inherit'>
                size="sm"
                label={tr('Caixa das letras')}
                value={st.textCase ?? 'inherit'}
                onChange={(v) => setStyle({ textCase: v === 'inherit' ? null : v })}
                options={[
                  { value: 'inherit', label: tr('Igual'), title: tr('Igual ao texto') },
                  { value: 'lower', label: 'abc', title: tr('minúsculas') },
                  { value: 'none', label: tr('Abc'), title: tr('Como digitado') },
                  { value: 'upper', label: 'ABC', title: tr('MAIÚSCULAS') },
                ]}
              />
            </Row>
            <Row label={tr('Itálico')}>
              <Segmented<'inherit' | 'yes' | 'no'>
                size="sm"
                label={tr('Itálico')}
                value={st.italic === undefined ? 'inherit' : st.italic ? 'yes' : 'no'}
                onChange={(v) => setStyle({ italic: v === 'inherit' ? null : v === 'yes' })}
                options={[
                  { value: 'inherit', label: tr('Igual') },
                  { value: 'yes', label: tr('Sim') },
                  { value: 'no', label: tr('Não') },
                ]}
              />
            </Row>
            <Row label={tr('Cor')}>
              <ColorField value={st.color ?? layer.style.color} onChange={(v) => setStyle({ color: v })} label={tr('Cor da palavra')} />
              {st.color && (
                <Button size="sm" variant="ghost" onClick={() => setStyle({ color: null })}>
                  {tr('Igual')}
                </Button>
              )}
            </Row>
            <Slider
              label={tr('Espaço entre letras')}
              value={st.letterSpacing ?? layer.style.letterSpacing}
              min={-20}
              max={60}
              unit=""
              reset={layer.style.letterSpacing}
              onChange={(v) => setStyle({ letterSpacing: v === layer.style.letterSpacing ? null : v })}
            />
          </Section>

          <Section title={tr('Animação própria')} toggle={{ checked: !!anim, onChange: (on) => setAnim(on ? DEFAULT_ANIM : null) }}>
            {!anim ? (
              <p className="props-note">{tr('Desligada: segue a animação do trecho.')}</p>
            ) : (
              <>
                <Row label={tr('Preparada')}>
                  <Select
                    value=""
                    label={tr('Modelo de entrada')}
                    onChange={(v) => {
                      const m = QUICK[v];
                      if (m) setAnim({ ...anim, enter: m });
                    }}
                  >
                    <option value="">{tr('Escolher…')}</option>
                    {Object.keys(QUICK).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label={tr('Desvanecer (fade)')}>
                  <Switch checked={anim.enter.fade} onChange={(v) => setPhase({ fade: v })} label={tr('Fade da palavra')} />
                </Row>
                <Row label={tr('Deslizar (slide)')}>
                  <Switch checked={anim.enter.slide} onChange={(v) => setPhase({ slide: v })} label={tr('Slide da palavra')} />
                </Row>
                <Row label={tr('Desfocar (blur)')}>
                  <Switch checked={anim.enter.blur} onChange={(v) => setPhase({ blur: v })} label={tr('Blur da palavra')} />
                </Row>
                <Row label={tr('Zoom')}>
                  <Segmented<AnimPhase['zoom']>
                    size="sm"
                    label={tr('Zoom da palavra')}
                    value={anim.enter.zoom}
                    onChange={(v) => setPhase({ zoom: v })}
                    options={[
                      { value: 'none', label: tr('Nenhum') },
                      { value: 'in', label: tr('Crescer') },
                      { value: 'out', label: tr('Encolher') },
                    ]}
                  />
                </Row>
                <Slider label={tr('Atraso extra')} value={anim.delay ?? 0} min={0} max={3000} step={50} unit="ms" reset={0} onChange={(v) => setAnim({ ...anim, delay: v })} />
                <Slider label={tr('Duração')} value={anim.duration ?? 800} min={100} max={3000} step={50} unit="ms" reset={800} onChange={(v) => setAnim({ ...anim, duration: v })} />
                <Slider label={tr('Intensidade')} value={anim.intensity ?? 50} min={0} max={100} unit="%" reset={50} onChange={(v) => setAnim({ ...anim, intensity: v })} />
              </>
            )}
          </Section>

          <Section title={tr('Troca de cor')} defaultOpen={!!ov?.colorFx}>
            <ColorChange />
          </Section>

          <Button size="sm" variant="ghost" icon={<LuEraser />} className="props-upload" onClick={() => editor.clearWords(targets)}>
            {tr('Limpar ajustes')}{' '}{targets.length === 1 ? tr('desta palavra') : tr('destas palavras')}
          </Button>
        </>
      )}
    </div>
  );
}

const QUICK: Record<string, AnimPhase> = {
  'Impacto (bate na tela)': IMPACT_ENTER,
  'Sobe suave': { fade: true, slide: true, zoom: 'none', blur: false },
  'Surge do desfoque': { fade: true, slide: false, zoom: 'none', blur: true },
  'Zoom In': { fade: true, slide: false, zoom: 'in', blur: false },
  'Zoom Out': { fade: true, slide: false, zoom: 'out', blur: false },
  'Só aparece (fade)': { fade: true, slide: false, zoom: 'none', blur: false },
};

function wordsAt(text: string, index: number): string {
  for (const l of tokenizeText(text)) for (const t of l.tokens) if (t.kind === 'word' && t.index === index) return t.text;
  return '';
}
