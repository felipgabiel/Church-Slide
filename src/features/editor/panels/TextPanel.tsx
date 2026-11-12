import { useRef } from 'react';
import { LuAlignCenter, LuAlignLeft, LuAlignRight, LuBold, LuCaseUpper, LuItalic, LuRotateCcw, LuUpload } from 'react-icons/lu';
import { MIN_FONT, SYSTEM_SANS } from '../../../core/defaults';
import { getFontOptions } from '../../../core/fonts';
import type { Align } from '../../../core/types';
import { editor, useActiveLayer, useSelectedLayerIds } from '../../../store/editor';
import { Button, IconButton } from '../../../ui/Button';
import { ColorField, Row, Section, Segmented, Select, Slider, Switch } from '../../../ui/Controls';
import { toast } from '../../../ui/toast';
import { useCustomFonts } from '../hooks';
import { uploadFiles } from '../MediaGrid';
import { bumpMedia } from '../hooks';
import { tr } from '../../../core/i18n';

export function TextPanel() {
  const layer = useActiveLayer();
  const fonts = useCustomFonts();
  const file = useRef<HTMLInputElement>(null);
  const selCount = useSelectedLayerIds().length;
  if (!layer) return <p className="panel-empty">{tr('Nenhuma camada selecionada.')}</p>;
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
      toast(tr('Fonte “{0}” adicionada', first.name));
      bumpMedia();
    }
  };

  return (
    <div className="props">
      {selCount > 1 && (
        <div className="notice" role="status">
          <span>
            <b>{selCount}{' '}{tr('textos selecionados.')}</b>{' '}{tr('Os ajustes valem para todos.')}
          </span>
          <Button size="sm" variant="ghost" onClick={() => editor.selectLayer(layer.id)}>
            {tr('Só este')}
          </Button>
        </div>
      )}
      <Section title={tr('Fonte')}>
        <div className="font-row">
          <Select value={s.fontFamily} onChange={(v) => set({ fontFamily: v })} label={tr('Fonte')} optionStyle={(v) => ({ fontFamily: v })}>
            {!known && <option value={s.fontFamily}>{tr('Personalizada')}</option>}
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
          <IconButton label={tr('Enviar fonte do computador (.ttf, .otf, .woff)')} icon={<LuUpload />} size="sm" onClick={() => file.current?.click()} />
        </div>
        <input ref={file} type="file" accept=".ttf,.otf,.woff,.woff2,font/*" multiple hidden onChange={(e) => void onFont(e.currentTarget.files)} />
        <Slider label={tr('Tamanho')} value={s.fontSize} min={1} max={60} step={0.1} unit="%" reset={8} onChange={(v) => set({ fontSize: v })} />
        <Row label={tr('Cor')}>
          <ColorField label={tr('Cor do texto')} value={s.color} onChange={(v) => set({ color: v })} />
        </Row>
        <Row label={tr('Estilo')}>
          <div className="tgl">
            <IconButton label={tr('Negrito')} icon={<LuBold />} size="sm" active={s.bold} onClick={() => set({ bold: !s.bold })} />
            <IconButton label={tr('Itálico')} icon={<LuItalic />} size="sm" active={s.italic} onClick={() => set({ italic: !s.italic })} />
            <IconButton label={tr('Tudo em maiúsculas')} icon={<LuCaseUpper />} size="sm" active={s.uppercase} onClick={() => set({ uppercase: !s.uppercase })} />
          </div>
        </Row>
        <Row label={tr('Alinhamento')}>
          <Segmented<Align>
            size="sm"
            label={tr('Alinhamento do texto')}
            value={s.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', icon: <LuAlignLeft />, title: tr('À esquerda') },
              { value: 'center', icon: <LuAlignCenter />, title: tr('Centralizado') },
              { value: 'right', icon: <LuAlignRight />, title: tr('À direita') },
            ]}
          />
        </Row>
        <Slider label={tr('Espaço entre letras')} value={s.letterSpacing} min={-20} max={60} step={0.5} reset={1} onChange={(v) => set({ letterSpacing: v })} />
        <Slider label={tr('Espaço entre linhas')} value={s.lineHeight} min={0.4} max={2.4} step={0.05} reset={1.25} onChange={(v) => set({ lineHeight: v })} />
      </Section>

      <Section
        title={tr('Proporção entre linhas')}
        defaultOpen={false}
        hint={tr('Linhas com mais palavras ficam com letra menor e terminam no mesmo comprimento da linha de letra maior, como “vem sobre mim” sobre “SENHOR”.')}
        toggle={{ checked: s.equalize && !s.autoWidth, onChange: (v) => set(v ? { equalize: true, autoWidth: false } : { equalize: false }) }}
      >
        <Slider
          label={tr('Menor tamanho permitido')}
          value={s.equalizeMin ?? 30}
          min={10}
          max={100}
          step={1}
          unit="%"
          reset={30}
          disabled={!s.equalize || s.autoWidth}
          onChange={(v) => set({ equalizeMin: v })}
        />
      </Section>

      <Section
        title={tr('Legibilidade no telão')}
        defaultOpen={false}
        hint={tr('Os ajustes automáticos nunca deixam a letra menor que a “Letra mínima”: a linha quebra em vez de encolher. Em % da altura do slide ({0}% ≈ {1} px em Full HD).', MIN_FONT, Math.round(1080 * (MIN_FONT / 100)))}
      >
        <Row label={tr('Ajustar se não couber')} hint={tr('Alarga a caixa e, se precisar, reduz')}>
          <Switch checked={s.autoFit} onChange={(v) => set({ autoFit: v })} label={tr('Ajuste automático do tamanho')} />
        </Row>
        <Slider
          label={tr('Letra mínima')}
          value={s.minFont ?? MIN_FONT}
          min={2}
          max={12}
          step={0.1}
          unit="%"
          reset={MIN_FONT}
          onChange={(v) => set({ minFont: v })}
        />
      </Section>

      <Section title={tr('Posição e tamanho')} defaultOpen={false} hint={tr('Dica: arraste o texto direto no slide. Segure Alt para não grudar nas guias.')}>
        <Slider label={tr('Horizontal')} value={s.x} min={0} max={100} step={0.5} unit="%" reset={50} onChange={(v) => set({ x: v })} />
        <Slider label={tr('Vertical')} value={s.y} min={0} max={100} step={0.5} unit="%" reset={50} onChange={(v) => set({ y: v })} />
        <Slider label={tr('Rotação')} value={s.rotation ?? 0} min={-180} max={180} step={1} unit="°" reset={0} onChange={(v) => set({ rotation: v })} />
        <Row label={tr('Caixa do tamanho do texto')} hint={tr('Para palavras soltas')}>
          <Switch checked={!!s.autoWidth} onChange={(v) => set(v ? { autoWidth: true, equalize: false } : { autoWidth: false })} label={tr('Caixa acompanha o texto')} />
        </Row>
        <Slider label={tr('Largura')} value={s.width} min={20} max={100} step={1} unit="%" reset={84} disabled={!!s.autoWidth} onChange={(v) => set({ width: v })} />
        <div className="props-pair">
          <Button size="sm" variant="ghost" onClick={() => set({ x: 50 })}>
            {tr('Centralizar ↔')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => set({ y: 50 })}>
            {tr('Centralizar ↕')}
          </Button>
        </div>
      </Section>

      <Section
        title={tr('Inverter cores')}
        defaultOpen={false}
        hint={tr('A letra mostra o negativo do que está atrás dela: sobre partes claras fica escura e sobre partes escuras fica clara. Funciona melhor com a letra branca.')}
        toggle={{ checked: s.blend === 'difference', onChange: (v) => set({ blend: v ? 'difference' : 'normal' }) }}
      >
        <p className="props-note">
          {s.blend === 'difference' ? tr('Ligado: a cor da letra se inverte sobre o fundo, inclusive em fundos animados e no vídeo.') : tr('Ligue para a letra trocar de cor sozinha conforme o fundo passa por trás.')}
        </p>
        {s.blend === 'difference' && s.color.toLowerCase() !== '#ffffff' && (
          <Button size="sm" onClick={() => set({ color: '#ffffff' })}>
            {tr('Usar letra branca (inversão completa)')}
          </Button>
        )}
      </Section>

      <Section title={tr('Aparência')} defaultOpen={false}>
        <Slider label={tr('Opacidade')} value={s.opacity} min={0} max={100} unit="%" reset={100} onChange={(v) => set({ opacity: v })} />
        <Slider label={tr('Desfoque')} value={s.blur} min={0} max={40} step={0.5} reset={0} onChange={(v) => set({ blur: v })} />
      </Section>

      <Section title={tr('Sombra')} defaultOpen={false} toggle={{ checked: s.shadow.enabled, onChange: (v) => set({ shadow: { enabled: v } }) }}>
        <Row label={tr('Cor')}>
          <ColorField label={tr('Cor da sombra')} value={s.shadow.color} onChange={(v) => set({ shadow: { color: v } })} />
        </Row>
        <Slider label={tr('Deslocamento X')} value={s.shadow.x} min={-30} max={30} step={0.5} reset={0} onChange={(v) => set({ shadow: { x: v } })} />
        <Slider label={tr('Deslocamento Y')} value={s.shadow.y} min={-30} max={30} step={0.5} reset={3} onChange={(v) => set({ shadow: { y: v } })} />
        <Slider label={tr('Desfoque')} value={s.shadow.blur} min={0} max={60} step={0.5} reset={12} onChange={(v) => set({ shadow: { blur: v } })} />
      </Section>

      <Section title={tr('Contorno')} defaultOpen={false} toggle={{ checked: s.stroke.enabled, onChange: (v) => set({ stroke: { enabled: v } }) }}>
        <Row label={tr('Cor')}>
          <ColorField label={tr('Cor do contorno')} value={s.stroke.color} onChange={(v) => set({ stroke: { color: v } })} />
        </Row>
        <Slider label={tr('Espessura')} value={s.stroke.width} min={0.5} max={30} step={0.5} reset={6} onChange={(v) => set({ stroke: { width: v } })} />
      </Section>

      <Section title={tr('Brilho')} defaultOpen={false} toggle={{ checked: s.glow.enabled, onChange: (v) => set({ glow: { enabled: v } }) }}>
        <Row label={tr('Cor')}>
          <ColorField label={tr('Cor do brilho')} value={s.glow.color} onChange={(v) => set({ glow: { color: v } })} />
        </Row>
        <Slider label={tr('Intensidade')} value={s.glow.blur} min={2} max={100} step={1} reset={30} onChange={(v) => set({ glow: { blur: v } })} />
      </Section>

      <div className="props-foot">
        <Button size="sm" variant="ghost" icon={<LuRotateCcw />} onClick={() => editor.resetStyle()}>
          {tr('Restaurar estilo padrão do tema')}
        </Button>
      </div>
    </div>
  );
}
