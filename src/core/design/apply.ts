import { defaultBackground } from '../defaults';
import { getProject, saveProject } from '../storage/projects';
import type { Background, BackgroundDesign, Project } from '../types';

/**
 * Fundo de slide feito a partir de um fundo do Estúdio. Guarda uma CÓPIA do desenho
 * (decisão de produto: cada louvor fica com a sua; editar "Meus fundos" depois não muda louvores prontos).
 * O id do original é mantido para o editor saber de onde veio e oferecer "atualizar".
 */
export function designBackground(design: BackgroundDesign, keep?: Background): Background {
  const base = keep ? { ...keep } : defaultBackground();
  return { ...base, kind: 'design', color: design.base, design: structuredClone(design) };
}

/** Aplica o fundo a todos os trechos de um louvor (vira o fundo do tema; fundos próprios dos trechos saem). */
export async function applyDesignToProject(projectId: string, design: BackgroundDesign): Promise<Project | null> {
  const p = await getProject(projectId);
  if (!p) return null;
  p.theme.background = designBackground(design);
  for (const s of p.slides) s.background = null;
  return saveProject(p);
}

/**
 * Volta do estúdio para o louvor de origem: troca SÓ os fundos que eram cópia deste mesmo fundo
 * (no tema e nos trechos), mantendo brilho, desfoque e velocidade escolhidos no louvor.
 * Se o louvor não usava este fundo em lugar nenhum, aplica em todos os trechos.
 */
export async function updateDesignInProject(projectId: string, design: BackgroundDesign): Promise<Project | null> {
  const p = await getProject(projectId);
  if (!p) return null;
  let hits = 0;
  const swap = (bg: Background): Background => {
    if (bg.kind === 'design' && bg.design?.id === design.id) {
      hits++;
      return designBackground(design, bg);
    }
    return bg;
  };
  p.theme.background = swap(p.theme.background);
  for (const s of p.slides) if (s.background) s.background = swap(s.background);
  if (!hits) return applyDesignToProject(projectId, design);
  return saveProject(p);
}
