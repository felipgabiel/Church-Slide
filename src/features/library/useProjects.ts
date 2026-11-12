import { useCallback, useEffect, useState } from 'react';
import { listProjects } from '../../core/storage/projects';
import type { Project } from '../../core/types';
import { tr } from '../../core/i18n';

/** Carrega todos os projetos (inclusive modelos e itens da lixeira) do IndexedDB. */
export function useProjects() {
  const [state, setState] = useState<{ projects: Project[]; loading: boolean; error: string | null }>({ projects: [], loading: true, error: null });

  const reload = useCallback(async () => {
    try {
      const projects = await listProjects();
      setState({ projects, loading: false, error: null });
    } catch (err) {
      console.error('[library] falha ao listar', err);
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : tr('Não foi possível carregar os projetos.') }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
