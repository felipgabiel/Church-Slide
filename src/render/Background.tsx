import { memo, useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { BOKEH } from '../core/bokeh';
import type { Background } from '../core/types';
import { adjustFilter, gradientCss } from './css';
import { useMediaUrl } from './useMedia';

interface Props {
  bg: Background;
  /** `static` = sem vídeo/animação (miniaturas) */
  mode: 'live' | 'static';
  /** quando o vídeo falha, avisa quem estiver observando */
  onMediaError?: () => void;
}


function AnimatedBg({ bg }: { bg: Background }) {
  const stops = bg.gradient.stops;
  const c1 = stops[0]?.color ?? '#6d5cff';
  const c2 = stops[1]?.color ?? c1;
  const c3 = stops[2]?.color ?? c2;
  const style = { '--c1': c1, '--c2': c2, '--c3': c3, '--speed': String(Math.max(0.1, bg.speed)) } as CSSProperties;
  switch (bg.animated) {
    case 'aurora':
      return (
        <div className="bg-anim bg-aurora" style={style}>
          <i /> <i /> <i />
        </div>
      );
    case 'drift':
      return <div className="bg-anim bg-drift" style={style} />;
    case 'bokeh':
      return (
        <div className="bg-anim bg-bokeh" style={style}>
          {BOKEH.map((b, i) => (
            <i
              key={i}
              style={{
                left: `${b.left}%`,
                width: `${b.size}cqh`,
                height: `${b.size}cqh`,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.dur}s`,
                ['--bc' as string]: b.hue === 0 ? 'var(--c1)' : b.hue === 1 ? 'var(--c2)' : 'var(--c3)',
              }}
            />
          ))}
        </div>
      );
    case 'rays':
      return (
        <div className="bg-anim bg-rays" style={style}>
          <i />
          <i />
        </div>
      );
    case 'waves':
      return (
        <div className="bg-anim bg-waves" style={style}>
          {[0, 1, 2].map((n) => (
            <svg key={n} viewBox="0 0 2880 320" preserveAspectRatio="none" className={`wave w${n}`} aria-hidden>
              <path
                d="M0,160 C240,80 480,240 720,160 C960,80 1200,240 1440,160 C1680,80 1920,240 2160,160 C2400,80 2640,240 2880,160 L2880,320 L0,320 Z"
                fill={n === 0 ? 'var(--c1)' : n === 1 ? 'var(--c2)' : 'var(--c3)'}
              />
            </svg>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function MediaFill({ bg, mode, onMediaError }: Props) {
  const wantThumb = mode === 'static' && bg.kind === 'video';
  const media = useMediaUrl(bg.mediaId, wantThumb);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setFailed(false);
    setReady(false);
  }, [bg.mediaId]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = Math.min(4, Math.max(0.1, bg.speed));
  }, [bg.speed, media.url]);

  useEffect(() => {
    if (media.status === 'missing') onMediaError?.();
  }, [media.status, onMediaError]);

  if (!bg.mediaId || media.status === 'missing' || failed) return null;
  if (!media.url) return null;

  const style: CSSProperties = {
    objectPosition: `${bg.posX}% ${bg.posY}%`,
    transformOrigin: `${bg.posX}% ${bg.posY}%`,
    transform: bg.scale !== 100 ? `scale(${bg.scale / 100})` : undefined,
  };

  if (bg.kind === 'video' && mode === 'live') {
    return (
      <video
        ref={videoRef}
        className={`bg-fill bg-video${ready ? ' is-ready' : ''}`}
        style={style}
        src={media.url}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onLoadedData={(e: SyntheticEvent<HTMLVideoElement>) => {
          setReady(true);
          void e.currentTarget.play().catch(() => undefined);
        }}
        onError={() => {
          setFailed(true);
          onMediaError?.();
        }}
      />
    );
  }
  return <img className="bg-fill" style={style} src={media.url} alt="" draggable={false} onError={() => setFailed(true)} />;
}

/**
 * Fundo de um slide. Camada de cor/gradiente sempre presente — se a mídia
 * faltar ou o vídeo não carregar, o fundo continua válido (nunca fica preto "quebrado").
 */
export const BackgroundView = memo(function BackgroundView({ bg, mode, onMediaError }: Props) {
  const filter = adjustFilter(bg);
  const blur = bg.adjust.blur > 0;
  const base = bg.kind === 'gradient' ? gradientCss(bg) : bg.kind === 'animated' ? bg.color : bg.color;
  const hasMedia = (bg.kind === 'image' || bg.kind === 'video') && !!bg.mediaId;

  return (
    <div className="bg" style={{ background: base }}>
      {(hasMedia || bg.kind === 'animated') && (
        <div className="bg-media" style={{ filter, inset: blur ? '-4%' : 0 }}>
          {hasMedia ? <MediaFill bg={bg} mode={mode} onMediaError={onMediaError} /> : mode === 'live' ? <AnimatedBg bg={bg} /> : <StaticAnimated bg={bg} />}
        </div>
      )}
      {(bg.kind === 'gradient' || bg.kind === 'solid') && filter && <div className="bg-filter" style={{ backdropFilter: filter }} />}
      {bg.adjust.dim > 0 && <div className="bg-dim" style={{ opacity: bg.adjust.dim / 100 }} />}
    </div>
  );
});

/** Miniatura de fundo animado: um frame estático com as mesmas cores. */
function StaticAnimated({ bg }: { bg: Background }) {
  const s = bg.gradient.stops;
  const c1 = s[0]?.color ?? '#6d5cff';
  const c2 = s[1]?.color ?? c1;
  const c3 = s[2]?.color ?? c2;
  return (
    <div
      className="bg-fill"
      style={{
        background: `radial-gradient(60% 70% at 20% 25%, ${c1}cc, transparent 70%), radial-gradient(55% 65% at 80% 30%, ${c2}bb, transparent 70%), radial-gradient(70% 60% at 50% 95%, ${c3}aa, transparent 70%)`,
      }}
    />
  );
}
