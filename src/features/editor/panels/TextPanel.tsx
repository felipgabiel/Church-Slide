import { useRef } from 'react';
import { LuAlignCenter, LuAlignLeft, LuAlignRight, LuBold, LuCaseUpper, LuItalic, LuRotateCcw, LuUpload } from 'react-icons/lu';
import { MIN_FONT, SYSTEM_SANS } from '../../../core/defaults';
import { getFontOptions } from '../../../core/fonts';
import type { Align } from '../../../core/types';
import { editor, useActiveLayer } from '../../../store/editor';
import { Button, IconButton } from '../../../ui/Button';
import { ColorField, Row, Section, Segmented, Select, Slider, Switch } from '../../../ui/Controls';
import { toast } from '../../../ui/toast';
import { useCustomFonts } from '../hooks';
import { uploadFiles } from '../MediaGrid';
import { bumpMedia } from '../hooks';

export function TextPanel() {
  const layer = useActiveLayer();
  const fonts = useCustomFonts();
  const file = useRef<HTMLInputElement>(null);
  if (!layer) return <p className="panel-empty">Nenhuma camada selecionada.</p>;
  const s = layer.style;
  const set = editor.patchStyle;

  const options = getFontOptions(fonts);
  const known = options.some((o) => o.value === s.fontFamily);
  const groups = [...new Set(options.map((o) => o.group))];

  const onFont = async (files: FileList | null) => {
    if (!files?.length) return;
    const recs = await uploadFiles(files, ['font']);
    if (file.current) file.current.value = '';
    const first = recs[0];
    if (first?.family) {
      set({ fontFamily: `"${first.family}", ${SYSTEM_SANS}` });
      toast(`Fonte “${first.name}” adicionada`);
      bumpMedia();
    }
  };

  return (
    <div className="props">
      <Section title="Fonte">
        <Row label="Família">
          <Select value={s.fontFamily} onChange={(v) => set({ fontFamily: v })} label="Fonte" optionStyle={(v) => ({ fontFamily: v })}>
            {!known && <option value={s.fontFamily}>Personalizada</option>}
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
        <input ref={file} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" multiple hidden onChange={(e) => void onFont(e.currentTarget.files)} />
        <Button size="sm" variant="ghost" icon={<LuUpload />} className="props-upload" onClick={() => file.current?.click()}>
          Enviar fonte (.ttf, .otf, .woff)
        </Button>
        <Slider label="Tamanho" value={s.fontSize} min={2} max={24} step={0.1} unit="%" reset={8} onChange={(v) => set({ fontSize: v })} />
        <Row label="Cor">
          <ColorField label="Cor do texto" value={s.color} onChange={(v) => set({ color: v })} />
        </Row>
        <Row label="Estilo">
          <div className="tgl">
            <IconButton label="Negrito" icon={<LuBold />} size="sm" active={s.bold} onClick={() => set({ bold: !s.bold })} />
            <IconButton label="Itálico" icon={<LuItalic />} size="sm" active={s.italic} onClick={() => set({ italic: !s.italic })} />
            <IconButton label="Tudo em maiúsculas" icon={<LuCaseUpper />} size="sm" active={s.uppercase} onClick={() => set({ uppercase: !s.uppercase })} />
          </div>
        </Row>
        <Row label="Alinhamento">
          <Segmented<Align>
            size="sm"
            label="Alinhamento do texto"
            value={s.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', icon: <LuAlignLeft />, title: 'À esquerda' },
              { value: 'center', icon: <LuAlignCenter />, title: 'Centralizado' },
              { value: 'right', icon: <LuAlignRight />, title: 'À direita' },
            ]}
          />
        </Row>
        <Slider label="Espaço entre letras" value={s.letterSpacing} min={-5} max={60} step={0.5} reset={1} onChange={(v) => set({ letterSpacing: v })} />
        <Slider label="Espaço entre linhas" value={s.lineHeight} min={0.4} max={2.4} step={0.05} reset={1.25} onChange={(v) => set({ lineHeight: v })} />
      </Section>

      <Section
        title="Proporção entre linhas"
        defaultOpen={s.equalize}
        toggle={{ checked: s.equalize && !s.autoWidth, onChange: (v) => set(v ? { equalize: true, autoWidth: false } : { equalize: false }) }}
      >
        <p className="props-note">
          Linhas com mais palavras ficam com letra menor para terminar no mesmo comprimento da linha de letra maior, como em “vem sobre mim” sobre “SENHOR”.
        </p>
        <Slider
          label="Menor tamanho permitido"
          value={s.equalizeMin ?? 30}
          min={10}
          max={100}
          step={1}
          unit="%"
          reset={30}
          disabled={!s.equalize || s.autoWidth}
          onChange={(v) => set({ equalizeMin: v })}
        />
        <p className="props-note">Quanto menor o valor, mais a linha comprida pode encolher. Em 100% nada é reduzido.</p>
      </Section>

      <Section title="Legibilidade no telão">
        <Row label="Ajustar se não couber" hint="Alarga a caixa e, se precisar, reduz">
          <Switch checked={s.autoFit} onChange={(v) => set({ autoFit: v })} label="Ajuste automático do tamanho" />
        </Row>
        <Slider
          label="Letra mínima"
          value={s.minFont ?? MIN_FONT}
          min={2}
          max={12}
          step={0.1}
          unit="%"
          reset={MIN_FONT}
          onChange={(v) => set({ minFont: v })}
        />
        <p className="props-note">
          Os ajustes automáticos (proporção entre linhas e “ajustar se não couber”) nunca deixam a letra menor que isso: a linha quebra em duas em vez de encolher. Em % da altura do slide; {MIN_FONT}% ≈ {Math.round(1080 * (MIN_FONT / 100))} px em Full HD.
        </p>
      </Section>

      <Section title="Posição e tamanho do bloco">
        <Slider label="Horizontal" value={s.x} min={0} max={100} step={0.5} unit="%" reset={50} onChange={(v) => set({ x: v })} />
        <Slider label="Vertical" value={s.y} min={0} max={100} step={0.5} unit="%" reset={50} onChange={(v) => set({ y: v })} />
        <Row label="Caixa do tamanho do texto" hint="Para palavras soltas">
          <Switch checked={!!s.autoWidth} onChange={(v) => set(v ? { autoWidth: true, equalize: false } : { autoWidth: false })} label="Caixa acompanha o texto" />
        </Row>
        <Slider label="Largura" value={s.width} min={20} max={100} step={1} unit="%" reset={84} disabled={!!s.autoWidth} onChange={(v) => set({ width: v })} />
        <div className="props-pair">
          <Button size="sm" onClick={() => set({ x: 50 })}>
            Centralizar na horizontal
          </Button>
          <Button size="sm" onClick={() => set({ y: 50 })}>
            Centralizar na vertical
          </Button>
        </div>
        <p className="props-note">Dica: arraste o texto direto na pré-visualização. Segure Alt para não grudar nas guias.</p>
      </Section>

      <Section title="Aparência" defaultOpen={false}>
        <Slider label="Opacidade" value={s.opacity} min={0} max={100} unit="%" reset={100} onChange={(v) => set({ opacity: v })} />
        <Slider label="Desfoque" value={s.blur} min={0} max={40} step={0.5} reset={0} onChange={(v) => set({ blur: v })} />
      </Section>

      <Section title="Sombra" defaultOpen={s.shadow.enabled} toggle={{ checked: s.shadow.enabled, onChange: (v) => set({ shadow: { enabled: v } }) }}>
        <Row label="Cor">
          <ColorField label="Cor da sombra" value={s.shadow.color} onChange={(v) => set({ shadow: { color: v } })} />
        </Row>
        <Slider label="Deslocamento X" value={s.shadow.x} min={-30} max={30} step={0.5} reset={0} onChange={(v) => set({ shadow: { x: v } })} />
        <Slider label="Deslocamento Y" value={s.shadow.y} min={-30} max={30} step={0.5} reset={3} onChange={(v) => set({ shadow: { y: v } })} />
        <Slider label="Desfoque" value={s.shadow.blur} min={0} max={60} step={0.5} reset={12} onChange={(v) => set({ shadow: { blur: v } })} />
      </Section>

      <Section title="Contorno" defaultOpen={s.stroke.enabled} toggle={{ checked: s.stroke.enabled, onChange: (v) => set({ stroke: { enabled: v } }) }}>
        <Row label="Cor">
          <ColorField label="Cor do contorno" value={s.stroke.color} onChange={(v) => set({ stroke: { color: v } })} />
        </Row>
        <Slider label="Espessura" value={s.stroke.width} min={0.5} max={30} step={0.5} reset={6} onChange={(v) => set({ stroke: { width: v } })} />
      </Section>

      <Section title="Brilho" defaultOpen={s.glow.enabled} toggle={{ checked: s.glow.enabled, onChange: (v) => set({ glow: { enabled: v } }) }}>
        <Row label="Cor">
          <ColorField label="Cor do brilho" value={s.glow.color} onChange={(v) => set({ glow: { color: v } })} />
        </Row>
        <Slider label="Intensidade" value={s.glow.blur} min={2} max={100} step={1} reset={30} onChange={(v) => set({ glow: { blur: v } })} />
      </Section>

      <div className="props-foot">
        <Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => editor.resetStyle()}>
          Restaurar estilo padrão do tema
        </Button>
      </div>
    </div>
  );
}
