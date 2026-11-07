import type { PresentAction } from './shortcuts';

/**
 * Comunicação operador ⇄ telão (janelas diferentes, mesma origem).
 *
 * Transporte principal: BroadcastChannel (local, sem internet, latência ≈ 0).
 * Redundância: o estado também é gravado em localStorage — a janela do telão
 * lê o último estado ao abrir e reage ao evento `storage` caso o
 * BroadcastChannel não exista. Cada mensagem leva um `seq` crescente para
 * descartar atrasadas/duplicadas.
 */

export type FitMode = 'fill' | 'letterbox';

export interface LiveState {
  projectId: string | null;
  /** índice do trecho exibido */
  index: number;
  /** tela preta */
  blackout: boolean;
  fit: FitMode;
  /** incrementa quando o operador quer recarregar o projeto (ex.: editou algo) */
  reload: number;
  /** incrementa para repetir a animação do trecho atual */
  replay: number;
  /** louvores que o telão deve deixar prontos (próximos do roteiro), para a troca nunca passar por tela preta */
  preload: string[];
  seq: number;
}

export type ToOutput = { t: 'state'; s: LiveState } | { t: 'fullscreen' } | { t: 'close' };
export type ToOperator = { t: 'hello' } | { t: 'fs'; on: boolean } | { t: 'bye' } | { t: 'key'; action: PresentAction };

const CHANNEL = 'church-slide-live';
const STATE_KEY = 'cs:live-state';

export const emptyLiveState = (): LiveState => ({ projectId: null, index: 0, blackout: false, fit: 'fill', reload: 0, replay: 0, preload: [], seq: 0 });

export function readStoredState(): LiveState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return { ...emptyLiveState(), ...(JSON.parse(raw) as LiveState) };
  } catch {
    return null;
  }
}

function writeStoredState(s: LiveState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* quota/privacidade: segue só com o BroadcastChannel */
  }
}

export class LiveBus {
  private bc: BroadcastChannel | null = null;
  private onStorage: ((e: StorageEvent) => void) | null = null;

  constructor() {
    try {
      this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    } catch {
      this.bc = null;
    }
  }

  /* operador → telão */
  sendState(s: LiveState) {
    writeStoredState(s);
    this.bc?.postMessage({ t: 'state', s } satisfies ToOutput);
  }
  sendToOutput(m: ToOutput) {
    this.bc?.postMessage(m);
  }
  onOperatorMessage(fn: (m: ToOperator) => void): () => void {
    const h = (e: MessageEvent) => fn(e.data as ToOperator);
    this.bc?.addEventListener('message', h);
    return () => this.bc?.removeEventListener('message', h);
  }

  /* telão → operador */
  sendToOperator(m: ToOperator) {
    this.bc?.postMessage(m);
  }
  onOutputMessage(fn: (m: ToOutput) => void): () => void {
    const h = (e: MessageEvent) => fn(e.data as ToOutput);
    this.bc?.addEventListener('message', h);

    // plano B: evento de storage
    this.onStorage = (e: StorageEvent) => {
      if (e.key !== STATE_KEY || !e.newValue) return;
      try {
        fn({ t: 'state', s: { ...emptyLiveState(), ...(JSON.parse(e.newValue) as LiveState) } });
      } catch {
        /* ignora */
      }
    };
    window.addEventListener('storage', this.onStorage);
    return () => {
      this.bc?.removeEventListener('message', h);
      if (this.onStorage) window.removeEventListener('storage', this.onStorage);
    };
  }

  close() {
    this.bc?.close();
    this.bc = null;
  }
}
