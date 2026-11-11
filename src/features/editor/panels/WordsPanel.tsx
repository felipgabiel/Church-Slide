import { LuEraser, LuMousePointerClick, LuLayoutTemplate } from 'react-icons/lu';
import { getFontOptions } from '../../../core/fonts';
import { IMPACT_ENTER } from '../../../core/impact';
import type { AnimPhase, TextCase, WordAnim, WordStyle } from '../../../core/types';
import { overrideOf, tokenizeText, wordCount, type WordTarget } from '../../../core/words';
import { editor, useActiveSlide } from '../../../store/editor';
import { parseKey, useWordSelection, wordKey, wordSelection } from '../../../store/wordSelection';
import { Button } from '../../../ui/Button';
import { ColorField, Row, Section, Segmented, Select, Slider, Switch } from '../../../ui/Controls';
import { useCustomFonts, useDebouncedReplay } from '../hooks';
import { ColorFxControls } from './ColorFxControls';

const WEIGHTS: { v: string; label: string }[] = [
  { v: '', label: 'Igual ao texto' },
  { v: '300', label: 'Fina (300)' },
  { v: '400', label: 'Normal (400)' },
  { v: '500', label: 'Média (500)' },
  { v: '600', label: 'Seminegrito (600)' },
  { v: '700', label: 'Negrito (700)' },
  { v: '800', label: 'Extranegrito (800)' },
  { v: '900', label: 'Preta (900)' },
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

  if (!slide) return <p className="panel-empty">Nenhum trecho selecionado.</p>;

  // seleção válida: a camada existe neste trecho e a palavra ainda existe no texto
  const targets: WordTarget[] = keys
    .map(parseKey)
    .filter((t): t is WordTarget => !!t)
    .filter((t) => {
      const l = slide.layers.find((x) => x.id === t.layerId);
      return !!l && t.index < wordCount(l.text);
    });
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
      <Section title="Estilo automático">
        <p className="props-note">
          “Impacto”: uma palavra-chave grande em MAIÚSCULAS e o resto menor em minúsculas, como nos lyric videos. Reescreve as quebras de linha do texto.
        </p>
        <Button size="sm" icon={<LuLayoutTemplate />} className="props-upload" onClick={() => editor.applyImpactToSlide()}>
          Aplicar neste trecho
        </Button>
        <Button size="sm" variant="ghost" icon={<LuLayoutTemplate />} className="props-upload" onClick={() => editor.applyImpactToAll()}>
          Aplicar em todos os trechos
        </Button>
        <Button size="sm" variant="ghost" icon={<LuEraser />} className="props-upload" onClick={() => editor.clearWordStyles('slide')}>
          Limpar ajustes de palavras (este trecho)
        </Button>
      </Section>

      <Section title="Palavras do trecho">
        {slide.layers
          .filter((l) => l.visible && l.text.trim())
          .map((l) => (
            <div key={l.id} className="wlist" aria-label={`Palavras de ${l.name}`}>
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
                          title={edited ? 'Esta palavra tem ajustes próprios' : undefined}
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
            <LuMousePointerClick aria-hidden /> Clique numa palavra aqui ou na prévia para editá-la. Shift ou Ctrl soma várias.
          </p>
        )}
      </Section>

      {targets.length > 0 && layer && (
        <>
          <p className="wsel" role="status">
            {targets.length === 1 ? (
              <>
                Editando <b>“{word}”</b>
              </>
            ) : (
              <>
                Editando <b>{targets.length} palavras</b>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => wordSelection.clear()}>
              Desmarcar
            </Button>
          </p>

          <Section title="Fonte da palavra">
            <Row label="Família">
              <Select value={st.fontFamily ?? ''} onChange={(v) => setStyle({ fontFamily: v === '' ? null : v })} label="Fonte da palavra">
                <option value="">Igual ao texto</option>
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
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
            <Slider label="Tamanho" value={st.scale ?? 1} min={0.2} max={4} step={0.05} unit="×" reset={1} onChange={(v) => setStyle({ scale: v === 1 ? null : v })} />
            <Row label="Peso">
              <Select value={st.weight === undefined ? '' : String(st.weight)} onChange={(v) => setStyle({ weight: v === '' ? null : Number(v) })} label="Peso da fonte">
                {WEIGHTS.map((w) => (
                  <option key={w.v} value={w.v}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Caixa">
              <Segmented<TextCase | 'inherit'>
                size="sm"
                label="Caixa das letras"
                value={st.textCase ?? 'inherit'}
                onChange={(v) => setStyle({ textCase: v === 'inherit' ? null : v })}
                options={[
                  { value: 'inherit', label: 'Igual', title: 'Igual ao texto' },
                  { value: 'lower', label: 'abc', title: 'minúsculas' },
                  { value: 'none', label: 'Abc', title: 'Como digitado' },
                  { value: 'upper', label: 'ABC', title: 'MAIÚSCULAS' },
                ]}
              />
            </Row>
            <Row label="Itálico">
              <Segmented<'inherit' | 'yes' | 'no'>
                size="sm"
                label="Itálico"
                value={st.italic === undefined ? 'inherit' : st.italic ? 'yes' : 'no'}
                onChange={(v) => setStyle({ italic: v === 'inherit' ? null : v === 'yes' })}
                options={[
                  { value: 'inherit', label: 'Igual' },
                  { value: 'yes', label: 'Sim' },
                  { value: 'no', label: 'Não' },
                ]}
              />
            </Row>
            <Row label="Cor">
              <ColorField value={st.color ?? layer.style.color} onChange={(v) => setStyle({ color: v })} label="Cor da palavra" />
              {st.color && (
                <Button size="sm" variant="ghost" onClick={() => setStyle({ color: null })}>
                  Igual
                </Button>
              )}
            </Row>
            <Slider
              label="Espaço entre letras"
              value={st.letterSpacing ?? layer.style.letterSpacing}
              min={-10}
              max={60}
              unit=""
              reset={layer.style.letterSpacing}
              onChange={(v) => setStyle({ letterSpacing: v === layer.style.letterSpacing ? null : v })}
            />
          </Section>

          <Section title="Animação própria" toggle={{ checked: !!anim, onChange: (on) => setAnim(on ? DEFAULT_ANIM : null) }}>
            {!anim ? (
              <p className="props-note">Desligada: a palavra segue a animação do trecho. Ligue para dar a ela uma entrada diferente.</p>
            ) : (
              <>
                <Row label="Preparada">
                  <Select
                    value=""
                    label="Modelo de entrada"
                    onChange={(v) => {
                      const m = QUICK[v];
                      if (m) setAnim({ ...anim, enter: m });
                    }}
                  >
                    <option value="">Escolher…</option>
                    {Object.keys(QUICK).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                </Row>
                <Row label="Desvanecer (fade)">
                  <Switch checked={anim.enter.fade} onChange={(v) => setPhase({ fade: v })} label="Fade da palavra" />
                </Row>
                <Row label="Deslizar (slide)">
                  <Switch checked={anim.enter.slide} onChange={(v) => setPhase({ slide: v })} label="Slide da palavra" />
                </Row>
                <Row label="Desfocar (blur)">
                  <Switch checked={anim.enter.blur} onChange={(v) => setPhase({ blur: v })} label="Blur da palavra" />
                </Row>
                <Row label="Zoom">
                  <Segmented<AnimPhase['zoom']>
                    size="sm"
                    label="Zoom da palavra"
                    value={anim.enter.zoom}
                    onChange={(v) => setPhase({ zoom: v })}
                    options={[
                      { value: 'none', label: 'Nenhum' },
                      { value: 'in', label: 'Crescer' },
                      { value: 'out', label: 'Encolher' },
                    ]}
                  />
                </Row>
                <Slider label="Atraso extra" value={anim.delay ?? 0} min={0} max={3000} step={50} unit="ms" reset={0} onChange={(v) => setAnim({ ...anim, delay: v })} />
                <Slider label="Duração" value={anim.duration ?? 800} min={100} max={3000} step={50} unit="ms" reset={800} onChange={(v) => setAnim({ ...anim, duration: v })} />
                <Slider label="Intensidade" value={anim.intensity ?? 50} min={0} max={100} unit="%" reset={50} onChange={(v) => setAnim({ ...anim, intensity: v })} />
              </>
            )}
          </Section>

          <Section title="Troca de cor" defaultOpen={!!ov?.colorFx}>
            <p className="props-note">Só esta palavra muda de cor depois de entrar. Vale mais que a troca de cor do trecho.</p>
            <ColorFxControls
              single
              value={ov?.colorFx}
              switchLabel="Trocar a cor desta palavra"
              current={st.color ?? layer.style.color}
              onChange={(fx) => {
                editor.patchWords(targets, { colorFx: fx });
                replay();
              }}
            />
          </Section>

          <Button size="sm" variant="ghost" icon={<LuEraser />} className="props-upload" onClick={() => editor.clearWords(targets)}>
            Limpar ajustes {targets.length === 1 ? 'desta palavra' : 'destas palavras'}
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
