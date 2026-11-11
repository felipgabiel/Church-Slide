import { useCallback, useEffect, useState } from 'react';
import { listDesigns, onDesignsChanged } from '../../core/storage/designs';
import type { BackgroundDesign } from '../../core/types';

/** Lista de "Meus fundos", sempre atualizada (o estúdio salva e a galeria/editor acompanham). */
export function useDesigns() {
  const [items, setItems] = useState<BackgroundDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setItems(await listDesigns());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return onDesignsChanged(() => void reload());
  }, [reload]);
  return { items, loading, error, reload };
}
