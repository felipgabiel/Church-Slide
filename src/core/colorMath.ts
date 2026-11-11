/** Conversões de cor para o seletor (HSV ↔ hexadecimal). Funções puras. */

export interface HSV {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normaliza para `#rrggbb` minúsculo; null se não for hexadecimal válido. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  if (!m) return null;
  const x = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${x.toLowerCase()}`;
}

export function hexToHsv(hex: string): HSV {
  const h6 = normalizeHex(hex) ?? '#000000';
  const r = parseInt(h6.slice(1, 3), 16) / 255;
  const g = parseInt(h6.slice(3, 5), 16) / 255;
  const b = parseInt(h6.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}
