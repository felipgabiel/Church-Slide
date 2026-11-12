import { useEffect, useMemo, useRef, useState } from 'react';
import { LuMaximize } from 'react-icons/lu';
import { keyToAction } from '../../core/present/shortcuts';
import { emptyLiveState, LiveBus, readStoredState, type LiveState } from '../../core/present/channel';
import { isFullscreen, toggleFullscreen } from '../../core/present/screens';
import { resolveBackground } from '../../core/defaults';
import { getProject } from '../../core/storage/projects';
import { loadCustomFonts, warmMedia } from '../../core/storage/media';
import { ASPECT_RATIOS, type Project } from '../../core/types';
import { FitBox } from '../../render/FitBox';
import { Stage } from '../../render/Stage';
import { tr } from '../../core/i18n';

/**
 * Janela do público (telão/projetor). Mostra SOMENTE o palco: sem menus, sem cursor parado,
 * sem texto de interface depois de entrar em tela cheia. Recebe comandos do operador por
 * BroadcastChannel e lê projeto e mídia do próprio IndexedDB — nenhuma internet necessária.
 */
export function Output() {
  const [live, setLive] = useState<LiveState | null>(() => readStoredState());
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [fs, setFs] = useState(isFullscreen());
  const [idle, setIdle] = useState(false);
  const busRef = useRef<LiveBus | null>(null);
  const seq = useRef(live?.seq ?? 0);

  // comunicação com o operador
  useEffect(() => {
    const bus = new LiveBus();
    busRef.current = bus;
    const off = bus.onOutputMessage((m) => {
      if (m.t === 'state') {
        // descarta mensagens atrasadas ou duplicadas
        if (m.s.seq < seq.current) return;
        seq.current = m.s.seq;
        setLive(m.s);
      } else if (m.t === 'fullscreen') {
        void toggleFullscreen();
      } else if (m.t === 'close') {
        window.close();
      }
    });
    const hello = () => bus.sendToOperator({ t: 'hello' });
    hello();
    const beat = setInterval(hello, 2000);
    const onFs = () => {
      setFs(isFullscreen());
      bus.sendToOperator({ t: 'fs', on: isFullscreen() });
    };
    document.addEventListener('fullscreenchange', onFs);
    const bye = () => bus.sendToOperator({ t: 'bye' });
    window.addEventListener('pagehide', bye);
    return () => {
      off();
      clearInterval(beat);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('pagehide', bye);
      bye();
      bus.close();
    };
  }, []);

  // Cache de louvores já lidos do IndexedDB (com a "geração" de recarga em que foram lidos).
  // A troca de louvor usa o cache: não há espera nem quadro vazio.
  const cache = useRef(new Map<string, { project: Project; reload: number }>());
  // Último trecho efetivamente mostrado: continua na tela enquanto o próximo louvor termina de carregar.
  const shown = useRef<{ project: Project; index: number } | null>(null);

  const projectId = live?.projectId ?? null;
  const reload = live?.reload ?? 0;
  const preloadKey = (live?.preload ?? []).join('|');

  // carrega o projeto sempre que o operador muda de louvor ou pede recarga
  useEffect(() => {
    if (!projectId) {
      setProject(null);
      shown.current = null;
      return;
    }
    const hit = cache.current.get(projectId);
    if (hit && hit.reload === reload) {
      setMissing(false);
      setProject(hit.project);
      return;
    }
    let alive = true;
    (async () => {
      try {
        await loadCustomFonts().catch(() => undefined);
        const p = await getProject(projectId);
        if (!alive) return;
        setMissing(!p);
        if (p) {
          cache.current.set(p.id, { project: p, reload });
          setProject(p);
        }
      } catch {
        if (alive) setMissing(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, reload]);

  // deixa os próximos louvores do roteiro prontos (projeto + fundo do primeiro trecho)
  useEffect(() => {
    let alive = true;
    for (const id of preloadKey ? preloadKey.split('|') : []) {
      const hit = cache.current.get(id);
      if (hit && hit.reload === reload) continue;
      void getProject(id)
        .then((p) => {
          if (!alive || !p) return;
          cache.current.set(p.id, { project: p, reload });
          const first = p.slides.find((s) => s.layers.some((l) => l.visible && l.text.trim()));
          void warmMedia(resolveBackground(first, p.theme).mediaId);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [preloadKey, reload]);

  const ready = !!project && project.id === projectId;
  if (ready) shown.current = { project, index: live?.index ?? 0 };
  // enquanto o novo louvor não está pronto, segue mostrando o trecho anterior (nunca tela preta)
  const showProject = ready ? project : (shown.current?.project ?? null);
  const showIndex = ready ? (live?.index ?? 0) : (shown.current?.index ?? 0);
  const slide = showProject ? (showProject.slides[showIndex] ?? null) : null;

  // aquece o vídeo do próximo trecho para a troca não engasgar
  useEffect(() => {
    if (!project || !live) return;
    const next = project.slides[live.index + 1];
    if (next) void warmMedia(resolveBackground(next, project.theme).mediaId);
  }, [project, live]);

  // teclado: tela cheia localmente; o resto vai para o operador (ele é quem controla)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = keyToAction(e);
      if (!a) return;
      e.preventDefault();
      if (a.type === 'fullscreen') void toggleFullscreen();
      else if (a.type !== 'exit') busRef.current?.sendToOperator({ t: 'key', action: a });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // esconde o cursor quando o mouse para
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 1800);
    };
    wake();
    window.addEventListener('pointermove', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
    };
  }, []);

  const letterbox = live?.fit === 'letterbox' && showProject;
  const ratio = showProject ? ASPECT_RATIOS[showProject.aspect] : 16 / 9;
  const replay = live?.replay ?? 0;
  const stage = useMemo(
    () => (showProject ? <Stage theme={showProject.theme} slide={slide} mode="live" replayKey={replay} blackout={live?.blackout ?? false} /> : null),
    [showProject, slide, replay, live?.blackout],
  );

  return (
    <div
      className="out"
      data-idle={idle ? '1' : '0'}
      data-fs={fs ? '1' : '0'}
      onClick={() => {
        if (!isFullscreen()) void toggleFullscreen();
      }}
      onDoubleClick={() => {
        if (isFullscreen()) void toggleFullscreen();
      }}
    >
      {letterbox ? (
        <FitBox ratio={ratio}>{stage}</FitBox>
      ) : (
        <div className="out-fill">{stage}</div>
      )}

      {!showProject && (
        <div className="out-wait" aria-live="polite">
          {missing ? tr('Louvor não encontrado neste computador.') : (live ?? emptyLiveState()).projectId ? tr('Carregando…') : tr('Aguardando o operador…')}
        </div>
      )}

      {!fs && (
        <div className="out-hint" role="note">
          <LuMaximize aria-hidden />{' '}{tr('Clique aqui ou aperte')}{' '}<kbd className="kbd">F</kbd>{' '}{tr('para tela cheia')}
        </div>
      )}
    </div>
  );
}
