/**
 * Suporte a múltiplos monitores/projetores.
 *
 * Melhor caso (Chrome/Edge/Opera): Window Management API — `getScreenDetails()`
 * lista os monitores e permite abrir a janela do telão já posicionada sobre o
 * monitor externo. Depois basta um clique no telão para entrar em tela cheia
 * (o navegador exige um gesto do usuário *naquela* janela).
 *
 * Fallback (Firefox/Safari ou permissão negada): abrimos a janela do telão e o
 * operador a arrasta para o projetor; tecla F ou clique ativa a tela cheia.
 */

export interface ScreenInfo {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary: boolean;
  isCurrent: boolean;
}

interface ScreenDetailed {
  availLeft?: number;
  availTop?: number;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary?: boolean;
  label?: string;
}
interface ScreenDetailsLike {
  screens: ScreenDetailed[];
  currentScreen: ScreenDetailed;
}

export const hasWindowManagement = typeof window !== 'undefined' && 'getScreenDetails' in window;

export type ScreenAccess = 'unsupported' | 'granted' | 'denied' | 'prompt';

export async function screenAccess(): Promise<ScreenAccess> {
  if (!hasWindowManagement) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'window-management' as PermissionName });
    return status.state as ScreenAccess;
  } catch {
    return 'prompt';
  }
}

/** Lista os monitores. Pode abrir o pedido de permissão do navegador (chamar a partir de um clique). */
export async function detectScreens(): Promise<ScreenInfo[]> {
  if (!hasWindowManagement) return [];
  const details = (await (window as unknown as { getScreenDetails(): Promise<ScreenDetailsLike> }).getScreenDetails()) as ScreenDetailsLike;
  return details.screens.map((s, i) => ({
    id: `${s.left},${s.top},${s.width}x${s.height}`,
    label: s.label || (s.isPrimary ? 'Monitor principal' : `Monitor ${i + 1}`),
    left: s.left,
    top: s.top,
    width: s.width,
    height: s.height,
    isPrimary: !!s.isPrimary,
    isCurrent: s === details.currentScreen || (s.left === details.currentScreen.left && s.top === details.currentScreen.top),
  }));
}

export function outputUrl(): string {
  return `${location.origin}${location.pathname}#/output`;
}

let outputWin: Window | null = null;

export function getOutputWindow(): Window | null {
  if (outputWin && outputWin.closed) outputWin = null;
  return outputWin;
}

/** Abre (ou reaproveita) a janela do telão. Deve ser chamada a partir de um clique. */
export function openOutputWindow(screen?: ScreenInfo): Window | null {
  const existing = getOutputWindow();
  if (existing) {
    try {
      if (screen) {
        existing.moveTo(screen.left, screen.top);
        existing.resizeTo(screen.width, screen.height);
      }
      existing.focus();
    } catch {
      /* alguns navegadores bloqueiam mover janelas */
    }
    return existing;
  }
  const w = screen?.width ?? 1280;
  const h = screen?.height ?? 720;
  const l = screen?.left ?? 80;
  const t = screen?.top ?? 80;
  const win = window.open(outputUrl(), 'church-slide-output', `popup=yes,left=${l},top=${t},width=${w},height=${h}`);
  outputWin = win;
  if (win && screen) {
    try {
      win.moveTo(screen.left, screen.top);
      win.resizeTo(screen.width, screen.height);
    } catch {
      /* ignore */
    }
  }
  return win;
}

export function closeOutputWindow() {
  const w = getOutputWindow();
  try {
    w?.close();
  } catch {
    /* ignore */
  }
  outputWin = null;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function toggleFullscreen(el: HTMLElement = document.documentElement) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen({ navigationUI: 'hide' });
  } catch (err) {
    console.warn('[fullscreen]', err);
  }
}
