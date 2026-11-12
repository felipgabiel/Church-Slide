import { SYSTEM_SANS } from './defaults';
import { tr } from './i18n';

export interface FontOption {
  label: string;
  /** Valor de `font-family` (com fallbacks). */
  value: string;
  group: 'Sans-serif' | 'Serifa' | 'Destaque' | 'Mono' | 'Minhas fontes';
  /** Nome usado para detectar se a fonte está instalada. */
  probe?: string;
}

/** Poppins vem embutida no app (src/assets/fonts); as demais da lista são só fallback. */
export const POPPINS_STACK = '"Poppins", "Montserrat", "Segoe UI Black", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const CANDIDATES: FontOption[] = [
  { label: tr('Poppins (embutida)'), value: POPPINS_STACK, group: 'Destaque' },
  { label: tr('Padrão do sistema'), value: SYSTEM_SANS, group: 'Sans-serif' },
  { label: tr('Arial'), value: 'Arial, Helvetica, sans-serif', group: 'Sans-serif', probe: 'Arial' },
  { label: tr('Helvetica Neue'), value: '"Helvetica Neue", Helvetica, Arial, sans-serif', group: 'Sans-serif', probe: 'Helvetica Neue' },
  { label: tr('Segoe UI'), value: '"Segoe UI", system-ui, sans-serif', group: 'Sans-serif', probe: 'Segoe UI' },
  { label: tr('Verdana'), value: 'Verdana, Geneva, sans-serif', group: 'Sans-serif', probe: 'Verdana' },
  { label: tr('Trebuchet MS'), value: '"Trebuchet MS", sans-serif', group: 'Sans-serif', probe: 'Trebuchet MS' },
  { label: tr('Tahoma'), value: 'Tahoma, Geneva, sans-serif', group: 'Sans-serif', probe: 'Tahoma' },
  { label: tr('Gill Sans'), value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif', group: 'Sans-serif', probe: 'Gill Sans' },
  { label: tr('Optima'), value: 'Optima, Candara, sans-serif', group: 'Sans-serif', probe: 'Optima' },
  { label: tr('Calibri'), value: 'Calibri, Carlito, sans-serif', group: 'Sans-serif', probe: 'Calibri' },
  { label: tr('Georgia'), value: 'Georgia, serif', group: 'Serifa', probe: 'Georgia' },
  { label: tr('Palatino'), value: '"Palatino Linotype", Palatino, "Book Antiqua", serif', group: 'Serifa', probe: 'Palatino Linotype' },
  { label: tr('Times New Roman'), value: '"Times New Roman", Times, serif', group: 'Serifa', probe: 'Times New Roman' },
  { label: tr('Garamond'), value: 'Garamond, "EB Garamond", serif', group: 'Serifa', probe: 'Garamond' },
  { label: tr('Cambria'), value: 'Cambria, serif', group: 'Serifa', probe: 'Cambria' },
  { label: tr('Impact'), value: 'Impact, "Arial Narrow Bold", sans-serif', group: 'Destaque', probe: 'Impact' },
  { label: tr('Arial Black'), value: '"Arial Black", Gadget, sans-serif', group: 'Destaque', probe: 'Arial Black' },
  { label: tr('Copperplate'), value: 'Copperplate, "Copperplate Gothic Light", fantasy', group: 'Destaque', probe: 'Copperplate' },
  { label: tr('Brush Script'), value: '"Brush Script MT", "Segoe Script", cursive', group: 'Destaque', probe: 'Brush Script MT' },
  { label: tr('Courier New'), value: '"Courier New", Courier, monospace', group: 'Mono', probe: 'Courier New' },
];

let installedCache: Set<string> | null = null;

/** Detecta (por medição em canvas) quais fontes do catálogo existem neste computador. */
function detectInstalled(): Set<string> {
  if (installedCache) return installedCache;
  const found = new Set<string>();
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const sample = 'mmmmmmmmmmlli0WÀÇ';
      const measure = (family: string) => {
        ctx.font = `72px ${family}`;
        return ctx.measureText(sample).width;
      };
      const bases = ['monospace', 'serif', 'sans-serif'];
      const baseWidths = bases.map((b) => measure(b));
      for (const c of CANDIDATES) {
        if (!c.probe) continue;
        const differs = bases.some((b, i) => measure(`"${c.probe}", ${b}`) !== baseWidths[i]);
        if (differs) found.add(c.probe);
      }
    }
  } catch {
    /* sem canvas: mostra o catálogo inteiro */
  }
  installedCache = found;
  return found;
}

export interface CustomFont {
  id: string;
  family: string;
  name: string;
}

/** Catálogo exibido ao usuário: fontes instaladas + fontes enviadas por ele. */
export function getFontOptions(custom: CustomFont[] = []): FontOption[] {
  const installed = detectInstalled();
  const base = CANDIDATES.filter((c) => !c.probe || installed.size === 0 || installed.has(c.probe));
  const mine: FontOption[] = custom.map((f) => ({
    label: f.name,
    value: `"${f.family}", ${SYSTEM_SANS}`,
    group: 'Minhas fontes',
  }));
  return [...mine, ...base];
}
