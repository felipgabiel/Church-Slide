import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LuImage, LuListOrdered, LuPlus, LuShapes, LuSparkles } from 'react-icons/lu';
import { applyPreset, ANIMATION_PRESETS, type AnimPreset, type PresetGroup } from '../../core/anim/presets';
import { totalDuration } from '../../core/anim/engine';
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
import { MediaGrid } from './MediaGrid';
import { SlideList } from './SlideList';

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
  return (
    <div className="lp-scroll">
      <h3 className="lp-title">Meus arquivos</h3>
      <MediaGrid
        selectedId={current.mediaId}
        onPick={(m) => editor.patchBackground({ kind: m.kind === 'video' ? 'video' : 'image', mediaId: m.id })}
      />
      {BACKGROUND_GROUPS.map((g) => (
        <div key={g}>
          <h3 className="lp-title">{g}</h3>
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
  const slide = useMemo<Slide>(() => ({ ...newSlide(sample, theme), animation: cfg }), [sample, theme, cfg]);
  const loop = Math.max(1900, totalDuration(cfg, 'enter', 3) + 1100);

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
      onClick={() => editor.setAnimationPreset(preset.id)}
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

const ANIM_GROUPS: PresetGroup[] = ['Básicas', 'Movimento', 'Combinadas', 'Por texto'];

function AnimationLibrary() {
  const slide = useActiveSlide();
  const theme = useEditor((s) => s.project!.theme);
  const aspect = useEditor((s) => s.project!.aspect);
  const cfg = resolveAnimation(slide, theme);
  const text = slide ? slideText(slide).trim() : '';
  const sample = text ? text.split('\n').slice(0, 2).join('\n') : 'Aleluia\nAleluia';
  return (
    <div className="lp-scroll">
      <p className="lp-hint">Passe o mouse sobre um estilo para ver a animação. Clique para aplicar.</p>
      {ANIM_GROUPS.map((g) => (
        <div key={g}>
          <h3 className="lp-title">{g}</h3>
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
      <h3 className="lp-title">Camadas de texto</h3>
      <p className="lp-hint">Adicione textos extras ao trecho selecionado. Cada camada tem estilo e posição próprios.</p>
      <div className="lp-btns">
        <button type="button" onClick={() => add('title', name, 'Título adicionado ao trecho')}>
          <LuPlus /> Título da música
        </button>
        <button type="button" onClick={() => add('credit', artist || 'Artista', 'Crédito adicionado ao trecho')}>
          <LuPlus /> Crédito
        </button>
        <button type="button" onClick={() => add('free', 'Novo texto', 'Texto livre adicionado ao trecho')}>
          <LuPlus /> Texto livre
        </button>
      </div>

      <h3 className="lp-title">Temas prontos</h3>
      <p className="lp-hint">Aplicam fonte, cores, fundo e animação a todos os trechos de uma vez. Dá para desfazer com Ctrl+Z.</p>
      <div className="cards">
        {THEME_PRESETS.map((t) => {
          const demo = newSlide('Santo, santo\nÉ o Senhor', t.theme);
          return (
            <button
              key={t.id}
              type="button"
              className="card"
              title={t.description}
              onClick={() => {
                editor.applyTheme(t.theme);
                toast(`Tema “${t.name}” aplicado`);
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
  { id: 'slides', label: 'Trechos', icon: <LuListOrdered /> },
  { id: 'backgrounds', label: 'Fundos', icon: <LuImage /> },
  { id: 'animations', label: 'Animações', icon: <LuSparkles /> },
  { id: 'elements', label: 'Elementos', icon: <LuShapes /> },
];

export function LeftPanel({ onLyrics }: { onLyrics: () => void }) {
  const [tab, setTab] = useSetting<Tab>('left-tab', 'slides');
  return (
    <div className="panel">
      <div className="tabs tabs-icons" role="tablist" aria-label="Bibliotecas">
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
