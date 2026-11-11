/**
 * Partículas do fundo "Bokeh". Determinísticas (sem Math.random) e compartilhadas entre o fundo
 * ao vivo (CSS) e o exportador de vídeo (canvas), para os dois desenharem exatamente o mesmo.
 */
export interface BokehParticle {
  /** posição horizontal, % da largura */
  left: number;
  /** diâmetro, % da altura */
  size: number;
  /** atraso (negativo = já começa "no meio" do ciclo), segundos */
  delay: number;
  /** duração de um ciclo, segundos */
  dur: number;
  /** qual das 3 cores do fundo (0, 1 ou 2) */
  hue: number;
}

export const BOKEH: BokehParticle[] = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 * n) * 43758.5453;
    return x - Math.floor(x);
  };
  return { left: r(1) * 100, size: 8 + r(2) * 22, delay: -r(3) * 24, dur: 16 + r(4) * 18, hue: Math.floor(r(5) * 3) };
});
