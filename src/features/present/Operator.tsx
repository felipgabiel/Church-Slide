import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type CSSProperties, type MutableRefObject } from 'react';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { SettingsButton } from '../settings/Settings';
import {
  LuArrowDown,
  LuArrowUp,
  LuCast,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
  LuKeyboard,
  LuListMusic,
  LuMaximize,
  LuMonitor,
  LuMonitorPlay,
  LuMoon,
  LuPenLine,
  LuPlus,
  LuRotateCcw,
  LuSearch,
  LuTimer,
  LuTrash2,
  LuX,
} from 'react-icons/lu';
import { navigate, paths } from '../../app/router';
import { resolveBackground, slideText } from '../../core/defaults';
import { LiveBus, readStoredState, type FitMode, type LiveState } from '../../core/present/channel';
import { clampPos, firstPos, lastPos, nextPos, nextSongPos, playableIndices, prevPos, prevSongPos, type Pos, type SongRef } from '../../core/present/playlist';
import { closeOutputWindow, detectScreens, getOutputWindow, hasWindowManagement, openOutputWindow, screenAccess, toggleFullscreen, type ScreenInfo } from '../../core/present/screens';
import { keyToAction, type PresentAction } from '../../core/present/shortcuts';
import { ShortcutsEditor } from './ShortcutsEditor';
import { useSetting } from '../../core/settings';
import { loadCustomFonts, warmMedia } from '../../core/storage/media';
import { getProject, listProjects } from '../../core/storage/projects';
import { ASPECT_RATIOS, type Project } from '../../core/types';
import { move } from '../../core/util';
import { FitBox } from '../../render/FitBox';
import { SlideThumb } from '../../render/SlideThumb';
import { Stage } from '../../render/Stage';
import { Button, IconButton } from '../../ui/Button';
import { Segmented, Switch } from '../../ui/Controls';
import { LazyMount } from '../../ui/LazyMount';
import { LogoMark } from '../../ui/Logo';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { confirmDialog, toast, toastError, useNow } from '../../ui/toast';
import { tr } from '../../core/i18n';

/**
 * Console do operador (a tela que fica no computador da mesa).
 *
 * O público vê apenas a janela `#/output`, em outro monitor/projetor. Este console:
 *  - mantém o ROTEIRO do culto (vários louvores em fila, salvo neste computador);
 *  - decide o que está no ar e transmite o estado ao telão por BroadcastChannel;
 *  - mostra "Ao vivo" (espelho com as mesmas animações) e "Próximo" (prévia estática);
 *  - responde a atalhos de teclado, inclusive os apertados na própria janela do telão.
 *
 * Passar de um louvor para o seguinte não passa por tela preta: o telão recebe o próximo
 * louvor com antecedência (`preload`) e mantém o trecho anterior até o novo estar pronto.
 */

type Link = { helloAt: number; fs: boolean };

export function Operator({ id }: { id: string }) {
  /* ------------------------------- roteiro ------------------------------- */
  const [setlistRaw, setSetlist] = useSetting<string[]>('setlist', []);
  const rawKey = setlistRaw.join('|');
  const setlist = useMemo(() => (setlistRaw.includes(id) ? setlistRaw : [...setlistRaw, id]), [rawKey, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const setlistKey = setlist.join('|');
  useEffect(() => {
    if (!setlistRaw.includes(id)) setSetlist([...setlistRaw, id]);
  }, [rawKey, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // undefined = ainda carregando · null = não existe mais (apagado)
  const [songs, setSongs] = useState<Record<string, Project | null>>({});
  const songsRef = useRef(songs);
  songsRef.current = songs;

  const [pos, setPos] = useState<Pos | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [fit, setFit] = useSetting<FitMode>('fit', 'fill');
  const [auto, setAuto] = useSetting<boolean>('auto-advance', false);
  const [reload, setReload] = useState(() => Date.now());
  const [replay, setReplay] = useState(0);
  const [dialog, setDialog] = useState<null | 'add' | 'keys'>(null);

  const songRefs: SongRef[] = useMemo(() => setlist.map((sid) => ({ id: sid, project: songs[sid] ?? null })), [setlistKey, songs]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = setlist.every((sid) => sid in songs);

  const state = useRef({ songRefs, pos, ids: setlist });
  state.current = { songRefs, pos, ids: setlist };

  /* Lê os louvores do IndexedDB. Ao voltar o foco para esta janela, relê e só manda o telão
     recarregar se alguma letra/estilo realmente mudou (evita trabalho à toa durante o culto). */
  const load = useCallback(async (ids: string[]) => {
    await loadCustomFonts().catch(() => undefined);
    const got = await Promise.all(
      ids.map(async (sid) => {
        try {
          const p = await getProject(sid);
          return [sid, p && !p.deletedAt ? p : null] as const;
        } catch {
          return [sid, null] as const;
        }
      }),
    );
    const prev = songsRef.current;
    const next = { ...prev };
    let changed = false;
    for (const [sid, p] of got) {
      const old = prev[sid];
      if (old === undefined) next[sid] = p;
      else if ((old?.updatedAt ?? -1) !== (p?.updatedAt ?? -1)) {
        next[sid] = p;
        changed = true;
      }
    }
    setSongs(next);
    if (changed) setReload(Date.now());
  }, []);

  useEffect(() => {
    const missing = setlist.filter((sid) => !(sid in songsRef.current));
    if (missing.length) void load(missing);
  }, [setlistKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFocus = () => void load(state.current.ids);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // posição inicial: primeiro trecho — ou, se a página foi recarregada no meio do culto, de onde estava
  useEffect(() => {
    if (pos || !ready) return;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const stored = nav?.type === 'reload' ? readStoredState() : null;
    let start: Pos | null = null;
    if (stored?.projectId && setlist.includes(stored.projectId)) start = clampPos(songRefs, { songId: stored.projectId, index: stored.index });
    setPos(start ?? firstPos(songRefs, id));
  }, [ready, pos, songRefs, id, setlist]);

  // trecho que sumiu (editado em outra aba) ou louvor removido: reposiciona sem quebrar
  useEffect(() => {
    if (!pos || !ready) return;
    const fixed = clampPos(songRefs, pos);
    if (!fixed) {
      const any = songRefs.map((s) => firstPos(songRefs, s.id)).find(Boolean) ?? null;
      setPos(any);
    } else if (fixed.index !== pos.index || fixed.songId !== pos.songId) setPos(fixed);
  }, [songRefs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ navegação ------------------------------ */
  const go = useCallback((p: Pos | null) => {
    if (!p) return false;
    setPos(p);
    setBlackout(false); // avançar sempre tira a tela preta
    return true;
  }, []);

  const exit = useCallback(async () => {
    const ok = await confirmDialog({
      title: tr('Sair da apresentação?'),
      message: tr('A janela do telão continua aberta com o trecho atual. Você pode voltar a qualquer momento.'),
      confirmLabel: tr('Sair'),
    });
    if (ok) navigate(paths.library);
  }, []);

  const dispatch = useCallback(
    (a: PresentAction) => {
      const { songRefs: list, pos: cur } = state.current;
      if (a.type === 'exit') return void exit();
      if (a.type === 'fullscreen') return void toggleFullscreen();
      if (a.type === 'blackout') return setBlackout((b) => !b);
      if (a.type === 'replay') return setReplay((r) => r + 1);
      if (!cur) return;
      switch (a.type) {
        case 'next':
          if (!go(nextPos(list, cur))) toast(tr('Fim do roteiro'), 'info');
          break;
        case 'prev':
          go(prevPos(list, cur));
          break;
        case 'first':
          go(firstPos(list, cur.songId));
          break;
        case 'last':
          go(lastPos(list, cur.songId));
          break;
        case 'nextSong':
          if (!go(nextSongPos(list, cur.songId))) toast(tr('Este é o último louvor do roteiro'), 'info');
          break;
        case 'prevSong':
          go(prevSongPos(list, cur.songId));
          break;
        case 'jump': {
          const idx = playableIndices(list.find((s) => s.id === cur.songId)?.project)[a.index];
          if (idx !== undefined) go({ songId: cur.songId, index: idx });
          break;
        }
      }
    },
    [go, exit],
  );

  /* ------------------------------- telão ------------------------------- */
  const busRef = useRef<LiveBus | null>(null);
  const seq = useRef(Date.now());
  const link = useRef<Link>({ helloAt: 0, fs: false });
  const liveRef = useRef<LiveState | null>(null);

  const current = pos ? (songs[pos.songId] ?? null) : null;
  const slide = current && pos ? (current.slides[pos.index] ?? null) : null;

  const preload = useMemo(() => {
    const cur = songRefs.findIndex((s) => s.id === pos?.songId);
    return cur < 0 ? [] : songRefs.slice(cur + 1, cur + 3).filter((s) => s.project).map((s) => s.id);
  }, [songRefs, pos?.songId]);
  const preloadKey = preload.join('|');

  useEffect(() => {
    const bus = new LiveBus();
    busRef.current = bus;
    const off = bus.onOperatorMessage((m) => {
      if (m.t === 'hello') {
        link.current.helloAt = Date.now();
        // o telão acabou de abrir (ou reabriu): reenvia o estado atual
        if (liveRef.current) bus.sendState(liveRef.current);
      } else if (m.t === 'bye') link.current.helloAt = 0;
      else if (m.t === 'fs') link.current.fs = m.on;
      else if (m.t === 'key') dispatch(m.action);
    });
    return () => {
      off();
      bus.close();
      busRef.current = null;
    };
  }, [dispatch]);

  // publica o estado no telão a cada mudança
  useEffect(() => {
    if (!pos || !busRef.current) return;
    const s: LiveState = { projectId: pos.songId, index: pos.index, blackout, fit, reload, replay, preload: preloadKey ? preloadKey.split('|') : [], seq: ++seq.current };
    liveRef.current = s;
    busRef.current.sendState(s);
  }, [pos?.songId, pos?.index, blackout, fit, reload, replay, preloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // aquece o fundo (vídeo!) do próximo trecho também aqui no console
  const nextP = pos ? nextPos(songRefs, pos) : null;
  const nextSong = nextP ? (songs[nextP.songId] ?? null) : null;
  const nextSlide = nextSong && nextP ? (nextSong.slides[nextP.index] ?? null) : null;
  useEffect(() => {
    if (nextSlide && nextSong) void warmMedia(resolveBackground(nextSlide, nextSong.theme).mediaId);
  }, [nextSlide, nextSong]);

  /* ------------------------ avanço automático (opcional) ------------------------ */
  const autoSecs = slide?.duration ?? 0;
  useEffect(() => {
    const { songRefs: list, pos: cur } = state.current;
    if (!auto || blackout || autoSecs <= 0 || !cur) return;
    const n = nextPos(list, cur);
    if (!n || n.songId !== cur.songId) return; // nunca atravessa sozinho para outro louvor
    const t = setTimeout(() => dispatch({ type: 'next' }), autoSecs * 1000);
    return () => clearTimeout(t);
  }, [auto, blackout, autoSecs, pos?.songId, pos?.index, replay, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------- teclado ------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[role="menu"]')) return;
      const a = keyToAction(e);
      if (!a) return;
      // quem navega com Tab até um botão e aperta Espaço/Enter está acionando o botão
      if ((e.key === ' ' || e.key === 'Enter') && t?.matches?.('button:focus-visible, a:focus-visible, [role="radio"]:focus-visible')) return;
      e.preventDefault();
      dispatch(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  /* -------------------------------- vista -------------------------------- */
  const playable = useMemo(() => playableIndices(current), [current]);
  const number = pos ? playable.indexOf(pos.index) + 1 : 0;
  const nextIsOtherSong = !!nextP && !!pos && nextP.songId !== pos.songId;

  const changeSetlist = (next: string[]) => setSetlist(next);
  const removeSong = (sid: string) => {
    if (sid === pos?.songId) return toast(tr('Troque de louvor antes de retirar este do roteiro'), 'info');
    changeSetlist(setlist.filter((x) => x !== sid));
  };

  if (ready && !pos) {
    const missing = songs[id] === null;
    return (
      <div className="op op-empty">
        <div className="op-empty-box">
          <LogoMark size={34} />
          <h1>{missing ? tr('Louvor não encontrado') : tr('Este louvor ainda não tem letra')}</h1>
          <p>{missing ? tr('Ele pode ter sido excluído deste computador.') : tr('Adicione a letra no editor para poder apresentar.')}</p>
          <div className="op-empty-actions">
            <Button onClick={() => navigate(paths.library)}>{tr('Biblioteca')}</Button>
            {!missing && (
              <Button variant="primary" icon={<LuPenLine />} onClick={() => navigate(paths.edit(id))}>
                {tr('Abrir o editor')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const ratio = current ? ASPECT_RATIOS[current.aspect] : 16 / 9;

  return (
    <div className="op" onClickCapture={(e: ReactMouseEvent) => (e.target as HTMLElement).closest('button')?.blur()}>
      <header className="op-top">
        <div className="op-top-l">
          <IconButton label={tr('Voltar à biblioteca')} icon={<LuChevronLeft />} onClick={() => navigate(paths.library)} />
          <span className="op-logo" aria-hidden>
            <LogoMark size={20} />
          </span>
          <div className="op-title">
            <b>{current?.name ?? '…'}</b>
            <span>{current?.artist || tr('Modo de apresentação')}</span>
          </div>
          {pos && (
            <span className="op-count" aria-label={tr('Trecho {0} de {1}', number, playable.length)}>
              <b>{number}</b>/{playable.length}
            </span>
          )}
        </div>
        <div className="op-top-r">
          <OutputControls bus={busRef} link={link} />
          <IconButton label={tr('Atalhos de teclado')} icon={<LuKeyboard />} onClick={() => setDialog('keys')} />
          <SettingsButton initial="present" />
          <ThemeToggle />
        </div>
      </header>

      <div className="op-body">
        <aside className="op-rail" aria-label={tr('Roteiro do culto')}>
          <div className="op-rail-head">
            <h2>
              <LuListMusic aria-hidden />{' '}{tr('Roteiro')}
            </h2>
            <Button size="sm" icon={<LuPlus />} onClick={() => setDialog('add')}>
              {tr('Louvor')}
            </Button>
          </div>
          <ol className="op-songs">
            {songRefs.map((s, i) => {
              const on = s.id === pos?.songId;
              const slidesN = playableIndices(s.project).length;
              return (
                <li key={s.id} className="op-song" data-on={on ? '1' : '0'} data-gone={s.project ? '0' : '1'}>
                  <button
                    type="button"
                    className="op-song-main"
                    disabled={!s.project || !slidesN}
                    onClick={() => go(firstPos(songRefs, s.id))}
                    title={slidesN ? tr('Ir para o primeiro trecho deste louvor') : s.project ? tr('Sem letra') : tr('Louvor não encontrado')}
                  >
                    <span className="op-song-n">{on ? <LuMonitorPlay aria-label={tr('No ar')} /> : i + 1}</span>
                    <span className="op-song-t">
                      <b>{s.project?.name ?? (songs[s.id] === undefined ? tr('Carregando…') : tr('Louvor não encontrado'))}</b>
                      <small>{s.project ? `${slidesN} ${slidesN === 1 ? tr('trecho') : tr('trechos')}${s.project.artist ? ` · ${s.project.artist}` : ''}` : ' '}</small>
                    </span>
                  </button>
                  <span className="op-song-tools">
                    <IconButton size="sm" label={tr('Subir no roteiro')} icon={<LuArrowUp />} disabled={i === 0} onClick={() => changeSetlist(move(setlist, i, i - 1))} />
                    <IconButton size="sm" label={tr('Descer no roteiro')} icon={<LuArrowDown />} disabled={i === songRefs.length - 1} onClick={() => changeSetlist(move(setlist, i, i + 1))} />
                    <IconButton size="sm" label={tr('Retirar do roteiro')} icon={<LuTrash2 />} disabled={on} onClick={() => removeSong(s.id)} />
                  </span>
                </li>
              );
            })}
          </ol>
          {songRefs.length > 1 && (
            <button type="button" className="op-clear" onClick={() => changeSetlist(pos ? [pos.songId] : [id])}>
              {tr('Limpar roteiro (manter o louvor atual)')}
            </button>
          )}
        </aside>

        <main className="op-main">
          <div className="op-monitors">
            <section className="op-mon op-mon-live" aria-label={tr('Ao vivo')}>
              <header>
                <span className="op-tag op-tag-live">
                  <i />{' '}{tr('Ao vivo')}
                </span>
                {blackout && <span className="op-tag op-tag-black">{tr('Tela preta')}</span>}
                <span className="op-mon-label">{slide?.label}</span>
              </header>
              <div className="op-mon-view" style={{ '--ratio': String(ratio) } as CSSProperties}>
                <FitBox ratio={ratio}>{current && <Stage theme={current.theme} slide={slide} mode="live" replayKey={replay} blackout={blackout} />}</FitBox>
              </div>
              {auto && autoSecs > 0 && pos && nextP && nextP.songId === pos.songId && <i key={`${pos.songId}${pos.index}${replay}`} className="op-auto" style={{ animationDuration: `${autoSecs}s` }} />}
            </section>

            <section className="op-mon op-mon-next" aria-label={tr('Próximo trecho')}>
              <header>
                <span className="op-tag">{tr('Próximo')}</span>
                {nextIsOtherSong && nextSong && <span className="op-tag op-tag-song">{tr('Novo louvor ·')}{' '}{nextSong.name}</span>}
                {!nextIsOtherSong && nextSlide && <span className="op-mon-label">{nextSlide.label}</span>}
              </header>
              <div className="op-mon-view" style={{ '--ratio': String(nextSong ? ASPECT_RATIOS[nextSong.aspect] : ratio) } as CSSProperties}>
                {nextSong && nextSlide ? (
                  <FitBox ratio={ASPECT_RATIOS[nextSong.aspect]}>
                    <Stage theme={nextSong.theme} slide={nextSlide} mode="static" />
                  </FitBox>
                ) : (
                  <div className="op-end">{tr('Fim do roteiro')}</div>
                )}
              </div>
            </section>
          </div>

          {slide?.notes.trim() && (
            <div className="op-notes" role="note">
              <b>{tr('Nota')}</b> {slide.notes}
            </div>
          )}

          <div className="op-transport">
            <Button size="lg" icon={<LuChevronLeft />} onClick={() => dispatch({ type: 'prev' })} title={tr('Trecho anterior (←)')}>
              {tr('Anterior')}
            </Button>
            <Button size="lg" variant="primary" className="op-next" onClick={() => dispatch({ type: 'next' })} title={tr('Próximo trecho (→ ou Espaço)')}>
              {tr('Próximo')}{' '}<LuChevronRight />
            </Button>
            <span className="op-sep" />
            <button type="button" className="op-tool" data-on={blackout ? '1' : '0'} aria-pressed={blackout} onClick={() => setBlackout((b) => !b)} title={tr('Tela preta (B)')}>
              <LuMoon aria-hidden />{' '}{tr('Tela preta')}
            </button>
            <button type="button" className="op-tool" onClick={() => setReplay((r) => r + 1)} title={tr('Repetir a animação (R)')}>
              <LuRotateCcw aria-hidden />{' '}{tr('Repetir')}
            </button>
            <span className="op-sep" />
            <label className="op-auto-sw" title={tr('Avança sozinho nos trechos que têm duração definida no editor')}>
              <LuTimer aria-hidden />{' '}{tr('Avanço automático')}
              <Switch checked={auto} onChange={setAuto} label={tr('Avanço automático')} />
            </label>
            <span className="op-grow" />
            <Segmented<FitMode>
              size="sm"
              label={tr('Ajuste da imagem no telão')}
              value={fit}
              onChange={setFit}
              options={[
                { value: 'fill', label: tr('Preencher'), title: tr('A imagem ocupa toda a tela') },
                { value: 'letterbox', label: tr('Barras pretas'), title: tr('Mantém a proporção do projeto, com barras pretas se necessário') },
              ]}
            />
          </div>
        </main>

        <aside className="op-slides" aria-label={tr('Trechos do louvor')}>
          <div className="op-rail-head">
            <h2>{tr('Trechos')}</h2>
            {pos && (
              <Button size="sm" icon={<LuPenLine />} onClick={() => navigate(paths.edit(pos.songId))} title={tr('Abrir este louvor no editor')}>
                {tr('Editar')}
              </Button>
            )}
          </div>
          <div className="op-slide-list">
            {current &&
              pos &&
              playable.map((idx, n) => {
                const s = current.slides[idx];
                const isCur = idx === pos.index;
                const isNext = !nextIsOtherSong && nextP?.index === idx && nextP.songId === pos.songId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="op-slide"
                    data-current={isCur ? '1' : '0'}
                    data-next={isNext ? '1' : '0'}
                    ref={(el: HTMLButtonElement | null) => {
                      if (el && isCur) el.scrollIntoView({ block: 'nearest' });
                    }}
                    onClick={() => go({ songId: pos.songId, index: idx })}
                    title={slideText(s).split('\n')[0]}
                  >
                    <LazyMount className="op-slide-thumb">
                      <SlideThumb slide={s} theme={current.theme} aspect={current.aspect} />
                    </LazyMount>
                    <span className="op-slide-meta">
                      <b>{n + 1}</b>
                      <span>{s.label || slideText(s).split('\n')[0]}</span>
                      {isCur && <em>{tr('No ar')}</em>}
                      {isNext && <em className="op-next-tag">{tr('Próximo')}</em>}
                    </span>
                  </button>
                );
              })}
          </div>
        </aside>
      </div>

      <AddSongDialog open={dialog === 'add'} onClose={() => setDialog(null)} existing={setlist} onAdd={(sid) => changeSetlist([...setlist, sid])} />
      <Modal open={dialog === 'keys'} onClose={() => setDialog(null)} title={tr('Atalhos da apresentação')} description={tr('Clique em + para trocar ou adicionar uma tecla.')} width={520} footer={<Button onClick={() => setDialog(null)}>{tr('Fechar')}</Button>}>
        <ShortcutsEditor />
      </Modal>
    </div>
  );
}

/* ---------------------------- controles do telão ---------------------------- */

function OutputControls({ bus, link }: { bus: MutableRefObject<LiveBus | null>; link: MutableRefObject<Link> }) {
  const now = useNow(1000);
  const connected = now - link.current.helloAt < 5500;
  const [screens, setScreens] = useState<ScreenInfo[]>([]);

  // se a permissão de múltiplos monitores já foi dada antes, lista sem perguntar de novo
  useEffect(() => {
    let alive = true;
    void screenAccess().then((a) => {
      if (a === 'granted')
        detectScreens()
          .then((s) => alive && setScreens(s))
          .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  const detect = async () => {
    try {
      const s = await detectScreens();
      setScreens(s);
      toast(s.length > 1 ? tr('{0} monitores encontrados', s.length) : tr('Só um monitor encontrado'), 'info');
    } catch {
      toastError(tr('Permissão para ver os monitores negada. Abra o telão em uma janela e arraste-a até o projetor.'));
    }
  };

  const open = (screen?: ScreenInfo) => {
    const w = openOutputWindow(screen);
    if (!w) return toastError(tr('O navegador bloqueou a janela do telão. Permita pop-ups para este endereço e tente de novo.'));
    toast(screen ? tr('Telão aberto em {0}. Clique nele ou aperte F para a tela cheia.', screen.label) : tr('Telão aberto. Arraste a janela até o projetor e aperte F nela.'), 'info', 5500);
  };

  const askFullscreen = () => {
    bus.current?.sendToOutput({ t: 'fullscreen' });
    // o navegador só aceita tela cheia após um clique DENTRO da janela do telão
    setTimeout(() => {
      if (!link.current.fs) toast(tr('O navegador exige um clique na janela do telão (ou a tecla F nela) para entrar em tela cheia.'), 'info', 6000);
    }, 700);
  };

  const closeOutput = () => {
    bus.current?.sendToOutput({ t: 'close' });
    closeOutputWindow();
    link.current.helloAt = 0;
  };

  const external = screens.find((s) => !s.isCurrent);
  const items: MenuItem[] = [
    ...screens.map((s): MenuItem => ({ label: `${s.label}${s.isCurrent ? tr(' (esta tela)') : ''}`, hint: `${s.width}×${s.height}`, icon: <LuMonitor />, onClick: () => open(s) })),
    ...(screens.length ? [{ divider: true } as MenuItem] : []),
    { label: tr('Abrir em uma janela'), icon: <LuExternalLink />, onClick: () => open() },
    hasWindowManagement
      ? { label: screens.length ? tr('Atualizar lista de monitores') : tr('Detectar monitores…'), icon: <LuCast />, onClick: () => void detect() }
      : { label: tr('Este navegador não lista monitores'), icon: <LuCast />, disabled: true, hint: tr('use Chrome/Edge') },
    { divider: true },
    { label: tr('Telão em tela cheia'), icon: <LuMaximize />, disabled: !connected, onClick: askFullscreen },
    { label: tr('Fechar o telão'), icon: <LuX />, danger: true, disabled: !connected && !getOutputWindow(), onClick: closeOutput },
  ];

  return (
    <div className="op-out">
      <span className="op-conn" data-on={connected ? '1' : '0'} role="status" title={connected ? (link.current.fs ? tr('Telão conectado, em tela cheia') : tr('Telão conectado')) : tr('Nenhuma janela de telão aberta')}>
        <i aria-hidden />
        {connected ? (link.current.fs ? tr('Telão em tela cheia') : tr('Telão conectado')) : tr('Telão desligado')}
      </span>
      <div className="op-split">
        <Button variant={connected ? 'soft' : 'primary'} icon={<LuMonitorPlay />} onClick={() => open(external)}>
          {connected ? tr('Telão') : tr('Abrir telão')}
        </Button>
        <Menu
          align="end"
          width={290}
          items={items}
          trigger={(isOpen, toggle) => (
            <button type="button" className="op-split-more btn btn-soft btn-md" aria-label={tr('Opções do telão')} aria-expanded={isOpen} onClick={toggle}>
              <LuChevronDown aria-hidden />
            </button>
          )}
        />
      </div>
    </div>
  );
}

/* ---------------------------- adicionar ao roteiro ---------------------------- */

function AddSongDialog({ open, onClose, existing, onAdd }: { open: boolean; onClose: () => void; existing: string[]; onAdd: (id: string) => void }) {
  const [all, setAll] = useState<Project[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setQ('');
    listProjects()
      .then((l) => alive && setAll(l.filter((p) => !p.isTemplate && !p.deletedAt)))
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const term = q.trim().toLowerCase();
  const list = (all ?? []).filter((p) => !existing.includes(p.id) && (!term || `${p.name} ${p.artist} ${p.category}`.toLowerCase().includes(term)));

  return (
    <Modal open={open} onClose={onClose} title={tr('Adicionar ao roteiro')} description={tr('Escolha os louvores que serão apresentados em seguida.')} width={520} footer={<Button onClick={onClose}>{tr('Pronto')}</Button>}>
      <div className="op-add-search">
        <LuSearch aria-hidden />
        <input className="input" placeholder={tr('Buscar por nome, artista ou categoria')} value={q} onChange={(e) => setQ(e.currentTarget.value)} autoFocus />
      </div>
      <ul className="op-add-list">
        {all === null && <li className="op-add-empty">{tr('Carregando…')}</li>}
        {all !== null && !list.length && <li className="op-add-empty">{all.length && !term ? tr('Todos os louvores já estão no roteiro.') : tr('Nenhum louvor encontrado.')}</li>}
        {list.map((p) => {
          const n = playableIndices(p).length;
          return (
            <li key={p.id}>
              <button type="button" disabled={!n} onClick={() => onAdd(p.id)} title={n ? tr('Adicionar ao fim do roteiro') : tr('Este louvor ainda não tem letra')}>
                <span>
                  <b>{p.name}</b>
                  <small>{[p.artist, p.category, `${n} ${n === 1 ? tr('trecho') : tr('trechos')}`].filter(Boolean).join(' · ')}</small>
                </span>
                <LuPlus aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
