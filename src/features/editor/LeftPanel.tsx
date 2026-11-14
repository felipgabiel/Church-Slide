import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LuImage, LuListOrdered, LuPlus, LuShapes, LuClapperboard } from 'react-icons/lu';
import { applyPreset, ANIMATION_PRESETS, PRESET_GROUPS, type AnimPreset } from '../../core/anim/presets';
import { totalDuration } from '../../core/anim/engine';
import { colorEnd } from '../../core/anim/colorfx';
import { patchWord, wordCount } from '../../core/words';
import { BACKGROUND_GROUPS, BACKGROUND_PRESETS, type BackgroundPreset } from '../../core/backgrounds';
import { newSlide, resolveAnimation, resolveBackground, slideText } from '../../core/defaults';
import { useSetting } from '../../core/settings';
import { THEME_PRESETS } from '../../core/themes';
import type { Aspect, Slide, Theme } from '../../core/types';
import { ASPECT_RATIOS } from '../../core/types';
import { sameJson } from '../../render/css';
import { SlideThumb } from '../../render/SlideThumb';
import { Stage } from '../../render/Stage';
import { editor, useActiveSlide, useEditor } from '../../store/editor';
import { toast } from '../../ui/toast';
import { applyAnimationPreset } from './applyPreset';
import { AnimDuration } from './panels/AnimDuration';
import { MediaGrid } from './MediaGrid';
import { navigate, paths } from '../../app/router';
import { designBackground } from '../../core/design/apply';
import { DesignThumb } from '../backgrounds/DesignThumb';
import { useDesigns } from '../backgrounds/useDesigns';
import { SlideList } from './SlideList';
import { tr } from '../../core/i18n';

type Tab = 'slides' | 'backgrounds' | 'animations' | 'elements';

/* ------------------------------ Fundos ------------------------------ */

const BgCard = memo(function BgCard({ preset, theme, aspect, selected }: { preset: BackgroundPreset; theme: Theme; aspect: Aspect; selected: boolean }) {
  const slide = useMemo(() => newSlide('', theme), [theme]);
  const demo = useMemo<Slide>(() => ({ ...slide, background: preset.bg }), [slide, preset]);
  return (
    <button type="button" className="card" data-on={selected ? '1' : '0'} onClick={() => editor.setBackground(preset.bg)} aria-pressed={selected} title={preset.name}>
      <SlideThumb slide={demo} theme={theme} aspect={aspect} />
      <span>{preset.name}</span>
    </button>
  );
});

function BackgroundLibrary() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const aspect = useEditor((s) => s.project!.aspect);
  const current = resolveBackground(slide, theme);
  const designs = useDesigns();
  return (
    <div className="lp-scroll">
      <h3 className="lp-title">{tr('Meus fundos')}</h3>
      {designs.items.length > 0 ? (
        <div className="cards">
          {designs.items.map((d) => (
            <button
              key={d.id}
              type="button"
              className="card"
              data-on={current.kind === 'design' && current.design?.id === d.id ? '1' : '0'}
              aria-pressed={current.kind === 'design' && current.design?.id === d.id}
              title={tr('{0}: aplicar (o louvor guarda uma cópia)', d.name)}
              onClick={() => editor.setBackground(designBackground(d))}
            >
              <DesignThumb design={d} />
              <span>{d.name}</span>
            </button>
          ))}
        </div>
      ) : (
        !designs.loading && (
          <p className="lp-empty-note">
            {tr('Fundos criados no Estúdio aparecem aqui.')}{' '}
            <button type="button" className="xd-link" onClick={() => navigate(paths.backgrounds)}>
              {tr('Abrir o Estúdio de Fundos')}
            </button>
          </p>
        )
      )}
      <h3 className="lp-title">{tr('Meus arquivos')}</h3>
      <MediaGrid
        selectedId={current.mediaId}
        onPick={(m) => editor.patchBackground({ kind: m.kind === 'video' ? 'video' : 'image', mediaId: m.id })}
      />
      {BACKGROUND_GROUPS.map((g) => (
        <div key={g}>
          <h3 className="lp-title">{tr(g)}</h3>
          <div className="cards">
            {BACKGROUND_PRESETS.filter((p) => p.group === g).map((p) => (
              <BgCard key={p.id} preset={p} theme={theme} aspect={aspect} selected={sameJson(p.bg, current)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Animações ----------------------------- */

/** Pré-visualização ao vivo: só monta o palco enquanto o mouse está sobre o cartão. */
const AnimCard = memo(function AnimCard({ preset, theme, aspect, sample, selected }: { preset: AnimPreset; theme: Theme; aspect: Aspect; sample: string; selected: boolean }) {
  const [hover, setHover] = useState(false);
  const [tick, setTick] = useState(0);
  const cfg = useMemo(() => applyPreset(preset.id, theme.animation), [preset.id, theme.animation]);
  const slide = useMemo<Slide>(() => {
    const s: Slide = { ...newSlide(sample, theme), animation: cfg };
    // estilos de troca de cor: na prévia, todas as palavras trocam
    if (preset.color) for (const l of s.layers) for (let i = 0; i < wordCount(l.text); i++) patchWord(l, i, { colorFx: preset.color });
    return s;
  }, [sample, theme, cfg, preset.color]);
  const enter = totalDuration(cfg, 'enter', 3);
  const loop = Math.max(1900, enter + 1100, preset.color ? colorEnd(preset.color, 12, enter) + 1200 : 0);

  useEffect(() => {
    if (!hover) return;
    setTick((t) => t + 1);
    const id = setInterval(() => setTick((t) => t + 1), loop);
    return () => clearInterval(id);
  }, [hover, loop]);

  return (
    <button
      type="button"
      className="card card-anim"
      data-on={selected ? '1' : '0'}
      aria-pressed={selected}
      onClick={() => applyAnimationPreset(preset.id)}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <span className="thumb" style={{ aspectRatio: String(ASPECT_RATIOS[aspect]) }}>
        {hover ? <Stage theme={theme} slide={slide} mode="live" replayKey={tick} /> : <Stage theme={theme} slide={{ ...slide, animation: null }} mode="static" />}
      </span>
      <span className="card-title">{preset.label}</span>
      <small>{preset.hint}</small>
    </button>
  );
});

const ANIM_GROUPS = PRESET_GROUPS;

function AnimationLibrary() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const aspect = useEditor((s) => s.project!.aspect);
  const cfg = resolveAnimation(slide, theme);
  const text = slide ? slideText(slide).trim() : '';
  const sample = text ? text.split('\n').slice(0, 2).join('\n') : 'Aleluia\nAleluia';
  return (
    <div className="lp-scroll">
      <p className="lp-hint">{tr('Passe o mouse sobre um estilo para ver a animação. Clique para aplicar.')}</p>
      <div className="lp-dur">
        <AnimDuration />
      </div>
      {ANIM_GROUPS.map((g) => (
        <div key={g}>
          <h3 className="lp-title">{tr(g)}</h3>
          <div className="cards">
            {ANIMATION_PRESETS.filter((p) => p.group === g).map((p) => (
              <AnimCard key={p.id} preset={p} theme={theme} aspect={aspect} sample={sample} selected={cfg.preset === p.id} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Elementos ----------------------------- */

function Elements() {
  const name = useEditor((s) => s.project!.name);
  const artist = useEditor((s) => s.project!.artist);
  const aspect = useEditor((s) => s.project!.aspect);
  const add = (role: 'title' | 'credit' | 'free', text: string, msg: string) => {
    editor.addLayer(role, text);
    toast(msg);
  };
  return (
    <div className="lp-scroll">
      <h3 className="lp-title">{tr('Camadas de texto')}</h3>
      <p className="lp-hint">{tr('Adicione textos extras ao trecho selecionado. Cada camada tem estilo e posição próprios.')}</p>
      <div className="lp-btns">
        <button type="button" onClick={() => add('title', name, tr('Título adicionado ao trecho'))}>
          <LuPlus />{' '}{tr('Título da música')}
        </button>
        <button type="button" onClick={() => add('credit', artist || tr('Artista'), tr('Crédito adicionado ao trecho'))}>
          <LuPlus />{' '}{tr('Crédito')}
        </button>
        <button type="button" onClick={() => add('free', tr('Novo texto'), tr('Texto livre adicionado ao trecho'))}>
          <LuPlus />{' '}{tr('Texto livre')}
        </button>
      </div>

      <h3 className="lp-title">{tr('Temas prontos')}</h3>
      <p className="lp-hint">{tr('Aplicam fonte, cores, fundo e animação a todos os trechos de uma vez. Dá para desfazer com Ctrl+Z.')}</p>
      <div className="cards">
        {THEME_PRESETS.map((t) => {
          const demo = newSlide(tr('Santo, santo\nÉ o Senhor'), t.theme);
          return (
            <button
              key={t.id}
              type="button"
              className="card"
              title={t.description}
              onClick={() => {
                editor.applyTheme(t.theme);
                toast(tr('Tema “{0}” aplicado', t.name));
              }}
            >
              <SlideThumb slide={demo} theme={t.theme} aspect={aspect} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- Painel ------------------------------- */

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'slides', label: tr('Trechos'), icon: <LuListOrdered /> },
  { id: 'backgrounds', label: tr('Fundos'), icon: <LuImage /> },
  { id: 'animations', label: tr('Animações'), icon: <LuClapperboard /> },
  { id: 'elements', label: tr('Elementos'), icon: <LuShapes /> },
];

export function LeftPanel({ onLyrics }: { onLyrics: () => void }) {
  const [tab, setTab] = useSetting<Tab>('left-tab', 'slides');
  return (
    <div className="panel">
      <div className="tabs tabs-icons" role="tablist" aria-label={tr('Bibliotecas')}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-on={tab === t.id ? '1' : '0'} onClick={() => setTab(t.id)} title={t.label}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'slides' && <SlideList onLyrics={onLyrics} />}
        {tab === 'backgrounds' && <BackgroundLibrary />}
        {tab === 'animations' && <AnimationLibrary />}
        {tab === 'elements' && <Elements />}
      </div>
    </div>
  );
}
