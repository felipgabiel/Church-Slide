/**
 * Tamanho do vídeo na proporção do fundo, com lados pares (exigência do H.264). "1080p" é o lado
 * MENOR (1920 × 1080, 1080 × 1080, 1080 × 1920…); formatos mais compridos que 16:9 (21:9) ficam
 * limitados ao lado maior de um 16:9 da mesma resolução, para o codificador aceitar.
 */
export function loopVideoSize(height: number, ratio = 16 / 9) {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const long = (height * 16) / 9;
  const r = ratio >= 1 ? ratio : 1 / ratio;
  let short = height;
  if (short * r > long) short = long / r;
  const a = even(short);
  const b = even(short * r);
  return ratio >= 1 ? { width: b, height: a } : { width: a, height: b };
}
